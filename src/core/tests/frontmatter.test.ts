import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import {
  FrontmatterParseError,
  mergeFrontmatter,
  parseFrontmatter,
  readFrontmatter,
  serializeFrontmatter,
  writeFrontmatter,
} from '../frontmatter.js';

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'jho-fm-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('parseFrontmatter', () => {
  it('parses YAML frontmatter + body', () => {
    const content = `---
slug: 2026-Jun-03-SE-Foo-1
status: applied
---
# Notes

Some text.`;
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({ slug: '2026-Jun-03-SE-Foo-1', status: 'applied' });
    expect(body).toBe('# Notes\n\nSome text.');
  });

  it('returns empty frontmatter when there is no block', () => {
    const content = 'just body, no frontmatter';
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe('just body, no frontmatter');
  });

  it('handles empty YAML block (--- \\n ---)', () => {
    const content = '---\n\n---\nbody';
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe('body');
  });

  it('preserves array values', () => {
    const content = `---
tags:
  - typescript
  - react
---
`;
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({ tags: ['typescript', 'react'] });
    expect(body).toBe('');
  });

  it('preserves custom user fields', () => {
    const content = `---
slug: foo
priority: high
reviewer: alice
---
`;
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter).toEqual({ slug: 'foo', priority: 'high', reviewer: 'alice' });
  });

  it('throws FrontmatterParseError on invalid YAML', () => {
    const content = `---
slug: : :
status: applied
---`;
    expect(() => parseFrontmatter(content)).toThrow(FrontmatterParseError);
  });

  it('throws when frontmatter is a YAML array', () => {
    const content = `---
- one
- two
---`;
    expect(() => parseFrontmatter(content)).toThrow(FrontmatterParseError);
  });

  it('handles CRLF line endings', () => {
    const content = '---\r\nslug: foo\r\n---\r\nbody';
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({ slug: 'foo' });
    expect(body).toBe('body');
  });
});

describe('serializeFrontmatter', () => {
  it('serializes a flat mapping with the --- delimiters', () => {
    const fm = { slug: 'foo', status: 'applied' };
    const out = serializeFrontmatter(fm, '');
    expect(out).toBe('---\nslug: foo\nstatus: applied\n---\n');
  });

  it('strips leading newlines from the body', () => {
    const out = serializeFrontmatter({}, '\nhello');
    expect(out).toBe('---\n{}\n---\nhello');
  });

  it('strips multiple leading newlines (body starts immediately after ---)', () => {
    const out = serializeFrontmatter({}, '\n\n\nhello');
    expect(out).toBe('---\n{}\n---\nhello');
  });

  it('round-trips arrays', () => {
    const fm = { tags: ['a', 'b', 'c'] };
    const out = serializeFrontmatter(fm, '');
    const { frontmatter } = parseFrontmatter(out);
    expect(frontmatter).toEqual(fm);
  });

  it('preserves key insertion order', () => {
    const fm: Record<string, unknown> = {};
    fm['zebra'] = 1;
    fm['alpha'] = 2;
    fm['mango'] = 3;
    const out = serializeFrontmatter(fm, '');
    expect(out).toBe('---\nzebra: 1\nalpha: 2\nmango: 3\n---\n');
  });
});

describe('readFrontmatter + writeFrontmatter', () => {
  it('round-trips a real file', async () => {
    const path = join(workDir, 'meta.md');
    const fm = { slug: 'foo', status: 'applied', tags: ['a'] };
    const body = '# Notes\n\nMy own text.';
    await writeFrontmatter(path, fm, body);
    const result = await readFrontmatter(path);
    expect(result.frontmatter).toEqual(fm);
    expect(result.body).toBe(body);
  });

  it('writeFrontmatter is atomic (uses fs.rename)', async () => {
    const path = join(workDir, 'meta.md');
    await writeFile(path, '---\nold: 1\n---\nold body', 'utf8');
    await writeFrontmatter(path, { old: 2, new: 3 }, 'new body');
    const result = await readFrontmatter(path);
    expect(result.frontmatter).toEqual({ old: 2, new: 3 });
    expect(result.body).toBe('new body');
  });
});

describe('mergeFrontmatter', () => {
  it('updates known fields and preserves custom ones', () => {
    const existing = { slug: 'foo', priority: 'high', reviewer: 'alice' };
    const updates = { status: 'applied' };
    expect(mergeFrontmatter(existing, updates)).toEqual({
      slug: 'foo',
      priority: 'high',
      reviewer: 'alice',
      status: 'applied',
    });
  });

  it('overwrites existing values when keys collide', () => {
    expect(mergeFrontmatter({ status: 'applied' }, { status: 'interview' })).toEqual({
      status: 'interview',
    });
  });
});
