import { describe, it, expect } from 'vitest';
import {
  parseTargetRoles,
  findTargetRole,
  replaceTargetRoles,
  isValidRoleSlug,
} from '../target-roles.js';

const PROFILE_BODY = `## Summary

Experienced backend engineer.

## Target roles

<!-- jho:target-roles -->

### senior-backend-engineer — Senior Backend Engineer [primary]

- Level: Senior (IC4)
- Domain: Backend, distributed systems
- Stack: TypeScript, Node.js, PostgreSQL, AWS, Kubernetes
- Work style: Remote or hybrid (Sydney timezone)
- Compensation: 160k AUD
- Notes: my strongest area; open to platform/infra adjacent roles

### staff-engineer — Staff Engineer [stretch]

- Level: Staff (IC5)
- Domain: Platform, infrastructure
- Stack: same as above + Go
- Work style: Remote or hybrid
- Compensation: 200k AUD
- Notes: aspirational; would need to demonstrate cross-team impact

### engineering-manager — Engineering Manager [secondary]

- Level: M3
- Domain: People management, delivery
- Stack: (agnostic)
- Work style: Hybrid preferred
- Compensation: 180k AUD
- Notes: would be a step sideways; only pursue if hands-on IC roles dry up

## Experience

### Senior Engineer @ Acme Corp (2020 – present)

- Led migration to microservices
`;

describe('parseTargetRoles', () => {
  it('parses all roles from a profile body', () => {
    const roles = parseTargetRoles(PROFILE_BODY);
    expect(roles).toHaveLength(3);
  });

  it('parses slug, title, and priority from H3 headings', () => {
    const roles = parseTargetRoles(PROFILE_BODY);
    expect(roles[0]).toMatchObject({
      slug: 'senior-backend-engineer',
      title: 'Senior Backend Engineer',
      priority: 'primary',
    });
    expect(roles[1]).toMatchObject({
      slug: 'staff-engineer',
      title: 'Staff Engineer',
      priority: 'stretch',
    });
    expect(roles[2]).toMatchObject({
      slug: 'engineering-manager',
      title: 'Engineering Manager',
      priority: 'secondary',
    });
  });

  it('parses all bullet-point fields', () => {
    const roles = parseTargetRoles(PROFILE_BODY);
    const first = roles[0]!;
    expect(first.level).toBe('Senior (IC4)');
    expect(first.domain).toBe('Backend, distributed systems');
    expect(first.stack).toBe('TypeScript, Node.js, PostgreSQL, AWS, Kubernetes');
    expect(first.workStyle).toBe('Remote or hybrid (Sydney timezone)');
    expect(first.compensation).toBe('160k AUD');
    expect(first.notes).toBe('my strongest area; open to platform/infra adjacent roles');
  });

  it('returns empty array when section is absent', () => {
    expect(parseTargetRoles('## Summary\n\nHello world')).toEqual([]);
  });

  it('returns empty array when section has no roles', () => {
    const body = '## Target roles\n\nNo roles defined yet.\n\n## Experience\n';
    expect(parseTargetRoles(body)).toEqual([]);
  });

  it('handles roles with missing fields gracefully', () => {
    const body = `## Target roles

### my-role — My Role [primary]

- Level: Senior

## Experience
`;
    const roles = parseTargetRoles(body);
    expect(roles).toHaveLength(1);
    expect(roles[0]).toMatchObject({
      slug: 'my-role',
      title: 'My Role',
      priority: 'primary',
      level: 'Senior',
      domain: '',
      stack: '',
      workStyle: '',
      compensation: '',
      notes: '',
    });
  });

  it('stops at the next H2 heading', () => {
    const body = `## Target roles

### role-a — Role A [primary]

- Level: Senior

## Experience

### role-b — Role B [primary]

- Level: Staff
`;
    const roles = parseTargetRoles(body);
    expect(roles).toHaveLength(1);
    expect(roles[0]!.slug).toBe('role-a');
  });
});

describe('findTargetRole', () => {
  it('finds a role by slug', () => {
    const role = findTargetRole(PROFILE_BODY, 'staff-engineer');
    expect(role).not.toBeNull();
    expect(role!.title).toBe('Staff Engineer');
    expect(role!.priority).toBe('stretch');
  });

  it('returns null for unknown slug', () => {
    expect(findTargetRole(PROFILE_BODY, 'nonexistent')).toBeNull();
  });
});

describe('replaceTargetRoles', () => {
  it('replaces the existing section', () => {
    const newRoles = [
      {
        slug: 'new-role',
        title: 'New Role',
        priority: 'primary' as const,
        level: 'Senior',
        domain: 'Backend',
        stack: 'TypeScript',
        workStyle: 'Remote',
        compensation: '150k AUD',
        notes: 'test',
      },
    ];
    const result = replaceTargetRoles(PROFILE_BODY, newRoles);
    const roles = parseTargetRoles(result);
    expect(roles).toHaveLength(1);
    expect(roles[0]!.slug).toBe('new-role');
  });

  it('preserves content before and after the section', () => {
    const newRoles = [
      {
        slug: 'x',
        title: 'X',
        priority: 'primary' as const,
        level: '',
        domain: '',
        stack: '',
        workStyle: '',
        compensation: '',
        notes: '',
      },
    ];
    const result = replaceTargetRoles(PROFILE_BODY, newRoles);
    expect(result).toContain('## Summary');
    expect(result).toContain('## Experience');
  });

  it('appends section when absent', () => {
    const body = '## Summary\n\nHello world\n';
    const newRoles = [
      {
        slug: 'added',
        title: 'Added Role',
        priority: 'secondary' as const,
        level: 'Mid',
        domain: '',
        stack: '',
        workStyle: '',
        compensation: '',
        notes: '',
      },
    ];
    const result = replaceTargetRoles(body, newRoles);
    expect(result).toContain('## Target roles');
    const roles = parseTargetRoles(result);
    expect(roles).toHaveLength(1);
    expect(roles[0]!.slug).toBe('added');
  });

  it('includes the section marker', () => {
    const newRoles = [
      {
        slug: 'r',
        title: 'R',
        priority: 'primary' as const,
        level: '',
        domain: '',
        stack: '',
        workStyle: '',
        compensation: '',
        notes: '',
      },
    ];
    const result = replaceTargetRoles(PROFILE_BODY, newRoles);
    expect(result).toContain('<!-- jho:target-roles -->');
  });
});

describe('isValidRoleSlug', () => {
  it('accepts valid slugs', () => {
    expect(isValidRoleSlug('senior-backend-engineer')).toBe(true);
    expect(isValidRoleSlug('em')).toBe(true);
    expect(isValidRoleSlug('staff-engineer')).toBe(true);
  });

  it('rejects invalid slugs', () => {
    expect(isValidRoleSlug('')).toBe(false);
    expect(isValidRoleSlug('Senior-Backend')).toBe(false);
    expect(isValidRoleSlug('has space')).toBe(false);
    expect(isValidRoleSlug('has_underscore')).toBe(false);
    expect(isValidRoleSlug('-starts-with-hyphen')).toBe(false);
    expect(isValidRoleSlug('ends-with-hyphen-')).toBe(false);
  });
});
