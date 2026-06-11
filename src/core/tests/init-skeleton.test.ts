import { describe, expect, it } from 'vitest';
import { generateSkeletonProfile } from '../init/skeleton.js';

describe('generateSkeletonProfile', () => {
  it('includes GitHub user when provided', () => {
    const result = generateSkeletonProfile('testuser');
    expect(result).toContain('GitHub: testuser');
  });

  it('has empty GitHub when empty string provided', () => {
    const result = generateSkeletonProfile('');
    expect(result).toContain('GitHub: ');
  });

  it('contains all required sections', () => {
    const result = generateSkeletonProfile('');
    expect(result).toContain('# Profile');
    expect(result).toContain('## Contact');
    expect(result).toContain('## Summary');
    expect(result).toContain('## Skills');
    expect(result).toContain('## Experience');
    expect(result).toContain('## Education');
    expect(result).toContain('## Notable projects');
    expect(result).toContain('## Preferences');
    expect(result).toContain('## Target roles');
  });

  it('contains target roles marker', () => {
    const result = generateSkeletonProfile('');
    expect(result).toContain('<!-- jho:target-roles');
  });

  it('contains placeholder fields', () => {
    const result = generateSkeletonProfile('');
    expect(result).toContain('- Email:');
    expect(result).toContain('- Phone:');
    expect(result).toContain('- Location:');
    expect(result).toContain('- Work style:');
    expect(result).toContain('- Work rights:');
    expect(result).toContain('- Notice period:');
  });
});
