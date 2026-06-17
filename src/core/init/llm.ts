import { text, password, isCancel } from '@clack/prompts';
import { clearConfigCache, loadGlobalConfig, getConfigValue } from '../config.js';
import { DEFAULT_LLM_BASE_URL, DEFAULT_LLM_API_KEY, DEFAULT_LLM_MODEL } from './constants.js';
import { InitCancelled } from './errors.js';

/** Result of the LLM prompts step. */
interface LlmResult {
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
      placeholder: defaultModel,
      defaultValue: defaultModel,
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
    placeholder: defaultModel,
    defaultValue: defaultModel,
  });

  if (isCancel(modelInput)) {
    throw new InitCancelled();
  }

  const llmModel = modelInput || undefined;

  return { baseUrl: llmBaseUrl, apiKey: llmApiKey, model: llmModel };
}
