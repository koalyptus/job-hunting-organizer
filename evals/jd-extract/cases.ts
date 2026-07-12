import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Test cases for JD extraction evals.
 * Each case provides raw JD text, expected extracted fields, and behaviour.
 */
export interface JdExtractCase {
  /** Human-readable test name. */
  readonly name: string;
  /** Why this case exists. */
  readonly description: string;
  /** Tags for filtering. */
  readonly tags: readonly string[];
  /** If true, reserved for validation only. */
  readonly holdout: boolean;
  /** Prompt version this case was written for. */
  readonly promptVersion: number;
  /** Raw JD text (HTML already stripped). */
  readonly jdText: string;
  /** Expected behaviour: 'generate' or 'refuse'. */
  readonly expectedBehavior: 'generate' | 'refuse';
  /** Inline expectations (only when generate). */
  readonly expectations?: {
    /** Expected title (substring match). */
    readonly titleContains?: string;
    /** Expected company (substring match). */
    readonly companyContains?: string;
    /** Minimum number of tags. */
    readonly minTags?: number;
    /** Whether requirements should be present. */
    readonly hasRequirements?: boolean;
    /** Salary should be null when not in JD (no hallucination). */
    readonly salaryExpected?: string | null;
  };
}

function loadFixture(filename: string): string {
  return readFileSync(resolve(__dirname, '..', 'fixtures', filename), 'utf8');
}

const defaultJd = loadFixture('jd.md');

export const cases: JdExtractCase[] = [
  {
    name: 'standard JD extraction',
    description: 'Full JD text should extract all key fields',
    tags: ['happy-path'],
    holdout: false,
    promptVersion: 5,
    jdText: defaultJd,
    expectedBehavior: 'generate',
    expectations: {
      titleContains: undefined, // will check schema valid + required fields present
      hasRequirements: true,
      minTags: 3,
    },
  },
  {
    name: 'minimal JD — title and company only',
    description: 'Short JD with only title and company should still parse',
    tags: ['edge-case'],
    holdout: false,
    promptVersion: 5,
    jdText: 'Senior Software Engineer at Acme Corp. We build great things.',
    expectedBehavior: 'generate',
    expectations: {
      titleContains: 'Senior Software Engineer',
      companyContains: 'Acme Corp',
      hasRequirements: false,
      minTags: 0,
    },
  },
  {
    name: 'JD with no salary — should not hallucinate',
    description: 'When salary is absent, extracted field should be undefined',
    tags: ['regression'],
    holdout: false,
    promptVersion: 5,
    jdText:
      'Frontend Developer at StartupCo.\n\nWe need someone who knows React and TypeScript.\n\nRequirements:\n- 3+ years React\n- TypeScript proficiency\n- Experience with CSS-in-JS',
    expectedBehavior: 'generate',
    expectations: {
      titleContains: 'Frontend Developer',
      companyContains: 'StartupCo',
      hasRequirements: true,
      salaryExpected: null,
    },
  },
  {
    name: 'empty input — refuse',
    description: 'Empty text should refuse, not hallucinate',
    tags: ['safety', 'regression'],
    holdout: true,
    promptVersion: 5,
    jdText: '',
    expectedBehavior: 'refuse',
  },
];

/**
 * Load all cases.
 */
export function loadCases(): JdExtractCase[] {
  return cases;
}
