import type { TargetRole } from '../../src/core/types.js';

/**
 * Golden test cases for target-roles parsing. Each case provides a
 * markdown body with a `## Target roles` section and the expected
 * parsed output.
 */
export interface TargetRolesCase {
  /** Human-readable test name. */
  readonly name: string;
  /** Markdown body (everything after frontmatter). */
  readonly input: string;
  /** Expected parsed target roles. */
  readonly expected: TargetRole[];
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
    expected: [
      {
        slug: 'senior-backend-engineer',
        title: 'Senior Backend Engineer',
        priority: 'primary',
        level: 'Senior (IC4)',
        domain: 'Backend, distributed systems',
        stack: 'TypeScript, Node.js, PostgreSQL',
        workStyle: 'Remote or hybrid (Sydney timezone)',
        compensation: '180k AUD',
        notes: 'Focus on platform and infrastructure',
      },
    ],
  },
  {
    name: 'single secondary role with minimal fields',
    input: `## Target roles

### devops-engineer — DevOps Engineer [secondary]

- Level: Mid
- Stack: AWS, Terraform, GitHub Actions`,
    expected: [
      {
        slug: 'devops-engineer',
        title: 'DevOps Engineer',
        priority: 'secondary',
        level: 'Mid',
        domain: '',
        stack: 'AWS, Terraform, GitHub Actions',
        workStyle: '',
        compensation: '',
        notes: '',
      },
    ],
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
    expected: [
      {
        slug: 'senior-frontend-engineer',
        title: 'Senior Frontend Engineer',
        priority: 'primary',
        level: 'Senior (IC4)',
        domain: 'Frontend, UI/UX',
        stack: 'React, TypeScript, Tailwind CSS',
        workStyle: 'Remote',
        compensation: '170k AUD',
        notes: '',
      },
      {
        slug: 'fullstack-engineer',
        title: 'Fullstack Engineer',
        priority: 'secondary',
        level: 'Senior',
        domain: 'Fullstack',
        stack: 'TypeScript, React, Node.js, PostgreSQL',
        workStyle: 'Hybrid (Melbourne)',
        compensation: '',
        notes: '',
      },
      {
        slug: 'staff-engineer',
        title: 'Staff Engineer',
        priority: 'stretch',
        level: 'Staff (IC5)',
        domain: 'Platform engineering',
        stack: 'TypeScript, Go, Kubernetes',
        workStyle: '',
        compensation: '',
        notes: '',
      },
    ],
  },
  {
    name: 'no target roles section returns empty array',
    input: `## Summary

Just a summary with no target roles section.

## Skills

- TypeScript
- Go`,
    expected: [],
  },
];
