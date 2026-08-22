/** Default campaign name when none is specified. */
export const DEFAULT_CAMPAIGN = 'default';

/** Supported CV file extensions. */
export const CV_EXTENSIONS = ['.pdf', '.docx', '.md', '.txt'];

/** Knowledge-base subdirectory names. */
export const KB_GITHUB = 'github';

/** Default fetch timeout in milliseconds (30s for Cloudflare-challenged sites). */
export const FETCH_TIMEOUT_MS = 30_000;

/** Markdown divider between prompt message sections. */
export const SECTION_SEPARATOR = '---';

/** Prompt section headings (shared by every prompt builder). */
export const JOB_DESCRIPTION_SECTION_HEADER = '## Job description';
export const CANDIDATE_PROFILE_SECTION_HEADER = '## Candidate profile';
export const TARGET_ROLE_SECTION_HEADER = '## Target role';
export const QUESTION_SECTION_HEADER = '## Question';
export const KNOWLEDGE_BASE_SECTION_HEADER = '## Knowledge base';
export const ADDITIONAL_INSTRUCTIONS_SECTION_HEADER = '## Additional instructions';
export const DAYS_UNTIL_INTERVIEW_SECTION_HEADER = '## Days until interview';
export const WEAK_TOPICS_SECTION_HEADER = '## Weak topics';
export const RETRO_CROSS_REFERENCE_SECTION_HEADER = '## Retro cross-reference';
export const VOICE_SECTION_HEADER = '## Personal voice guide';
