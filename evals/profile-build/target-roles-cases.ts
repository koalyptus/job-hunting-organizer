import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import type { TargetRole } from '../../src/core/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Golden test cases for target-roles parsing. Each case provides a
 * markdown body with a `## Target roles` section and a reference to
 * a golden JSON fixture in `expected-target-roles/`.
 */
export interface TargetRolesCase {
  /** Human-readable test name. */
  readonly name: string;
  /** Markdown body (everything after frontmatter). */
  readonly input: string;
  /**
   * Filename of the expected output JSON in `expected-target-roles/`.
   * The test loads and parses this file at runtime.
   */
  readonly fixture: string;
}

function loadFixture(filename: string): TargetRole[] {
  const fixturePath = resolve(__dirname, 'expected-target-roles', filename);
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as TargetRole[];
}

export const cases: TargetRolesCase[] = [
  {
    name: 'single primary role with all fields',
    input: `## Summary

Senior engineer with 10 years of experience.

## Target roles

### senior-backend-engineer — Senior Backend Engineer [primary]

- Level: Senior (IC4)
- Domain: Backend, distributed systems
- Stack: TypeScript, Node.js, PostgreSQL
- Work style: Remote or hybrid (Sydney timezone)
- Compensation: 180k AUD
- Notes: Focus on platform and infrastructure

## Skills

- TypeScript
- Go
- PostgreSQL`,
    fixture: 'senior-backend.json',
  },
  {
    name: 'single secondary role with minimal fields',
    input: `## Target roles

### devops-engineer — DevOps Engineer [secondary]

- Level: Mid
- Stack: AWS, Terraform, GitHub Actions`,
    fixture: 'devops-engineer.json',
  },
  {
    name: 'multiple roles with mixed priorities',
    input: `## About

Full-stack engineer based in Melbourne.

## Target roles

### senior-frontend-engineer — Senior Frontend Engineer [primary]

- Level: Senior (IC4)
- Domain: Frontend, UI/UX
- Stack: React, TypeScript, Tailwind CSS
- Work style: Remote
- Compensation: 170k AUD

### fullstack-engineer — Fullstack Engineer [secondary]

- Level: Senior
- Domain: Fullstack
- Stack: TypeScript, React, Node.js, PostgreSQL
- Work style: Hybrid (Melbourne)

### staff-engineer — Staff Engineer [stretch]

- Level: Staff (IC5)
- Domain: Platform engineering
- Stack: TypeScript, Go, Kubernetes

## Experience

- 10 years in software engineering`,
    fixture: 'multi-role.json',
  },
  {
    name: 'no target roles section returns empty array',
    input: `## Summary

Just a summary with no target roles section.

## Skills

- TypeScript
- Go`,
    fixture: 'empty.json',
  },
];

/**
 * Load all expected outputs from their fixture files.
 * Called once by the test runner to build the case list.
 */
export function loadCases(): { name: string; input: string; expected: TargetRole[] }[] {
  return cases.map((c) => ({
    name: c.name,
    input: c.input,
    expected: loadFixture(c.fixture),
  }));
}
