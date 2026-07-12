import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Test cases for retro learning-plan generation evals.
 * Each case provides input data, expected behaviour, and inline expectations.
 */
export interface LearningPlanCase {
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
  /** Job description text. */
  readonly jd: string;
  /** Candidate profile text. */
  readonly profile: string;
  /** Weak topics identified in the failed interview. */
  readonly weakTopics: readonly string[];
  /** Expected behaviour: 'generate' or 'refuse'. */
  readonly expectedBehavior: 'generate' | 'refuse';
  /** Inline expectations (only when generate). */
  readonly expectations?: {
    /** Minimum word count per plan. */
    readonly minWords?: number;
    /** Maximum word count per plan. */
    readonly maxWords?: number;
    /** Weak topics that must appear in the output. */
    readonly mustReferenceTopics?: readonly string[];
  };
}

function loadFixture(filename: string): string {
  return readFileSync(resolve(__dirname, '..', 'fixtures', filename), 'utf8');
}

const defaultJd = loadFixture('jd.md');
const defaultProfile = loadFixture('profile.md');

export const cases: LearningPlanCase[] = [
  {
    name: 'standard learning plan with weak topics',
    description: 'JD + profile + weak topics should produce grounded plan',
    tags: ['happy-path'],
    holdout: false,
    promptVersion: 1,
    jd: defaultJd,
    profile: defaultProfile,
    weakTopics: ['System design — consistency models', 'SQL query optimisation'],
    expectedBehavior: 'generate',
    expectations: {
      minWords: 200,
      maxWords: 600,
      mustReferenceTopics: ['consistency models', 'SQL query optimisation'],
    },
  },
  {
    name: 'learning plan with single weak topic',
    description: 'Single weak topic should still produce actionable plan',
    tags: ['edge-case'],
    holdout: false,
    promptVersion: 1,
    jd: defaultJd,
    profile: defaultProfile,
    weakTopics: ['React performance optimisation'],
    expectedBehavior: 'generate',
    expectations: {
      minWords: 200,
      maxWords: 600,
      mustReferenceTopics: ['React performance optimisation'],
    },
  },
  {
    name: 'refusal on empty profile',
    description: 'Empty profile must refuse, not fabricate a plan',
    tags: ['regression', 'safety'],
    holdout: true,
    promptVersion: 1,
    jd: defaultJd,
    profile: '',
    weakTopics: ['System design — consistency models'],
    expectedBehavior: 'refuse',
  },
];

/**
 * Load all cases with their fixture data.
 */
export function loadCases(): LearningPlanCase[] {
  return cases;
}
