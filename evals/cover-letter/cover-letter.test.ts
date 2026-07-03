/**
 * Cover letter eval suite — Tier 2 (creative generation).
 *
 * Deterministic checks run first (free, fast). LLM judge only runs
 * if deterministic checks pass. This tiering reduces cost.
 *
 * Run: npm run eval
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installEvalMatchers, EVAL_TIMEOUT_MS } from '../matchers.js';
import { loadCases } from './cases.js';
import { loadPromptTemplate } from '../../src/core/prompts.js';
import { chatComplete, defaultLlmConfig } from '../../src/core/llm.js';
import { isRefusal } from '../../src/core/generation-utils.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Install custom matchers
installEvalMatchers();

// Load rubric
const rubric = readFileSync(resolve(__dirname, '..', 'graders', 'cover-letter-rubric.md'), 'utf8');

// Banned phrases from the prompt (modesty rule)
const BANNED_PHRASES = [
  'best',
  'exceptional',
  'world-class',
  'outstanding',
  'remarkable',
  'passionate about',
  'love building',
  'obsessed with',
  'excited to',
  'confident that',
];

// Profile items that should be referenced (from the fixture)
const PROFILE_ITEMS = [
  'PropTech Solutions',
  'React',
  'TypeScript',
  'Redux',
  'component library',
  'Vitest',
];

/**
 * Generate a cover letter using the LLM directly.
 * This calls the LLM — slow, non-deterministic.
 */
async function generate(opts: {
  jd: string;
  profile: string;
  targetRole?: string;
}): Promise<string> {
  const prompt = await loadPromptTemplate('cover-letter');

  const userMessage = `--- Job description ---\n${opts.jd}\n\n--- Candidate profile ---\n${opts.profile}${opts.targetRole ? `\n\n--- Target role ---\n${opts.targetRole}` : ''}`;

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: prompt.body },
    { role: 'user', content: userMessage },
  ];

  const config = defaultLlmConfig();
  const result = await chatComplete(messages, config, { temperature: 0.3 });

  return result.content;
}

describe('cover letter eval', () => {
  for (const { name, jd, profile, targetRole, expectedBehavior } of loadCases()) {
    it(
      name,
      async () => {
        // Generate the cover letter
        const result = await generate({ jd, profile, targetRole });

        // === Tier 3: Deterministic checks (free, fast) ===

        if (expectedBehavior === 'refuse') {
          // Refusal case: should detect refusal, not hallucinate
          expect(isRefusal(result)).toBe(true);
          return;
        }

        // Word count check
        const wordCount = result.trim().split(/\s+/).length;
        expect(wordCount).toBeGreaterThanOrEqual(200);
        expect(wordCount).toBeLessThanOrEqual(600);

        // No banned phrases
        await expect(result).toNotContainPhrases(BANNED_PHRASES);

        // At least 2 profile items referenced
        await expect(result).toContainAtLeastNProfileItems(PROFILE_ITEMS, 2);

        // No subject line
        expect(result.toLowerCase()).not.toMatch(/^re:|subject:/);

        // === Tier 2: LLM judge (runs only if deterministic checks pass) ===

        await expect(result).toPassLlmRubric(rubric);
      },
      EVAL_TIMEOUT_MS,
    ); // Centralized timeout for LLM-based eval tests
  }
});
