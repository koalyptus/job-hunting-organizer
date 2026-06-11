import { text, password, isCancel, log as clackLog } from '@clack/prompts';
import { clearConfigCache, loadGlobalConfig, getConfigValue } from '../config.js';
import {
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_API_KEY,
  DEFAULT_LLM_MODEL,
  MSG_CANCELLED,
} from './constants.js';

/** Result of the LLM prompts step. */
export interface LlmResult {
  baseUrl: string | undefined;
  apiKey: string | undefined;
  model: string | undefined;
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
 * Prompt for LLM configuration (base URL, API key, model).
 * In non-interactive mode, uses env vars or defaults.
 */
export async function promptLlm(
  nonInteractive: boolean,
  existingConfig: ReturnType<typeof loadGlobalConfig> | null,
): Promise<LlmResult> {
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

  if (nonInteractive) {
    return {
      baseUrl: defaultBaseUrl,
      apiKey: defaultApiKey,
      model: defaultModel,
    };
  }

  const baseInput = await text({
    message: `LLM base URL? (optional, press Enter to skip)`,
    initialValue: existingConfig?.llm?.baseUrl || undefined,
    placeholder: defaultBaseUrl,
    defaultValue: defaultBaseUrl,
  });

  if (isCancel(baseInput)) {
    clackLog.info(MSG_CANCELLED);
    process.exit(0);
  }

  const llmBaseUrl = baseInput || undefined;

  if (!llmBaseUrl) {
    return { baseUrl: undefined, apiKey: undefined, model: undefined };
  }

  const keyInput = await password({
    message: 'LLM API key?',
  });

  if (isCancel(keyInput)) {
    clackLog.info(MSG_CANCELLED);
    process.exit(0);
  }

  const llmApiKey = keyInput;

  const modelInput = await text({
    message: 'LLM model?',
    initialValue: existingConfig?.llm?.model || undefined,
    placeholder: defaultModel,
    defaultValue: defaultModel,
  });

  if (isCancel(modelInput)) {
    clackLog.info(MSG_CANCELLED);
    process.exit(0);
  }

  const llmModel = modelInput || undefined;

  return { baseUrl: llmBaseUrl, apiKey: llmApiKey, model: llmModel };
}
