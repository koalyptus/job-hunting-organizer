/**
 * Suggest-role eval suite — Tier 1 (structured extraction).
 *
 * Deterministic checks validate the extracted roleSlug against inline expectations.
 *
 * Run: npm run eval
 */
import { describe, it, expect } from 'vitest';
import { installEvalMatchers, EVAL_TIMEOUT_MS } from '../matchers.js';
import { loadCases } from './cases.js';
import { loadPromptTemplate } from '../../src/core/prompts.js';
import { chatComplete, defaultLlmConfig } from '../../src/core/llm.js';
import { isRefusal } from '../../src/core/generation-utils.js';
import { RoleSuggestionSchema } from '../../src/core/jobs/index.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

installEvalMatchers();

async function generate(opts: { jd: string; targetRoles: string }): Promise<string> {
  const prompt = await loadPromptTemplate('suggest-role');

  const userMessage =
    `--- Job description ---\n${opts.jd}\n\n` + `--- Target roles ---\n${opts.targetRoles}`;

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: prompt.body },
    { role: 'user', content: userMessage },
  ];

  const result = await chatComplete(messages, defaultLlmConfig(), { temperature: 0.2 });
  return result.content;
}

describe('suggest-role eval', () => {
  for (const c of loadCases()) {
    it(
      c.name,
      async () => {
        const raw = await generate({ jd: c.jd, targetRoles: c.targetRoles });

        // === Tier 3: Deterministic checks ===

        if (c.expectedBehavior === 'refuse') {
          expect(isRefusal(raw)).toBe(true);
          return;
        }

        // Parse JSON and validate schema
        let parsed: ReturnType<typeof RoleSuggestionSchema.parse>;
        try {
          const json = JSON.parse(raw);
          parsed = RoleSuggestionSchema.parse(json);
        } catch (err) {
          throw new Error(`RoleSuggestionSchema validation failed: ${err}`);
        }

        const exp = c.expectations ?? {};

        // Role slug match
        if (exp.expectedSlug !== undefined) {
          expect(parsed.roleSlug).toBe(exp.expectedSlug);
        }

        // Confidence range
        expect(parsed.confidence).toBeGreaterThanOrEqual(0);
        expect(parsed.confidence).toBeLessThanOrEqual(1);
        if (exp.minConfidence !== undefined) {
          expect(parsed.confidence).toBeGreaterThanOrEqual(exp.minConfidence);
        }

        // Reasoning non-empty
        expect(parsed.reasoning.length).toBeGreaterThan(0);
      },
      EVAL_TIMEOUT_MS,
    );
  }
});
