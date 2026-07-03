/**
 * Application Q&A eval suite — Tier 2 (creative generation).
 *
 * Deterministic checks run first (free, fast). LLM judge only runs
 * if deterministic checks pass.
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
const rubric = readFileSync(resolve(__dirname, '..', 'graders', 'qa-rubric.md'), 'utf8');

// Profile items that should be referenced (from the fixture)
const PROFILE_ITEMS = [
  'PropTech Solutions',
  'React',
  'TypeScript',
  'Redux',
  'component library',
  'Vitest',
  'Digital Agency',
];

/**
 * Generate an answer using the LLM directly.
 * This calls the LLM — slow, non-deterministic.
 */
async function generate(opts: { jd: string; profile: string; question: string }): Promise<string> {
  const prompt = await loadPromptTemplate('application-qa');

  const userMessage = `--- Job description ---\n${opts.jd}\n\n--- Candidate profile ---\n${opts.profile}\n\n--- Question ---\n${opts.question}`;

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: prompt.body },
    { role: 'user', content: userMessage },
  ];

  const config = defaultLlmConfig();
  const result = await chatComplete(messages, config, { temperature: 0.3 });

  return result.content;
}

describe('application-qa eval', () => {
  for (const { name, jd, profile, question, expectedBehavior, useLlmJudge } of loadCases()) {
    it(
      name,
      async () => {
        // Generate the answer
        const result = await generate({ jd, profile, question });

        // === Tier 3: Deterministic checks (free, fast) ===

        if (expectedBehavior === 'refuse') {
          // Refusal case: should detect refusal, not hallucinate
          expect(isRefusal(result)).toBe(true);
          return;
        }

        // Word count check
        const wordCount = result.trim().split(/\s+/).length;
        expect(wordCount).toBeGreaterThanOrEqual(50);
        expect(wordCount).toBeLessThanOrEqual(500);

        // At least 1 profile item referenced
        await expect(result).toContainAtLeastNProfileItems(PROFILE_ITEMS, 1);

        // No meta-commentary
        expect(result.toLowerCase()).not.toMatch(/i hope this helps|let me know if/);

        // === Tier 2: LLM judge (runs only if deterministic checks pass) ===
        // Only runs for cases where LLM judge adds value beyond deterministic checks

        if (useLlmJudge !== false) {
          await expect(result).toPassLlmRubric(rubric);
        }
      },
      EVAL_TIMEOUT_MS,
    ); // Centralized timeout for LLM-based eval tests
  }
});
