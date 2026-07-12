/**
 * Profile-build eval suite — Tier 1 (structured extraction).
 *
 * Calls the LLM directly with CV + GitHub fixtures and validates
 * the generated profile.md against structural and grounding rules.
 *
 * Run: npm run eval
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installEvalMatchers, EVAL_TIMEOUT_MS } from '../matchers.js';
import { BANNED_PHRASES } from '../shared.js';
import { loadPromptTemplate } from '../../src/core/prompts.js';
import { chatComplete, defaultLlmConfig } from '../../src/core/llm.js';
import { isRefusal } from '../../src/core/generation-utils.js';
import { extractTargetRoles } from '../../src/core/campaign/target-roles.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const __dirname = dirname(fileURLToPath(import.meta.url));

installEvalMatchers();

const rubric = readFileSync(resolve(__dirname, '..', 'graders', 'profile-build-rubric.md'), 'utf8');

function loadFixture(filename: string): string {
  return readFileSync(resolve(__dirname, '..', 'fixtures', filename), 'utf8');
}

const defaultCv = loadFixture('cv.md');
const defaultGithub = loadFixture('github.json');

/** Skills from the CV fixture that generated content should reference. */
const CV_SKILLS = ['React', 'TypeScript', 'PostgreSQL', 'AWS', 'Redux', 'Vitest'];

/** Company names from the CV fixture. */
const CV_COMPANIES = ['PropTech Solutions'];

async function generate(opts: { cv: string; github: string }): Promise<string> {
  const prompt = await loadPromptTemplate('profile-build');

  const userMessage = `--- CV text ---\n${opts.cv}\n\n` + `--- GitHub profile ---\n${opts.github}`;

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: prompt.body },
    { role: 'user', content: userMessage },
  ];

  const result = await chatComplete(messages, defaultLlmConfig(), { temperature: 0.6 });
  return result.content;
}

describe('profile-build eval', () => {
  it(
    'generates valid profile from CV and GitHub data',
    async () => {
      const result = await generate({ cv: defaultCv, github: defaultGithub });

      // Refusal check (should not happen with real input)
      if (isRefusal(result)) {
        throw new Error('LLM refused to generate profile from valid CV+GitHub input');
      }

      // === Tier 3: Structural checks ===

      // Required sections
      expect(result).toContain('# Profile');
      expect(result).toContain('## Summary');
      expect(result).toContain('## Skills');
      expect(result).toContain('## Target roles');

      // No frontmatter
      expect(result).not.toMatch(/^---\n/);

      // No banned phrases
      await expect(result).toNotContainPhrases(BANNED_PHRASES);

      // Skills grounding: at least 3 CV skills referenced
      const foundSkills = CV_SKILLS.filter((s) => result.includes(s));
      expect(foundSkills.length).toBeGreaterThanOrEqual(3);

      // Company grounding: at least 1 CV company referenced
      const foundCompanies = CV_COMPANIES.filter((c) => result.includes(c));
      expect(foundCompanies.length).toBeGreaterThanOrEqual(1);

      // Target roles parseable (0 or more; some LLMs use different formats)
      const targetRolesSection = result.split('## Target roles')[1] ?? '';
      const roles = extractTargetRoles(targetRolesSection);
      expect(roles.length).toBeLessThanOrEqual(4);

      // Each role has valid slug and priority
      for (const role of roles) {
        expect(role.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(['primary', 'secondary', 'stretch']).toContain(role.priority);
      }

      // === Tier 2: LLM judge ===
      await expect(result).toPassLlmRubric(rubric);
    },
    EVAL_TIMEOUT_MS,
  );

  it(
    'refusal on empty CV',
    async () => {
      const result = await generate({ cv: '', github: defaultGithub });
      // The LLM should either refuse or produce a skeleton — both are acceptable
      // for empty CV. We mainly check it does NOT hallucinate a full profile.
      if (!isRefusal(result)) {
        // If it didn't refuse, it should be a short skeleton, not a full profile
        const words = result.trim().split(/\s+/).length;
        expect(words).toBeLessThan(500);
      }
    },
    EVAL_TIMEOUT_MS,
  );
});
