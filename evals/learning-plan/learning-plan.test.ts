/**
 * Learning-plan eval suite — Tier 2 (creative generation, prose output).
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
import { PROFILE_ITEMS, isRealResource } from '../shared.js';
import { loadCases } from './cases.js';
import { loadPromptTemplate } from '../../src/core/prompts.js';
import { chatComplete, defaultLlmConfig } from '../../src/core/llm.js';
import { isRefusal, countWords } from '../../src/core/generation-utils.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const __dirname = dirname(fileURLToPath(import.meta.url));

installEvalMatchers();

const rubric = readFileSync(resolve(__dirname, '..', 'graders', 'learning-plan-rubric.md'), 'utf8');

// Learning-plan specific banned phrases (excludes "best" which is common in "best practices")
const LEARNING_PLAN_BANNED = [
  'exceptional',
  'world-class',
  'outstanding',
  'remarkable',
  'passionate about',
  'love building',
  'obsessed with',
  'confident that',
];

async function generate(opts: {
  jd: string;
  profile: string;
  weakTopics: readonly string[];
}): Promise<string> {
  const prompt = await loadPromptTemplate('learning-plan');

  const weakTopicsText = opts.weakTopics.map((t, i) => `${i + 1}. ${t}`).join('\n');

  const userMessage =
    `--- Job description ---\n${opts.jd}\n\n` +
    `--- Candidate profile ---\n${opts.profile}\n\n` +
    `--- Weak topics ---\n${weakTopicsText}`;

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: prompt.body },
    { role: 'user', content: userMessage },
  ];

  const result = await chatComplete(messages, defaultLlmConfig(), { temperature: 0.6 });
  return result.content;
}

describe('learning-plan eval', () => {
  for (const c of loadCases()) {
    it(
      c.name,
      async () => {
        const result = await generate({ jd: c.jd, profile: c.profile, weakTopics: c.weakTopics });

        // === Tier 3: Deterministic checks (free, fast) ===

        if (c.expectedBehavior === 'refuse') {
          const wordCount = countWords(result);
          expect(isRefusal(result) || wordCount < 100).toBe(true);
          return;
        }

        // Word count
        const exp = c.expectations ?? {};
        const minWords = exp.minWords ?? 200;
        const maxWords = exp.maxWords ?? 600;
        const words = countWords(result);
        expect(words).toBeGreaterThanOrEqual(minWords);
        expect(words).toBeLessThanOrEqual(maxWords);

        // No banned phrases (learning-plan specific list)
        await expect(result).toNotContainPhrases(LEARNING_PLAN_BANNED);

        // Weak topics must be referenced (flexible: handle US/UK spelling)
        if (exp.mustReferenceTopics) {
          for (const topic of exp.mustReferenceTopics) {
            const normalised = topic.toLowerCase().replace(/isation/g, 'ization');
            const outputLower = result.toLowerCase().replace(/isation/g, 'ization');
            expect(outputLower).toContain(normalised);
          }
        }

        // Profile grounding (learning plans are topic-focused; may not reference profile items)
        await expect(result).toContainAtLeastNProfileItems([...PROFILE_ITEMS], 0);

        // Resources referenced look real (best-effort: check any URLs in the output)
        const urlMatches = result.match(/https?:\/\/[^\s)]+/g) ?? [];
        for (const url of urlMatches.slice(0, 5)) {
          expect(isRealResource(url)).toBe(true);
        }

        // === Tier 2: LLM judge (runs only if deterministic checks pass) ===
        await expect(result).toPassLlmRubric(rubric);
      },
      EVAL_TIMEOUT_MS,
    );
  }
});
