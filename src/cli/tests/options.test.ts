import { describe, expect, it } from 'vitest';
import { collectTags } from '../options.js';

describe('collectTags', () => {
  it('appends a tag to an empty array', () => {
    expect(collectTags('typescript', [])).toEqual(['typescript']);
  });

  it('appends a tag to an existing array', () => {
    expect(collectTags('react', ['node', 'ts'])).toEqual(['node', 'ts', 'react']);
  });

  it('does not mutate the previous array', () => {
    const prev = ['a', 'b'];
    collectTags('c', prev);
    expect(prev).toEqual(['a', 'b']);
  });
});
