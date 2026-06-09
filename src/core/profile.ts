import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from 'pino';
import { readCv } from './cv.js';
import { fetchGithubUser, fetchGithubRepos } from './github.js';
import { chatComplete } from './llm.js';
import { getPackageRoot } from './package.js';
import type { LlmConfig } from './types.js';

/**
 * Options for {@link buildProfile}.
 */
export interface BuildProfileOptions {
  /** Absolute path to the CV file (PDF, DOCX, TXT, or MD). */
  cvPath: string;
  /** GitHub username. */
  githubUser: string;
  /** GitHub personal access token (optional, avoids rate limits). */
  githubToken?: string;
  /** LLM configuration (baseUrl, apiKey, model). */
  llmConfig: LlmConfig;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
  /** Optional pino logger. */
  log?: Logger;
}

/**
 * Result of a successful {@link buildProfile} call.
 */
export interface BuildProfileResult {
  /** The generated profile markdown content (no frontmatter). */
  content: string;
  /** The model identifier that produced the response. */
  model: string;
  /** Wall-clock duration of the LLM request in milliseconds. */
  durationMs: number;
}

/**
 * Load the profile-build prompt template from `prompts/profile-build.md`.
 * Reads from the package root so it works in both source and built layouts.
 * @returns The prompt template string.
 */
async function loadPromptTemplate(): Promise<string> {
  const root = getPackageRoot();
  const promptPath = join(root, 'prompts', 'profile-build.md');
  return readFile(promptPath, 'utf8');
}

/**
 * Build a candidate profile by combining CV text, GitHub data, and an
 * LLM call. Returns the generated markdown content (no frontmatter).
 *
 * The profile follows the schema in PLAN §5 and includes a `## Target
 * roles` section with 2–4 suggested roles.
 * @param options - Build configuration.
 * @returns The generated profile content, model, and duration.
 */
export async function buildProfile(options: BuildProfileOptions): Promise<BuildProfileResult> {
  const { cvPath, githubUser, githubToken, llmConfig, signal, log } = options;

  if (log) {
    log.info({ cvPath, githubUser }, 'profile.build.start');
  }

  // 1. Read CV
  const cv = await readCv(cvPath, log);

  // 2. Fetch GitHub data
  const [user, repos] = await Promise.all([
    fetchGithubUser(githubUser, githubToken, log),
    fetchGithubRepos(githubUser, githubToken, log),
  ]);

  // 3. Load prompt template
  const template = await loadPromptTemplate();

  // 4. Build context for the LLM
  const repoSummary = repos
    .filter((r) => !r.fork && !r.archived)
    .slice(0, 20)
    .map(
      (r) =>
        `- ${r.name}: ${r.description ?? '(no description)'} [${r.language ?? 'unknown'}] ★${r.stargazers_count} — ${r.html_url}`,
    )
    .join('\n');

  const systemMessage = template.split('---').slice(2).join('---').trim();

  const userMessage = `## CV Text

${cv.text}

## GitHub Profile

- Username: ${user.login}
- Name: ${user.name ?? user.login}
- Bio: ${user.bio ?? '(none)'}
- Location: ${user.location ?? '(not specified)'}
- Company: ${user.company ?? '(not specified)'}
- Public repos: ${user.public_repos}
- Followers: ${user.followers}

## GitHub Repositories (non-fork, non-archived, sorted by recent push)

${repoSummary || '(no repos found)'}

---

Generate the profile markdown following the template above.`;

  // 5. Call LLM
  const result = await chatComplete(
    [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ],
    llmConfig,
    { temperature: 0.6, signal },
    log,
  );

  if (log) {
    log.info({ model: result.model, durationMs: result.durationMs }, 'profile.build.done');
  }

  return {
    content: result.content,
    model: result.model,
    durationMs: result.durationMs,
  };
}
