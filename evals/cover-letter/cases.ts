import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Test cases for cover letter generation evals.
 * Each case provides input data and expected behavior.
 */
export interface CoverLetterCase {
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
  /** Target role from profile (optional). */
  readonly targetRole?: string;
  /** Expected behavior: 'generate' or 'refuse'. */
  readonly expectedBehavior: 'generate' | 'refuse';
}

function loadFixture(filename: string): string {
  const fixturePath = resolve(__dirname, '..', 'fixtures', filename);
  return readFileSync(fixturePath, 'utf8');
}

const defaultJd = loadFixture('jd.md');
const defaultProfile = loadFixture('profile.md');

export const cases: CoverLetterCase[] = [
  {
    name: 'standard cover letter generation',
    description: 'Full JD + profile with matching target role should produce valid letter',
    tags: ['happy-path'],
    holdout: false,
    promptVersion: 1,
    jd: defaultJd,
    profile: defaultProfile,
    targetRole: 'senior-frontend-engineer',
    expectedBehavior: 'generate',
  },
  {
    name: 'cover letter without target role',
    description: 'JD + profile without specifying target role should still generate',
    tags: ['edge-case'],
    holdout: false,
    promptVersion: 1,
    jd: defaultJd,
    profile: defaultProfile,
    expectedBehavior: 'generate',
  },
  {
    name: 'refusal on empty profile',
    description: 'Empty profile should refuse, not hallucinate experience',
    tags: ['regression', 'safety'],
    holdout: true,
    promptVersion: 1,
    jd: defaultJd,
    profile: '',
    expectedBehavior: 'refuse',
  },
];

/**
 * Load all cases with their fixture data.
 */
export function loadCases(): CoverLetterCase[] {
  return cases;
}
