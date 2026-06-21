import type { Logger } from 'pino';
import { chatComplete, parseJsonResult } from '../llm.js';
import { loadPromptTemplate } from '../prompts.js';
import { RoleSuggestionSchema } from './role-suggestion-schema.js';
import type { ExtractedJd, RoleSuggestion } from './types.js';
import type { LlmConfig, TargetRole } from '../types.js';

/** Prompt template name (without `.md`). */
const PROMPT_NAME = 'suggest-role';

/** Maximum number of retries when the LLM output fails Zod validation. */
const MAX_RETRIES = 2;

/** Temperature fallback for role-suggestion (low for consistent classification). */
const SUGGEST_ROLE_TEMPERATURE = 0.2;

/**
 * Format an {@link ExtractedJd} into a human-readable block for the prompt.
 */
function formatJd(jd: ExtractedJd): string {
  const lines = [`Title: ${jd.title}`, `Company: ${jd.company}`];
  if (jd.location) {
    lines.push(`Location: ${jd.location}`);
  }
  if (jd.salary) {
    lines.push(`Salary: ${jd.salary}`);
  }
  if (jd.tags?.length) {
    lines.push(`Tags: ${jd.tags.join(', ')}`);
  }
  if (jd.description) {
    lines.push(`Description: ${jd.description}`);
  }
  if (jd.requirements?.length) {
    lines.push(`Requirements: ${jd.requirements.join('; ')}`);
  }
  if (jd.seniorityLevel) {
    lines.push(`Seniority: ${jd.seniorityLevel}`);
  }
  return lines.join('\n');
}

/**
 * Format a list of {@link TargetRole}s into a numbered block for the prompt.
 */
function formatRoles(roles: TargetRole[]): string {
  return roles
    .map((r, i) => {
      const lines = [`${i + 1}. ${r.title} (slug: ${r.slug}, priority: ${r.priority})`];
      if (r.level) {
        lines.push(`   Level: ${r.level}`);
      }
      if (r.domain) {
        lines.push(`   Domain: ${r.domain}`);
      }
      if (r.stack) {
        lines.push(`   Stack: ${r.stack}`);
      }
      if (r.notes) {
        lines.push(`   Notes: ${r.notes}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * Load the suggest-role prompt template.
 */
async function loadPrompt(): Promise<{ systemPrompt: string; temperature: number }> {
  const { body, temperature } = await loadPromptTemplate(PROMPT_NAME, SUGGEST_ROLE_TEMPERATURE);
  return { systemPrompt: body, temperature };
}

/**
 * Suggest the best-matching target role for a job description from
 * the candidate's profile. Uses the `suggest-role.md` prompt template
 * with `jsonMode: true` and Zod-validated output.
 *
 * When `targetRoles` is empty, returns a no-match suggestion immediately
 * without calling the LLM.
 *
 * @param jd - The extracted job description.
 * @param targetRoles - The candidate's target roles from `profile.md`.
 * @param llmConfig - LLM connection config.
 * @param log - Optional pino logger.
 * @returns A {@link RoleSuggestion} with the best-matching role slug, confidence, and reasoning.
 * @throws after {@link MAX_RETRIES} + 1 attempts with the last validation error.
 */
export async function suggestTargetRole(
  jd: ExtractedJd,
  targetRoles: TargetRole[],
  llmConfig: LlmConfig,
  log?: Logger,
): Promise<RoleSuggestion> {
  if (targetRoles.length === 0) {
    return { roleSlug: '', confidence: 0, reasoning: 'No target roles defined in profile.' };
  }

  const { systemPrompt, temperature } = await loadPrompt();

  const userMessage = `## Job description\n\n${formatJd(jd)}\n\n## Target roles\n\n${formatRoles(targetRoles)}`;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const messages: Parameters<typeof chatComplete>[0] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    if (lastError) {
      messages.push({
        role: 'user',
        content:
          `Your previous output failed validation: ${lastError.message}\n` +
          'Fix the issues and return only valid JSON matching the schema.',
      });
    }

    log?.debug({ attempt, title: jd.title, company: jd.company }, 'suggest.start');

    const result = await chatComplete(messages, llmConfig, { jsonMode: true, temperature }, log);

    try {
      const parsed = parseJsonResult(result.content, RoleSuggestionSchema);
      log?.debug(
        { attempt, roleSlug: parsed.roleSlug, confidence: parsed.confidence },
        'suggest.complete',
      );
      return parsed;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      log?.warn({ attempt, error: lastError.message }, 'suggest.validation_failed');
    }
  }

  log?.error({ attempts: MAX_RETRIES + 1, error: lastError?.message }, 'suggest.failed');
  throw new Error(
    `Role suggestion failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message ?? 'unknown error'}`,
  );
}
