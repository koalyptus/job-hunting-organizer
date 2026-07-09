import OpenAI from 'openai';
import { performance } from 'node:perf_hooks';
import type { z } from 'zod';
import type { Logger } from 'pino';
import { loadGlobalConfig } from './config.js';
import { createLlmFetch } from './fetch.js';
import type { GlobalConfig, LlmConfig, ChatCompleteOptions, ChatCompleteResult } from './types.js';

/** Default timeout for LLM requests (20 minutes). */
const DEFAULT_LLM_TIMEOUT_MS = 1_200_000;

/** Default temperature for LLM requests. */
const DEFAULT_TEMPERATURE = 0.6;

/** Maximum characters for LLM response preview in error messages. */
const LLM_RESPONSE_PREVIEW_LENGTH = 500;

/**
 * Normalize a base URL for the OpenAI-compatible API.
 * Appends `/v1` when missing so `http://localhost:11434` and
 * `http://localhost:11434/` both resolve to `http://localhost:11434/v1`.
 */
function normalizeBaseUrl(url: string): string {
  if (url.endsWith('/v1')) {
    return url;
  }
  return url.endsWith('/') ? `${url}v1` : `${url}/v1`;
}

/**
 * Resolve an {@link LlmConfig} from an explicit `GlobalConfig` or the
 * global config file (defaults to Ollama localhost if no file exists).
 * Environment variables (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`)
 * take precedence over either source.
 *
 * Callers that already hold a `GlobalConfig` should pass it explicitly
 * rather than relying on the file-system fallback.
 */
export function defaultLlmConfig(global?: GlobalConfig): LlmConfig {
  const config = global ?? loadGlobalConfig();
  return {
    baseUrl: process.env['LLM_BASE_URL'] ?? config.llm.baseUrl,
    apiKey: process.env['LLM_API_KEY'] ?? config.llm.apiKey,
    model: process.env['LLM_MODEL'] ?? config.llm.model,
    timeoutMs: config.llm.timeoutMs,
  };
}

export async function chatComplete(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  config: LlmConfig,
  options: ChatCompleteOptions = {},
  log?: Logger,
): Promise<ChatCompleteResult> {
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;
  const maxTokens = options.maxTokens;
  const jsonMode = options.jsonMode ?? false;
  const timeout = options.timeout ?? DEFAULT_LLM_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? 0;

  log?.info(
    {
      rawTimeoutOption: options.timeout,
      resolvedTimeout: timeout,
      model: config.model,
      baseUrl: config.baseUrl,
    },
    'llm.chatComplete.created',
  );

  const client = new OpenAI({
    baseURL: normalizeBaseUrl(config.baseUrl),
    apiKey: config.apiKey || 'no-key',
    maxRetries,
    timeout,
    fetch: options.fetch ?? createLlmFetch(timeout),
  });

  const start = performance.now();

  const response = await client.chat.completions.create(
    {
      model: config.model,
      messages,
      temperature,
      ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    },
    { signal: options.signal },
  );

  const durationMs = Math.round(performance.now() - start);

  const choice = response.choices?.[0];
  const content = choice?.message?.content ?? '';

  if (!content) {
    // Log the raw response to help debug API format mismatches
    const snippet = JSON.stringify(response).slice(0, LLM_RESPONSE_PREVIEW_LENGTH);
    throw new Error(
      `LLM returned empty or unexpected response (model: ${config.model}). ` +
        `Response preview: ${snippet}`,
    );
  }

  const result: ChatCompleteResult = {
    content,
    model: response.model,
    finishReason: choice?.finish_reason ?? null,
    usage: {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
    durationMs,
  };

  if (log) {
    log.info(
      {
        model: result.model,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        durationMs,
      },
      'llm.complete',
    );
  }

  return result;
}

/**
 * Extract JSON from a string that may contain markdown fences, preamble
 * text, or other surrounding content. Tries three strategies in order:
 *
 * 1. Direct `JSON.parse` (fast path for clean output)
 * 2. Extract from ```json ... ``` fences
 * 3. Find first `{` to last `}` and parse the slice
 *
 * @throws {SyntaxError} if no valid JSON can be extracted.
 */
export function extractJson(raw: string): unknown {
  // Fast path — clean JSON
  try {
    return JSON.parse(raw);
  } catch {
    // not clean JSON, try other strategies
  }

  // Try extracting from markdown fences
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    return JSON.parse(fenceMatch[1]!.trim());
  }

  // Try finding first { to last }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(raw.slice(start, end + 1));
  }

  throw new SyntaxError('No JSON found in LLM response');
}

export function parseJsonResult<T>(content: string, schema?: z.ZodType<T>): T {
  const parsed: unknown = extractJson(content);
  if (schema) {
    return schema.parse(parsed);
  }
  return parsed as T;
}
