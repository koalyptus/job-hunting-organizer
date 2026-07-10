/**
 * Prepare eval suite — Tier 2 (structured JSON).
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
import { BANNED_PHRASES, PROFILE_ITEMS, isRealResource } from '../shared.js';
import { loadCases } from './cases.js';
import { loadPromptTemplate } from '../../src/core/prompts.js';
import { chatComplete, defaultLlmConfig } from '../../src/core/llm.js';
import { isRefusal } from '../../src/core/generation-utils.js';
import { PrepPlanSchema } from '../../src/core/prepare/index.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const __dirname = dirname(fileURLToPath(import.meta.url));

installEvalMatchers();

const rubric = readFileSync(resolve(__dirname, '..', 'graders', 'prepare-rubric.md'), 'utf8');

async function generate(opts: {
  jd: string;
  profile: string;
  days: number;
  retroCrossRef?: string;
}): Promise<string> {
  const prompt = await loadPromptTemplate('prepare');

  const sections = [
    `--- Job description ---\n${opts.jd}`,
    `--- Candidate profile ---\n${opts.profile}`,
    `--- Days until interview ---\n${opts.days}`,
  ];
  if (opts.retroCrossRef) {
    sections.push(opts.retroCrossRef);
  }
  const userMessage = sections.join('\n\n');

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: prompt.body },
    { role: 'user', content: userMessage },
  ];

  const result = await chatComplete(messages, defaultLlmConfig(), { temperature: 0.6 });
  return result.content;
}

describe('prepare eval', () => {
  for (const c of loadCases()) {
    it(
      c.name,
      async () => {
        const raw = await generate({
          jd: c.jd,
          profile: c.profile,
          days: c.days,
          retroCrossRef: c.retroCrossRef,
        });

        // Strip markdown code fences if LLM wrapped JSON in them
        const stripped = raw.replace(/^```(?:json)?\n?|\n?```$/g, '').trim();

        // === Tier 3: Deterministic checks (free, fast) ===

        if (c.expectedBehavior === 'refuse') {
          // Accept either a text refusal, JSON error response, or very short output
          const wordCount = raw.trim().split(/\s+/).length;
          const isJsonRefusal = (() => {
            try {
              const parsed = JSON.parse(raw);
              return typeof parsed === 'object' && parsed !== null && 'error' in parsed;
            } catch {
              return false;
            }
          })();
          expect(isRefusal(raw) || isJsonRefusal || wordCount < 100).toBe(true);
          return;
        }

        // Parse JSON
        let parsed: ReturnType<typeof PrepPlanSchema.parse>;
        try {
          const json = JSON.parse(stripped);
          parsed = PrepPlanSchema.parse(json);
        } catch (err) {
          throw new Error(`PrepPlanSchema validation failed: ${err}`);
        }

        // Topic count
        const exp = c.expectations ?? {};
        const minTopics = exp.minTopics ?? 3;
        const maxTopics = exp.maxTopics ?? 6;
        expect(parsed.topics.length).toBeGreaterThanOrEqual(minTopics);
        expect(parsed.topics.length).toBeLessThanOrEqual(maxTopics);

        // Depth distribution: at least 1 depth; when ≥3 topics, prefer ≥2 depths (not all 3 required)
        const depths = new Set(parsed.topics.map((t) => t.depth));
        expect(depths.size).toBeGreaterThanOrEqual(1);
        if (parsed.topics.length >= 3) {
          expect(depths.size).toBeGreaterThanOrEqual(2);
        }

        // Behavioural
        const minB = exp.minBehavioral ?? 2;
        const maxB = exp.maxBehavioral ?? 4;
        expect(parsed.behavioral.length).toBeGreaterThanOrEqual(minB);
        expect(parsed.behavioral.length).toBeLessThanOrEqual(maxB);

        // Checklist
        const minC = exp.minChecklist ?? 4;
        const maxC = exp.maxChecklist ?? 8;
        expect(parsed.checklist.length).toBeGreaterThanOrEqual(minC);
        expect(parsed.checklist.length).toBeLessThanOrEqual(maxC);

        // Resources look real
        for (const t of parsed.topics) {
          for (const r of t.resources) {
            expect(isRealResource(r)).toBe(true);
          }
        }

        // Timeline sums within ±20% of days
        if (parsed.timeline.length > 0) {
          const maxDay = Math.max(...parsed.timeline.map((m) => m.daysBefore));
          expect(maxDay).toBeLessThanOrEqual(Math.ceil(c.days * 1.2));
        }

        // Profile grounding
        if (exp.mustReferenceProfile) {
          await expect(raw).toContainAtLeastNProfileItems([...exp.mustReferenceProfile], 2);
        } else {
          await expect(raw).toContainAtLeastNProfileItems([...PROFILE_ITEMS], 2);
        }

        // No banned phrases
        await expect(raw).toNotContainPhrases(BANNED_PHRASES);

        // === Tier 2: LLM judge (runs only if deterministic checks pass) ===
        await expect(raw).toPassLlmRubric(rubric);
      },
      EVAL_TIMEOUT_MS,
    );
  }
});
