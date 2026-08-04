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

/** Timeout in ms for detectAgents() call to avoid blocking the wizard. */
export const DETECT_AGENTS_TIMEOUT_MS = 3000;
