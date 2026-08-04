// Re-export generic constants from core/constants.ts
export { DEFAULT_CAMPAIGN, CV_EXTENSIONS, KB_GITHUB } from '../constants.js';

/** Default LLM base URL (Ollama local). */
export const DEFAULT_LLM_BASE_URL = 'http://localhost:11434/v1';

/** Default LLM API key (placeholder for providers that don't require one). */
export const DEFAULT_LLM_API_KEY = 'no-key';

/** Default LLM model. */
export const DEFAULT_LLM_MODEL = 'llama3.1';

/** Default log level for new campaigns. */
export const DEFAULT_LOG_LEVEL = 'info';

/** Environment variable for LinkedIn profile URL. */
export const JHO_LINKEDIN_URL = 'JHO_LINKEDIN_URL';

// --- Agent detection constants ---

/** Agent name for Ollama (used by detect-local-agents). */
export const BACKEND_NAME_OLLAMA = 'ollama';

/** Agent name for LM Studio (used by detect-local-agents). */
export const BACKEND_NAME_LMSTUDIO = 'lmstudio';

/** Default port for LM Studio's OpenAI-compatible API. */
export const LMSTUDIO_DEFAULT_PORT = 1234;

/** Default LM Studio base URL. */
export const DEFAULT_LMSTUDIO_BASE_URL = 'http://localhost:1234/v1';

/** Default model name for LM Studio (auto-selects loaded model). */
export const LMSTUDIO_DEFAULT_MODEL = 'auto';
