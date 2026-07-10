/**
 * JD-extract eval suite — Tier 1 (structured extraction).
 *
 * Deterministic checks validate extracted fields against inline expectations.
 * LLM judge is not used for Tier 1 — purely structural.
 *
 * Run: npm run eval
 */
import { describe, it, expect } from 'vitest';
import { installEvalMatchers, EVAL_TIMEOUT_MS } from '../matchers.js';
import { loadCases } from './cases.js';
import { loadPromptTemplate } from '../../src/core/prompts.js';
import { chatComplete, defaultLlmConfig } from '../../src/core/llm.js';
import { isRefusal } from '../../src/core/generation-utils.js';
import { ExtractedJdSchema } from '../../src/core/jobs/index.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

installEvalMatchers();

async function generate(opts: { jdText: string }): Promise<string> {
  const prompt = await loadPromptTemplate('jd-extract');

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: prompt.body },
    { role: 'user', content: opts.jdText },
  ];

  const result = await chatComplete(messages, defaultLlmConfig(), { temperature: 0.1 });
  return result.content;
}

describe('jd-extract eval', () => {
  for (const c of loadCases()) {
    it(
      c.name,
      async () => {
        const raw = await generate({ jdText: c.jdText });

        // === Tier 3: Deterministic checks ===

        if (c.expectedBehavior === 'refuse') {
          // Accept either a text refusal OR a JSON with "unknown" title/company
          const isJsonUnknown = (() => {
            try {
              const parsed = JSON.parse(raw);
              return (
                parsed.title?.toLowerCase() === 'unknown' &&
                parsed.company?.toLowerCase() === 'unknown'
              );
            } catch {
              return false;
            }
          })();
          expect(isRefusal(raw) || isJsonUnknown).toBe(true);
          return;
        }

        // Parse JSON
        let parsed: ReturnType<typeof ExtractedJdSchema.parse>;
        try {
          const json = JSON.parse(raw);
          parsed = ExtractedJdSchema.parse(json);
        } catch (err) {
          throw new Error(`ExtractedJdSchema validation failed: ${err}`);
        }

        // Required fields present
        expect(parsed.title.length).toBeGreaterThan(0);
        expect(parsed.company.length).toBeGreaterThan(0);
        expect(parsed.description.length).toBeGreaterThan(0);

        const exp = c.expectations ?? {};

        // Title match
        if (exp.titleContains) {
          expect(parsed.title.toLowerCase()).toContain(exp.titleContains.toLowerCase());
        }

        // Company match
        if (exp.companyContains) {
          expect(parsed.company.toLowerCase()).toContain(exp.companyContains.toLowerCase());
        }

        // Tags
        if (exp.minTags !== undefined) {
          expect(parsed.tags?.length ?? 0).toBeGreaterThanOrEqual(exp.minTags);
        }

        // Requirements
        if (exp.hasRequirements) {
          expect(parsed.requirements?.length).toBeGreaterThanOrEqual(1);
        }

        // Salary hallucination check
        if (exp.salaryExpected === null) {
          expect(parsed.salary).toBeUndefined();
        }
      },
      EVAL_TIMEOUT_MS,
    );
  }
});
