import { describe, it, expect, beforeAll } from 'vitest';
import { installEvalMatchers, EVAL_TIMEOUT_MS } from '../matchers.js';
import { parseNaturalLanguage } from '../../src/core/parser/prompt-parser.js';
import { defaultLlmConfig } from '../../src/core/llm.js';
import { loadCases } from './cases.js';

installEvalMatchers();

const cases = loadCases();

describe('nl-command parsing', () => {
  let hasLlm = false;

  beforeAll(() => {
    try {
      const cfg = defaultLlmConfig();
      hasLlm = Boolean(cfg.baseUrl && cfg.model);
    } catch {
      hasLlm = false;
    }
    if (!hasLlm) {
      console.warn('Skipping nl-command evals: no LLM configured in config.json or env vars.');
    }
  });

  for (const c of cases) {
    it(
      c.name,
      async () => {
        if (!hasLlm) {
          console.warn(`  (skipped: no LLM configured) — ${c.name}`);
          return;
        }

        const parsed = await parseNaturalLanguage(c.input, {}, undefined);

        // 1. Command must match
        expect(parsed.command).toBe(c.expected.command);

        // 2. Subcommand must match (if expected)
        if (c.expected.subcommand !== undefined) {
          expect(parsed.subcommand).toBe(c.expected.subcommand);
        }

        // 3. Args must contain expected (order-sensitive subset)
        if (c.expected.args) {
          for (let i = 0; i < c.expected.args.length; i++) {
            expect(parsed.args[i]).toBe(c.expected.args[i]);
          }
        }

        // 4. Options must contain expected
        if (c.expected.options) {
          for (const [key, value] of Object.entries(c.expected.options)) {
            if (value === true) {
              expect(parsed.options[key]).toBe(true);
            } else if (Array.isArray(value)) {
              const actual = parsed.options[key];
              expect(Array.isArray(actual)).toBe(true);
              for (const item of value) {
                expect((actual as unknown[]).includes(item)).toBe(true);
              }
            } else if (typeof value === 'number') {
              expect(Number(parsed.options[key])).toBe(value);
            } else {
              expect(parsed.options[key]).toBe(value);
            }
          }
        }

        // 5. Confidence must meet threshold
        expect(parsed.confidence).toBeGreaterThanOrEqual(c.minConfidence);

        // 6. JSON validity is implicit in successful parse
      },
      EVAL_TIMEOUT_MS,
    );
  }
});
