import { text, password, isCancel } from '@clack/prompts';
import { log as clackLog } from '@clack/prompts';
import { detectAgents } from 'detect-local-agents';
import { clearConfigCache, loadGlobalConfig, getConfigValue } from '../config/config.js';
import {
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_API_KEY,
  DEFAULT_LLM_MODEL,
  BACKEND_NAME_OLLAMA,
  BACKEND_NAME_LMSTUDIO,
  DEFAULT_LMSTUDIO_BASE_URL,
  LMSTUDIO_DEFAULT_MODEL,
} from './constants.js';
import { InitCancelled } from './errors.js';
import type { Logger } from 'pino';
import type { LlmConfig } from '../types.js';

/** Result of the LLM prompts step. */
interface LlmPromptResult {
  baseUrl: string | undefined;
  apiKey: string | undefined;
  model: string | undefined;
}

/** Optional suggestion from agent detection. */
export interface DetectedLlmSuggestion {
  baseUrl: string;
  model: string;
}

/**
 * Load existing global config for pre-filling prompts.
 * Returns `null` if no config exists.
 */
export function loadExistingConfig(): ReturnType<typeof loadGlobalConfig> | null {
  try {
    clearConfigCache();
    return loadGlobalConfig();
  } catch {
    return null;
  }
}

/**
 * Check if a URL points to a local machine. Local LLM providers
 * (Ollama, LM Studio, etc.) don't require an API key.
 */
function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1' ||
      parsed.hostname.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

/**
 * Prompt for LLM configuration (base URL, API key, model).
 * In non-interactive mode, uses env vars or defaults.
 * @throws {InitCancelled} if the user cancels any prompt.
 */
export async function promptLlm(
  nonInteractive: boolean,
  existingConfig: ReturnType<typeof loadGlobalConfig> | null,
  detectedSuggestion?: DetectedLlmSuggestion,
): Promise<LlmPromptResult> {
  const defaultBaseUrl = getConfigValue(
    existingConfig?.llm?.baseUrl,
    'LLM_BASE_URL',
    DEFAULT_LLM_BASE_URL,
  );
  const defaultApiKey = getConfigValue(
    existingConfig?.llm?.apiKey,
    'LLM_API_KEY',
    DEFAULT_LLM_API_KEY,
  );
  const defaultModel = getConfigValue(existingConfig?.llm?.model, 'LLM_MODEL', DEFAULT_LLM_MODEL);

  // Use detected suggestion as defaults if available
  const suggestedBaseUrl = detectedSuggestion?.baseUrl ?? defaultBaseUrl;
  const suggestedModel = detectedSuggestion?.model ?? defaultModel;
  if (nonInteractive) {
    return {
      baseUrl: suggestedBaseUrl,
      apiKey: defaultApiKey,
      model: suggestedModel,
    };
  }

  const baseInput = await text({
    message: `LLM base URL? (optional, press Enter to skip)`,
    initialValue: existingConfig?.llm?.baseUrl || undefined,
    placeholder: suggestedBaseUrl,
    defaultValue: suggestedBaseUrl,
  });

  if (isCancel(baseInput)) {
    throw new InitCancelled();
  }

  const llmBaseUrl = baseInput || undefined;

  if (!llmBaseUrl) {
    return { baseUrl: undefined, apiKey: undefined, model: undefined };
  }

  // Local LLM providers (Ollama, LM Studio, etc.) don't need an API key.
  if (isLocalUrl(llmBaseUrl)) {
    const modelInput = await text({
      message: 'LLM model?',
      initialValue: existingConfig?.llm?.model || undefined,
      placeholder: suggestedModel,
      defaultValue: suggestedModel,
    });

    if (isCancel(modelInput)) {
      throw new InitCancelled();
    }

    const llmModel = modelInput || undefined;
    return { baseUrl: llmBaseUrl, apiKey: undefined, model: llmModel };
  }

  const hasExistingKey = Boolean(existingConfig?.llm?.apiKey);
  const keyInput = await password({
    message: hasExistingKey ? 'LLM API key? (press Enter to keep existing)' : 'LLM API key?',
  });

  if (isCancel(keyInput)) {
    throw new InitCancelled();
  }

  const llmApiKey = keyInput || existingConfig?.llm?.apiKey || undefined;

  const modelInput = await text({
    message: 'LLM model?',
    initialValue: existingConfig?.llm?.model || undefined,
    placeholder: suggestedModel,
    defaultValue: suggestedModel,
  });

  if (isCancel(modelInput)) {
    throw new InitCancelled();
  }

  const llmModel = modelInput || undefined;
  return { baseUrl: llmBaseUrl, apiKey: llmApiKey, model: llmModel };
}

/**
 * Detect a local OpenAI-compatible backend (Ollama or LM Studio) and return a
 * suggested baseUrl/model, or undefined when none is detected. Uses binary
 * presence, not just installation.
 */
export async function detectLocalBackend(log: Logger): Promise<DetectedLlmSuggestion | undefined> {
  try {
    const agents = await detectAgents();
    const ollama = agents.find((a) => a.name === BACKEND_NAME_OLLAMA && a.binary);
    const lmstudio = agents.find((a) => a.name === BACKEND_NAME_LMSTUDIO && a.binary);

    if (ollama) {
      clackLog.info(
        `Detected Ollama → suggested baseUrl: ${DEFAULT_LLM_BASE_URL}, model: ${DEFAULT_LLM_MODEL} (${ollama.binary} ${ollama.version ?? ''})`,
      );
      return { baseUrl: DEFAULT_LLM_BASE_URL, model: DEFAULT_LLM_MODEL };
    }

    if (lmstudio) {
      clackLog.info(
        `Detected LM Studio → suggested baseUrl: ${DEFAULT_LMSTUDIO_BASE_URL}, model: ${LMSTUDIO_DEFAULT_MODEL} (${lmstudio.binary} ${lmstudio.version ?? ''})`,
      );
      return { baseUrl: DEFAULT_LMSTUDIO_BASE_URL, model: LMSTUDIO_DEFAULT_MODEL };
    }

    clackLog.warn(
      'No local OpenAI-compatible backend detected. Install Ollama (free, private) or enter API key manually.',
    );
    return undefined;
  } catch (err) {
    log.debug({ err }, 'detect-local-agents.failed');
    clackLog.warn('Agent detection failed, continuing with manual LLM config');
    return undefined;
  }
}

/**
 * Build the LLM config written to global config. apiKey is optional for local
 * LLMs; falls back to the default ('no-key') when empty. Returns undefined
 * when no baseUrl/model is configured.
 */
export function buildLlmConfig(
  llm: { baseUrl?: string; apiKey?: string; model?: string },
  existingConfig: ReturnType<typeof loadGlobalConfig> | null,
): LlmConfig | undefined {
  const hasLlm = Boolean(llm.baseUrl && llm.model);
  if (!hasLlm) {
    return undefined;
  }

  return {
    baseUrl: llm.baseUrl!,
    apiKey: llm.apiKey || DEFAULT_LLM_API_KEY,
    model: llm.model!,
    timeoutMs: existingConfig?.llm.timeoutMs ?? 1_200_000,
  };
}
