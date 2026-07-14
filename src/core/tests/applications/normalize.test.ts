import { describe, expect, it } from 'vitest';
import { parseEmploymentType } from '../../applications/normalize.js';

describe('parseEmploymentType', () => {
  describe('permanent variants', () => {
    it('returns permanent for exact match', () => {
      expect(parseEmploymentType('permanent')).toBe('permanent');
    });

    it('returns permanent for full-time', () => {
      expect(parseEmploymentType('full-time')).toBe('permanent');
    });

    it('returns permanent for fulltime', () => {
      expect(parseEmploymentType('fulltime')).toBe('permanent');
    });

    it('returns permanent for ft', () => {
      expect(parseEmploymentType('ft')).toBe('permanent');
    });

    it('returns permanent for regular', () => {
      expect(parseEmploymentType('regular')).toBe('permanent');
    });

    it('returns permanent for ongoing', () => {
      expect(parseEmploymentType('ongoing')).toBe('permanent');
    });

    it('returns permanent for employee', () => {
      expect(parseEmploymentType('employee')).toBe('permanent');
    });

    it('returns permanent for full time (with space)', () => {
      expect(parseEmploymentType('full time')).toBe('permanent');
    });

    it('handles case insensitivity', () => {
      expect(parseEmploymentType('FULL-TIME')).toBe('permanent');
      expect(parseEmploymentType('Full-Time')).toBe('permanent');
      expect(parseEmploymentType('Permanent')).toBe('permanent');
    });

    it('handles whitespace', () => {
      expect(parseEmploymentType('  full-time  ')).toBe('permanent');
    });
  });

  describe('part-time variants', () => {
    it('returns part-time for exact match', () => {
      expect(parseEmploymentType('part-time')).toBe('part-time');
    });

    it('returns part-time for parttime', () => {
      expect(parseEmploymentType('parttime')).toBe('part-time');
    });

    it('returns part-time for pt', () => {
      expect(parseEmploymentType('pt')).toBe('part-time');
    });

    it('returns part-time for half-time', () => {
      expect(parseEmploymentType('half-time')).toBe('part-time');
    });

    it('returns part-time for part time', () => {
      expect(parseEmploymentType('part time')).toBe('part-time');
    });

    it('handles case insensitivity', () => {
      expect(parseEmploymentType('PART-TIME')).toBe('part-time');
      expect(parseEmploymentType('Part-Time')).toBe('part-time');
    });

    it('handles whitespace', () => {
      expect(parseEmploymentType('  part-time  ')).toBe('part-time');
    });
  });

  describe('contract variants', () => {
    it('returns contract for exact match', () => {
      expect(parseEmploymentType('contract')).toBe('contract');
    });

    it('returns contract for contractor', () => {
      expect(parseEmploymentType('contractor')).toBe('contract');
    });

    it('returns contract for freelance', () => {
      expect(parseEmploymentType('freelance')).toBe('contract');
    });

    it('returns contract for freelancer', () => {
      expect(parseEmploymentType('freelancer')).toBe('contract');
    });

    it('returns contract for consulting', () => {
      expect(parseEmploymentType('consulting')).toBe('contract');
    });

    it('returns contract for consultant', () => {
      expect(parseEmploymentType('consultant')).toBe('contract');
    });

    it('returns contract for fixed-term', () => {
      expect(parseEmploymentType('fixed-term')).toBe('contract');
    });

    it('returns contract for fixed term', () => {
      expect(parseEmploymentType('fixed term')).toBe('contract');
    });

    it('returns contract for fixedterm', () => {
      expect(parseEmploymentType('fixedterm')).toBe('contract');
    });

    it('handles case insensitivity', () => {
      expect(parseEmploymentType('CONTRACT')).toBe('contract');
      expect(parseEmploymentType('Freelance')).toBe('contract');
    });

    it('handles whitespace', () => {
      expect(parseEmploymentType('  contract  ')).toBe('contract');
    });
  });

  describe('temp variants', () => {
    it('returns temp for exact match', () => {
      expect(parseEmploymentType('temp')).toBe('temp');
    });

    it('returns temp for temporary', () => {
      expect(parseEmploymentType('temporary')).toBe('temp');
    });

    it('returns temp for temporary contract', () => {
      expect(parseEmploymentType('temporary contract')).toBe('temp');
    });

    it('returns temp for seasonal', () => {
      expect(parseEmploymentType('seasonal')).toBe('temp');
    });

    it('returns temp for internship', () => {
      expect(parseEmploymentType('internship')).toBe('temp');
    });

    it('returns temp for intern', () => {
      expect(parseEmploymentType('intern')).toBe('temp');
    });

    it('handles case insensitivity', () => {
      expect(parseEmploymentType('TEMP')).toBe('temp');
      expect(parseEmploymentType('Temporary')).toBe('temp');
    });

    it('handles whitespace', () => {
      expect(parseEmploymentType('  temp  ')).toBe('temp');
    });
  });

  describe('casual variants', () => {
    it('returns casual for exact match', () => {
      expect(parseEmploymentType('casual')).toBe('casual');
    });

    it('returns casual for on-call', () => {
      expect(parseEmploymentType('on-call')).toBe('casual');
    });

    it('returns casual for on call', () => {
      expect(parseEmploymentType('on call')).toBe('casual');
    });

    it('returns casual for zero hours', () => {
      expect(parseEmploymentType('zero hours')).toBe('casual');
    });

    it('returns casual for zerohours', () => {
      expect(parseEmploymentType('zerohours')).toBe('casual');
    });

    it('returns casual for zero-hours', () => {
      expect(parseEmploymentType('zero-hours')).toBe('casual');
    });

    it('handles case insensitivity', () => {
      expect(parseEmploymentType('CASUAL')).toBe('casual');
      expect(parseEmploymentType('On-Call')).toBe('casual');
    });

    it('handles whitespace', () => {
      expect(parseEmploymentType('  casual  ')).toBe('casual');
    });
  });

  describe('rejection variant', () => {
    it('returns temp for rejection (fallback for rejection apps)', () => {
      expect(parseEmploymentType('rejection')).toBe('temp');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for undefined', () => {
      expect(parseEmploymentType(undefined)).toBe('');
    });

    it('returns empty string for null', () => {
      expect(parseEmploymentType(null as unknown as string)).toBe('');
    });

    it('returns empty string for empty string', () => {
      expect(parseEmploymentType('')).toBe('');
    });

    it('returns empty string for unknown value', () => {
      expect(parseEmploymentType('unknown')).toBe('');
      expect(parseEmploymentType('random')).toBe('');
      expect(parseEmploymentType('freelance-contract')).toBe('');
    });

    it('returns empty string for whitespace only', () => {
      expect(parseEmploymentType('   ')).toBe('');
    });
  });
});
