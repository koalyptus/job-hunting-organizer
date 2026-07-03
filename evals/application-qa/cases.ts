import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Test cases for application Q&A evals.
 */
export interface QACase {
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
  /** The application question. */
  readonly question: string;
  /** Expected behavior: 'answer' or 'refuse'. */
  readonly expectedBehavior: 'answer' | 'refuse';
  /** Whether to run the LLM judge (expensive). Defaults to true. */
  readonly useLlmJudge?: boolean;
}

function loadFixture(filename: string): string {
  const fixturePath = resolve(__dirname, '..', 'fixtures', filename);
  return readFileSync(fixturePath, 'utf8');
}

const defaultJd = loadFixture('jd.md');
const defaultProfile = loadFixture('profile.md');

export const cases: QACase[] = [
  {
    name: 'standard motivation question',
    description: '"Why do you want to work here?" with full JD + profile',
    tags: ['happy-path'],
    holdout: false,
    promptVersion: 1,
    jd: defaultJd,
    profile: defaultProfile,
    question: 'Why do you want to work at Reapit?',
    expectedBehavior: 'answer',
    useLlmJudge: true,
  },
  {
    name: 'technical experience question',
    description: '"Describe a complex project you built" with relevant profile',
    tags: ['happy-path'],
    holdout: false,
    promptVersion: 1,
    jd: defaultJd,
    profile: defaultProfile,
    question:
      'Describe a complex frontend project you have worked on. What challenges did you face and how did you overcome them?',
    expectedBehavior: 'answer',
    useLlmJudge: false,
  },
  {
    name: 'refusal on empty profile',
    description: 'Empty profile should refuse, not hallucinate experience',
    tags: ['regression', 'safety'],
    holdout: true,
    promptVersion: 1,
    jd: defaultJd,
    profile: '',
    question: 'Tell us about your experience with React.',
    expectedBehavior: 'refuse',
  },
];

/**
 * Load all cases.
 */
export function loadCases(): QACase[] {
  return cases;
}
