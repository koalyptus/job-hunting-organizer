import { describe, expect, it } from 'vitest';
import {
  ApplicationStatusSchema,
  ApplicationFrontmatterSchema,
  validateApplicationFrontmatter,
  safeValidateApplicationFrontmatter,
} from '../../applications/index.js';

describe('ApplicationStatusSchema', () => {
  it('accepts all valid statuses', () => {
    const statuses = [
      'applied',
      'interview',
      'offer',
      'rejected',
      'withdrawn',
      'abandoned',
      'ghosted',
      'accepted',
    ];
    for (const s of statuses) {
      expect(ApplicationStatusSchema.parse(s)).toBe(s);
    }
  });

  it('rejects invalid statuses', () => {
    expect(() => ApplicationStatusSchema.parse('pending')).toThrow();
    expect(() => ApplicationStatusSchema.parse('')).toThrow();
  });
});

describe('ApplicationFrontmatterSchema', () => {
  it('parses a minimal valid frontmatter', () => {
    const raw = {
      slug: '2026-Jun-03-SE-Foo-123',
      appliedOn: '2026-06-03',
    };
    const result = ApplicationFrontmatterSchema.parse(raw);
    expect(result.slug).toBe('2026-Jun-03-SE-Foo-123');
    expect(result.status).toBe('applied');
    expect(result.appliedOn).toBe('2026-06-03');
    expect(result.title).toBe('');
    expect(result.company).toBe('');
    expect(result.tags).toEqual([]);
    expect(result.targetRole).toBe('');
  });

  it('parses a fully populated frontmatter', () => {
    const raw = {
      slug: '2026-Jun-03-SE-Nuage-92448554',
      status: 'interview',
      appliedOn: '2026-06-03',
      title: 'Software Engineer',
      company: 'Nuage Technology Group',
      location: 'Sydney NSW',
      site: 'Seek',
      link: 'https://au.seek.com/job/92448554',
      salary: '120k AUD',
      tags: ['typescript', 'react'],
      targetRole: 'senior-backend-engineer',
    };
    const result = ApplicationFrontmatterSchema.parse(raw);
    expect(result.status).toBe('interview');
    expect(result.title).toBe('Software Engineer');
    expect(result.tags).toEqual(['typescript', 'react']);
    expect(result.targetRole).toBe('senior-backend-engineer');
  });

  it('defaults missing optional fields', () => {
    const raw = {
      slug: '2026-Jun-03-SE-Foo',
      appliedOn: '2026-06-03',
      status: 'offer',
    };
    const result = ApplicationFrontmatterSchema.parse(raw);
    expect(result.location).toBe('');
    expect(result.site).toBe('');
    expect(result.link).toBe('');
    expect(result.salary).toBe('');
    expect(result.tags).toEqual([]);
    expect(result.targetRole).toBe('');
  });

  it('rejects invalid status', () => {
    const raw = {
      slug: 'foo',
      appliedOn: '2026-06-03',
      status: 'invalid-status',
    };
    expect(() => ApplicationFrontmatterSchema.parse(raw)).toThrow();
  });

  it('rejects missing slug', () => {
    const raw = { appliedOn: '2026-06-03' };
    expect(() => ApplicationFrontmatterSchema.parse(raw)).toThrow();
  });

  it('defaults appliedOn to today when missing', () => {
    const raw = { slug: 'foo' };
    const result = ApplicationFrontmatterSchema.parse(raw);
    expect(result.appliedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('validateApplicationFrontmatter', () => {
  it('returns validated data on success', () => {
    const raw = {
      slug: '2026-Jun-03-SE-Foo',
      appliedOn: '2026-06-03',
    };
    const result = validateApplicationFrontmatter(raw);
    expect(result.slug).toBe('2026-Jun-03-SE-Foo');
    expect(result.status).toBe('applied');
  });

  it('throws on invalid status', () => {
    const raw = { slug: 'foo', appliedOn: '2026-06-03', status: 'invalid' };
    expect(() => validateApplicationFrontmatter(raw)).toThrow();
  });
});

describe('safeValidateApplicationFrontmatter', () => {
  it('returns success: true with data on valid input', () => {
    const raw = {
      slug: '2026-Jun-03-SE-Foo',
      appliedOn: '2026-06-03',
    };
    const result = safeValidateApplicationFrontmatter(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slug).toBe('2026-Jun-03-SE-Foo');
    }
  });

  it('returns success: false with issues on invalid status', () => {
    const raw = { slug: 'foo', appliedOn: '2026-06-03', status: 'invalid' };
    const result = safeValidateApplicationFrontmatter(raw);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});
