import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from 'pino';
import { readCv } from './cv.js';
import { parseFrontmatter } from './frontmatter.js';
import { fetchGithubUser, fetchGithubRepos } from './github.js';
import { readCachedCv, readCachedGithub, writeCachedCv, writeCachedGithub } from './kb.js';
import { chatComplete } from './llm.js';
import { getPackageRoot } from './package.js';
import type { LlmConfig } from './types.js';

/**
 * Options for {@link buildProfile}.
 */
interface BuildProfileOptions {
  /** Absolute path to the CV file (PDF, DOCX, TXT, or MD). */
  cvPath: string;
  /** GitHub username. */
  githubUser: string;
  /** GitHub personal access token (optional, avoids rate limits). */
  githubToken?: string;
  /** LinkedIn profile URL (optional, included in the generated profile). */
  linkedinUrl?: string;
  /** LLM configuration (baseUrl, apiKey, model). */
  llmConfig: LlmConfig;
  /**
   * Absolute path to the campaign root. When provided, enables
   * knowledge-base caching: CV and GitHub data are read from cache
   * (if available) and written after a fresh fetch.
   */
  campaignRoot?: string;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
  /** Optional pino logger. */
  log?: Logger;
}

/**
 * Result of a successful {@link buildProfile} call.
 */
interface BuildProfileResult {
  /** The generated profile markdown content (no frontmatter). */
  content: string;
  /** The model identifier that produced the response. */
  model: string;
  /** Wall-clock duration of the LLM request in milliseconds. */
  durationMs: number;
}

/**
 * Load and parse the profile-build prompt template from
 * `prompts/profile-build.md`. Returns the parsed frontmatter (with
 * `recommendedTemperature`) and the body (system message).
 * @returns The parsed frontmatter and body.
 */
async function loadPromptTemplate(): Promise<{ temperature: number; body: string }> {
  const root = getPackageRoot();
  const promptPath = join(root, 'prompts', 'profile-build.md');
  const raw = await readFile(promptPath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(raw);
  const temperature =
    typeof frontmatter['recommendedTemperature'] === 'number'
      ? frontmatter['recommendedTemperature']
      : 0.6;
  return { temperature, body };
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
  const { cvPath, githubUser, githubToken, linkedinUrl, llmConfig, campaignRoot, signal, log } =
    options;

  if (log) {
    log.info({ cvPath, githubUser }, 'profile.build.start');
  }

  // 1. Read CV (cache-first when campaignRoot is provided)
  let cv;
  if (campaignRoot) {
    cv = await readCachedCv(campaignRoot, log);
  }
  if (!cv) {
    cv = await readCv(cvPath, log);
    if (campaignRoot) {
      await writeCachedCv(campaignRoot, cv, log);
    }
  }

  // 2. Fetch GitHub data (cache-first when campaignRoot is provided)
  let user;
  let repos;
  if (campaignRoot) {
    const cached = await readCachedGithub(campaignRoot, githubUser, log);
    if (cached) {
      user = cached.user;
      repos = cached.repos;
    }
  }
  if (!user || !repos) {
    [user, repos] = await Promise.all([
      fetchGithubUser(githubUser, githubToken, log),
      fetchGithubRepos(githubUser, githubToken, log),
    ]);
    if (campaignRoot) {
      await writeCachedGithub(campaignRoot, githubUser, user, repos, log);
    }
  }

  // 3. Load prompt template
  const { temperature, body: systemMessage } = await loadPromptTemplate();

  // 4. Build context for the LLM
  const repoSummary = repos
    .filter((r) => !r.fork && !r.archived)
    .slice(0, 20)
    .map(
      (r) =>
        `- ${r.name}: ${r.description ?? '(no description)'} [${r.language ?? 'unknown'}] ★${r.stargazers_count} — ${r.html_url}`,
    )
    .join('\n');

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
${linkedinUrl ? `- LinkedIn: ${linkedinUrl}` : ''}

## GitHub Repositories (non-fork, non-archived, sorted by recent push)

${repoSummary || '(no repos found)'}

---

Generate the profile markdown following the template above.`;

  // 5. Call LLM (throws if empty content)
  const result = await chatComplete(
    [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ],
    llmConfig,
    { temperature, signal },
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
