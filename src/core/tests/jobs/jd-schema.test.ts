import { describe, it, expect } from 'vitest';
import { ExtractedJdSchema } from '../../jobs/jd-schema.js';

describe('ExtractedJdSchema', () => {
  const validMinimal = {
    title: 'Engineer',
    company: 'TestCo',
    description: 'Full job description text.',
  };

  it('accepts minimal valid input', () => {
    const result = ExtractedJdSchema.parse(validMinimal);
    expect(result.title).toBe('Engineer');
    expect(result.company).toBe('TestCo');
    expect(result.description).toBe('Full job description text.');
  });

  it('accepts all fields populated', () => {
    const full = {
      ...validMinimal,
      location: 'Remote',
      salary: '100k',
      tags: ['react', 'typescript'],
      requirements: ['5 years experience'],
      qualifications: ['CS degree'],
      benefits: ['health insurance'],
      employmentType: 'full-time',
      seniorityLevel: 'senior',
    };
    const result = ExtractedJdSchema.parse(full);
    expect(result.location).toBe('Remote');
    expect(result.requirements).toEqual(['5 years experience']);
    expect(result.employmentType).toBe('full-time');
  });

  it('rejects empty title', () => {
    expect(() => ExtractedJdSchema.parse({ ...validMinimal, title: '' })).toThrow();
  });

  it('rejects empty company', () => {
    expect(() => ExtractedJdSchema.parse({ ...validMinimal, company: '' })).toThrow();
  });

  it('rejects empty description', () => {
    expect(() => ExtractedJdSchema.parse({ ...validMinimal, description: '' })).toThrow();
  });

  describe('null handling for optional fields', () => {
    it('treats null location as undefined', () => {
      const result = ExtractedJdSchema.parse({
        ...validMinimal,
        location: null,
      });
      expect(result.location).toBeUndefined();
    });

    it('treats null salary as undefined', () => {
      const result = ExtractedJdSchema.parse({
        ...validMinimal,
        salary: null,
      });
      expect(result.salary).toBeUndefined();
    });

    it('treats null employmentType as undefined', () => {
      const result = ExtractedJdSchema.parse({
        ...validMinimal,
        employmentType: null,
      });
      expect(result.employmentType).toBeUndefined();
    });

    it('treats null seniorityLevel as undefined', () => {
      const result = ExtractedJdSchema.parse({
        ...validMinimal,
        seniorityLevel: null,
      });
      expect(result.seniorityLevel).toBeUndefined();
    });

    it('treats empty string location as undefined', () => {
      const result = ExtractedJdSchema.parse({
        ...validMinimal,
        location: '',
      });
      expect(result.location).toBeUndefined();
    });
  });

  describe('array coercion for requirements/qualifications/benefits', () => {
    it('handles plain string array', () => {
      const result = ExtractedJdSchema.parse({
        ...validMinimal,
        requirements: ['req1', 'req2'],
      });
      expect(result.requirements).toEqual(['req1', 'req2']);
    });

    it('handles objects with .text property', () => {
      const result = ExtractedJdSchema.parse({
        ...validMinimal,
        requirements: [{ text: 'First requirement' }, { text: 'Second requirement' }],
      });
      expect(result.requirements).toEqual(['First requirement', 'Second requirement']);
    });

    it('handles mixed strings and objects', () => {
      const result = ExtractedJdSchema.parse({
        ...validMinimal,
        qualifications: ['Plain string requirement', { text: 'Object requirement' }],
      });
      expect(result.qualifications).toEqual(['Plain string requirement', 'Object requirement']);
    });

    it('filters out null entries in arrays', () => {
      const result = ExtractedJdSchema.parse({
        ...validMinimal,
        benefits: ['benefit1', null, 'benefit2'],
      });
      expect(result.benefits).toEqual(['benefit1', 'benefit2']);
    });

    it('filters out objects without .text', () => {
      const result = ExtractedJdSchema.parse({
        ...validMinimal,
        requirements: ['valid', { noText: true }],
      });
      expect(result.requirements).toEqual(['valid']);
    });

    it('filters out empty strings from arrays', () => {
      const result = ExtractedJdSchema.parse({
        ...validMinimal,
        requirements: ['req1', '', 'req2'],
      });
      expect(result.requirements).toEqual(['req1', 'req2']);
    });

    it('returns undefined when array is not provided', () => {
      const result = ExtractedJdSchema.parse(validMinimal);
      expect(result.requirements).toBeUndefined();
      expect(result.qualifications).toBeUndefined();
      expect(result.benefits).toBeUndefined();
    });
  });

  describe('tags (no coercion, strict string array)', () => {
    it('accepts valid tags', () => {
      const result = ExtractedJdSchema.parse({
        ...validMinimal,
        tags: ['react', 'typescript'],
      });
      expect(result.tags).toEqual(['react', 'typescript']);
    });

    it('rejects non-string tags', () => {
      expect(() =>
        ExtractedJdSchema.parse({
          ...validMinimal,
          tags: [{ text: 'react' }],
        }),
      ).toThrow();
    });
  });
});
