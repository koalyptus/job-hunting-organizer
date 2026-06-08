import OpenAI from 'openai';
import type { z } from 'zod';
import type { Logger } from 'pino';
import { loadGlobalConfig } from './config.js';
import type { GlobalConfig, LlmConfig, ChatCompleteOptions, ChatCompleteResult } from './types.js';

export function defaultLlmConfig(global?: GlobalConfig): LlmConfig {
  const config = global ?? loadGlobalConfig();
  return {
    baseUrl: process.env['LLM_BASE_URL'] ?? config.llm.baseUrl,
    apiKey: process.env['LLM_API_KEY'] ?? config.llm.apiKey,
    model: process.env['LLM_MODEL'] ?? config.llm.model,
  };
}

export async function chatComplete(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  config: LlmConfig,
  options: ChatCompleteOptions = {},
  log?: Logger,
): Promise<ChatCompleteResult> {
  const temperature = options.temperature ?? 0.6;
  const maxTokens = options.maxTokens;
  const jsonMode = options.jsonMode ?? false;
  const timeout = options.timeout ?? 120_000;

  const client = new OpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
    maxRetries: 0,
    timeout,
  });

  const start = Date.now();

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

  const durationMs = Date.now() - start;

  const choice = response.choices[0];
  const result: ChatCompleteResult = {
    content: choice?.message?.content ?? '',
    model: response.model,
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

export function parseJsonResult<T>(content: string, schema?: z.ZodType<T>): T {
  const parsed: unknown = JSON.parse(content);
  if (schema) {
    return schema.parse(parsed);
  }
  return parsed as T;
}
