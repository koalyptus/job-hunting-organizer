// Re-export generic constants from core/constants.ts
export { DEFAULT_CAMPAIGN, CV_EXTENSIONS, KB_GITHUB } from '../constants.js';

/** Default LLM base URL (Ollama local). */
export const DEFAULT_LLM_BASE_URL = 'http://localhost:11434/v1';

/** Default LLM API key (Ollama default). */
export const DEFAULT_LLM_API_KEY = 'ollama';

/** Default LLM model. */
export const DEFAULT_LLM_MODEL = 'llama3.1';

/** Default calendar provider. */
export const DEFAULT_CALENDAR_PROVIDER = 'ics';

/** Default log level for new campaigns. */
export const DEFAULT_LOG_LEVEL = 'info';

/** Message displayed when user cancels a prompt. */
export const MSG_CANCELLED = 'Init cancelled.';

/** Environment variable for LinkedIn profile URL. */
export const JHO_LINKEDIN_URL = 'JHO_LINKEDIN_URL';
