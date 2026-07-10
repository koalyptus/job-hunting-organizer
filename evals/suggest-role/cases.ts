import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Test cases for target-role suggestion evals.
 * Each case provides JD + target roles and expected suggestion.
 */
export interface SuggestRoleCase {
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
  /** Target roles text (formatted as numbered list per prompt). */
  readonly targetRoles: string;
  /** Expected behaviour: 'generate' or 'refuse'. */
  readonly expectedBehavior: 'generate' | 'refuse';
  /** Inline expectations (only when generate). */
  readonly expectations?: {
    /** Expected roleSlug (exact match). */
    readonly expectedSlug?: string;
    /** Minimum confidence. */
    readonly minConfidence?: number;
  };
}

function loadFixture(filename: string): string {
  return readFileSync(resolve(__dirname, '..', 'fixtures', filename), 'utf8');
}

const defaultJd = loadFixture('jd.md');

const DEFAULT_TARGET_ROLES = `1. senior-frontend-engineer — Senior Frontend Engineer [primary]
   - Domain: Frontend, React ecosystem
   - Stack: TypeScript, React, Redux, CSS-in-JS
   - Level: Senior (IC4)

2. fullstack-engineer — Fullstack Engineer [secondary]
   - Domain: Full-stack web
   - Stack: TypeScript, React, Node.js, PostgreSQL
   - Level: Mid-Senior (IC3-IC4)

3. devops-engineer — DevOps Engineer [stretch]
   - Domain: Cloud infrastructure
   - Stack: AWS, Terraform, Docker, Kubernetes
   - Level: Senior`;

export const cases: SuggestRoleCase[] = [
  {
    name: 'frontend JD matches primary role',
    description: 'React/TypeScript JD should match senior-frontend-engineer',
    tags: ['happy-path'],
    holdout: false,
    promptVersion: 1,
    jd: defaultJd,
    targetRoles: DEFAULT_TARGET_ROLES,
    expectedBehavior: 'generate',
    expectations: {
      expectedSlug: 'senior-frontend-engineer',
      minConfidence: 0.5,
    },
  },
  {
    name: 'no matching role returns empty slug',
    description: 'Data science JD should not match any frontend/backend roles',
    tags: ['edge-case'],
    holdout: false,
    promptVersion: 1,
    jd: 'Data Scientist at ML Corp. We need Python, TensorFlow, and statistical modelling.',
    targetRoles: DEFAULT_TARGET_ROLES,
    expectedBehavior: 'generate',
    expectations: {
      expectedSlug: '',
      minConfidence: 0,
    },
  },
  {
    name: 'empty target roles list',
    description: 'When no target roles provided, should return empty slug',
    tags: ['edge-case', 'regression'],
    holdout: false,
    promptVersion: 1,
    jd: defaultJd,
    targetRoles: '',
    expectedBehavior: 'generate',
    expectations: {
      expectedSlug: '',
    },
  },
];

/**
 * Load all cases.
 */
export function loadCases(): SuggestRoleCase[] {
  return cases;
}
