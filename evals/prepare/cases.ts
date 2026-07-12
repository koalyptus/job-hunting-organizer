import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Test cases for prep plan generation evals.
 * Each case provides input data, expected behaviour, and inline expectations
 * (per D2: LLM evals carry expectations in cases.ts, not expected.json).
 */
export interface PrepCase {
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
  /** Days until interview. */
  readonly days: number;
  /** Retro cross-reference text (optional). */
  readonly retroCrossRef?: string;
  /** Expected behaviour: 'generate' or 'refuse'. */
  readonly expectedBehavior: 'generate' | 'refuse';
  /** Inline expectations used by deterministic gates (only when generate). */
  readonly expectations?: {
    /** Min topics expected. */
    readonly minTopics?: number;
    /** Max topics expected. */
    readonly maxTopics?: number;
    /** Min behavioural questions. */
    readonly minBehavioral?: number;
    /** Max behavioural questions. */
    readonly maxBehavioral?: number;
    /** Min checklist items. */
    readonly minChecklist?: number;
    /** Max checklist items. */
    readonly maxChecklist?: number;
    /** Must include these profile refs. */
    readonly mustReferenceProfile?: readonly string[];
  };
}

function loadFixture(filename: string): string {
  const fixturePath = resolve(__dirname, '..', 'fixtures', filename);
  return readFileSync(fixturePath, 'utf8');
}

const defaultJd = loadFixture('jd.md');
const defaultProfile = loadFixture('profile.md');

export const cases: PrepCase[] = [
  {
    name: 'standard prep plan generation',
    description: 'Full JD + profile with 7 days should produce valid plan',
    tags: ['happy-path'],
    holdout: false,
    promptVersion: 1,
    jd: defaultJd,
    profile: defaultProfile,
    days: 7,
    expectedBehavior: 'generate',
    expectations: {
      minTopics: 3,
      maxTopics: 6,
      minBehavioral: 2,
      maxBehavioral: 4,
      minChecklist: 4,
      maxChecklist: 8,
    },
  },
  {
    name: 'prep plan with extended timeline',
    description: 'Full JD + profile with 14 days should produce more detailed plan',
    tags: ['happy-path', 'timeline'],
    holdout: false,
    promptVersion: 1,
    jd: defaultJd,
    profile: defaultProfile,
    days: 14,
    expectedBehavior: 'generate',
    expectations: {
      minTopics: 3,
      maxTopics: 6,
      minChecklist: 4,
      maxChecklist: 8,
    },
  },
  {
    name: 'prep plan with retro cross-reference',
    description: 'Weak topics from past retros should influence topic prioritisation',
    tags: ['cross-reference'],
    holdout: false,
    promptVersion: 1,
    jd: defaultJd,
    profile: defaultProfile,
    days: 7,
    retroCrossRef:
      '## Retro cross-reference\n\nWeak topics from previous failed interviews:\n\n- System design — consistency models (2x)\n- Behavioural — conflict resolution (1x)',
    expectedBehavior: 'generate',
    expectations: {
      minTopics: 3,
      maxTopics: 6,
      minChecklist: 4,
      maxChecklist: 8,
    },
  },
  {
    name: 'refusal on empty profile',
    description: 'Empty profile should refuse, not hallucinate experience',
    tags: ['regression', 'safety'],
    holdout: true,
    promptVersion: 1,
    jd: defaultJd,
    profile: '',
    days: 7,
    expectedBehavior: 'refuse',
  },
];

/**
 * Load all cases with their fixture data.
 */
export function loadCases(): PrepCase[] {
  return cases;
}
