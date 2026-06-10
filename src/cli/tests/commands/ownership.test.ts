import { describe, expect, it } from 'vitest';
import { renderOwnership } from '../../../core/ownership.js';

describe('ownership command logic', () => {
  it('renderOwnership produces a table with expected columns', () => {
    const out = renderOwnership({ configPath: '/tmp/cfg.json' });
    expect(out).toContain('File');
    expect(out).toContain('Tool writes');
    expect(out).toContain('Edit freely?');
    expect(out).toContain('meta.md');
    expect(out).toContain('jd.md');
    expect(out).toContain('cover-letter.md');
  });

  it('renderOwnership --markdown produces markdown table', () => {
    const out = renderOwnership({ markdown: true, configPath: '/tmp/cfg.json' });
    expect(out).toContain('| File');
    expect(out).toContain('| --- |');
  });
});
