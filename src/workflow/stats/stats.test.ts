import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { computeStats } from './stats.js';

const mockLog = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  })),
}));
vi.mock('../../lib/logger/logger.js', () => ({
  moduleLogger: vi.fn(() => mockLog),
  getRootLogger: vi.fn(() => mockLog),
  childLogger: vi.fn(() => mockLog),
}));

describe('computeStats employmentType branches 63-64,67-68', () => {
  let testDir: string;
  let appliedDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'jho-stats-wf-'));
    appliedDir = join(testDir, 'applied');
    await mkdir(appliedDir, { recursive: true });
  });
  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  async function writeIndex(entries: Record<string, unknown>[]) {
    for (const e of entries) {
      await mkdir(join(appliedDir, e.slug as string), { recursive: true });
    }
    await writeFile(join(appliedDir, '.index.json'), JSON.stringify(entries, null, 2) + '\n');
  }

  it('filters by employmentType and returns only matching entries', async () => {
    await writeIndex([
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'applied',
        appliedOn: '2026-06-01',
        site: '',
        targetRole: '',
        employmentType: 'permanent',
        tags: [],
      },
      {
        slug: '2026-Jun-02-SE-Beta',
        status: 'applied',
        appliedOn: '2026-06-02',
        site: '',
        targetRole: '',
        employmentType: 'contract',
        tags: [],
      },
      {
        slug: '2026-Jun-03-SE-Gamma',
        status: 'applied',
        appliedOn: '2026-06-03',
        site: '',
        targetRole: '',
        employmentType: 'permanent',
        tags: [],
      },
    ]);
    const stats = await computeStats(appliedDir, { employmentType: 'permanent' });
    expect(stats.total).toBe(2);
    expect(stats.byEmploymentType['permanent']).toBe(2);
  });

  it('returns emptyStats with since when employmentType filter yields no entries (line 67-68)', async () => {
    await writeIndex([
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'applied',
        appliedOn: '2026-06-01',
        site: '',
        targetRole: '',
        employmentType: 'permanent',
        tags: [],
      },
    ]);
    const stats = await computeStats(appliedDir, { employmentType: 'contract' });
    expect(stats.total).toBe(0);
    expect(stats.funnel).toEqual({ applied: 0, interview: 0, offer: 0, accepted: 0 });
  });

  it('returns emptyStats with since iso when since+employmentType filter yields no entries', async () => {
    await writeIndex([
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'applied',
        appliedOn: '2026-06-01',
        site: '',
        targetRole: '',
        employmentType: 'permanent',
        tags: [],
      },
    ]);
    const stats = await computeStats(appliedDir, {
      since: '2026-06-10',
      employmentType: 'permanent',
    });
    expect(stats.total).toBe(0);
    expect(stats.since).toBe('2026-06-10');
  });

  it('counts by employmentType including empty key', async () => {
    await writeIndex([
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'applied',
        appliedOn: '2026-06-01',
        site: '',
        targetRole: '',
        employmentType: 'permanent',
        tags: [],
      },
      {
        slug: '2026-Jun-02-SE-Beta',
        status: 'applied',
        appliedOn: '2026-06-02',
        site: '',
        targetRole: '',
        tags: [],
      },
    ]);
    const stats = await computeStats(appliedDir);
    expect(stats.byEmploymentType['permanent']).toBe(1);
    expect(stats.byEmploymentType['']).toBe(1);
  });

  it('throws InvalidSinceError for bad since value (covers 63-64 catch)', async () => {
    await writeIndex([
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'applied',
        appliedOn: '2026-06-01',
        site: '',
        targetRole: '',
        tags: [],
      },
    ]);
    await expect(computeStats(appliedDir, { since: 'not-a-date' })).rejects.toThrow(
      /invalid --since/i,
    );
  });

  it('covers accepted heuristic catch when meta.md missing (line 142-145)', async () => {
    await writeIndex([
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'offer',
        appliedOn: '2026-06-01',
        site: '',
        targetRole: '',
        tags: [],
      },
    ]);
    // No meta.md file created -> readApplication will throw, caught
    const stats = await computeStats(appliedDir);
    expect(stats.funnel.offer).toBe(1);
    expect(stats.funnel.accepted).toBe(0);
  });

  it('covers includeInterviewEntries false branch', async () => {
    await writeIndex([
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'applied',
        appliedOn: '2026-06-01',
        site: '',
        targetRole: '',
        tags: [],
      },
    ]);
    const stats = await computeStats(appliedDir, { includeInterviewEntries: false });
    expect(stats.interviewEntryCount).toBe(0);
  });
});
