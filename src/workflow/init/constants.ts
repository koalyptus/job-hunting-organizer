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

/** Environment variable for CV file path. */
export const JHO_CV_PATH = 'JHO_CV_PATH';

/** Environment variable for knowledge-base path. */
export const JHO_KB_PATH = 'JHO_KB_PATH';

/** Environment variable for campaign data root. */
export const JHO_DATA = 'JHO_DATA';

/** Environment variable for global config home. */
export const JHO_CONFIG_HOME = 'JHO_CONFIG_HOME';

// --- Agent detection constants ---

/** Agent name for Ollama (used by detect-local-agents). */
export const BACKEND_NAME_OLLAMA = 'ollama';

/** Agent name for LM Studio (used by detect-local-agents). */
export const BACKEND_NAME_LMSTUDIO = 'lmstudio';

/** Default port for LM Studio local server. */
export const LMSTUDIO_DEFAULT_PORT = 1234;

/** Default LM Studio base URL. */
export const DEFAULT_LMSTUDIO_BASE_URL = `http://localhost:${LMSTUDIO_DEFAULT_PORT}/v1`;

/** Default LM Studio model (auto-selects). */
export const LMSTUDIO_DEFAULT_MODEL = 'auto';
