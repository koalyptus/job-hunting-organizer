import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { computeStats } from '../../stats/stats.js';

describe('computeStats', () => {
  let testDir: string;
  let appliedDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'jho-stats-'));
    appliedDir = join(testDir, 'applied');
    await mkdir(appliedDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  async function writeIndex(entries: object[]) {
    await writeFile(join(appliedDir, '.index.json'), JSON.stringify(entries, null, 2) + '\n');
  }

  async function writeMeta(slug: string, frontmatter: Record<string, unknown>, body = '') {
    const dir = join(appliedDir, slug);
    await mkdir(dir, { recursive: true });
    const fmLines = Object.entries(frontmatter)
      .map(([k, v]) => {
        if (Array.isArray(v)) {
          return `${k}: [${v.map((x) => `"${x}"`).join(', ')}]`;
        }
        return `${k}: "${v}"`;
      })
      .join('\n');
    await writeFile(join(dir, 'meta.md'), `---\n${fmLines}\n---\n${body}\n`);
  }

  it('returns all zeros for an empty campaign', async () => {
    const stats = await computeStats(appliedDir);
    expect(stats.total).toBe(0);
    expect(stats.since).toBeUndefined();
    expect(stats.funnel).toEqual({ applied: 0, interview: 0, offer: 0, accepted: 0 });
    expect(stats.thisMonth).toEqual({ applied: 0, rejected: 0, offer: 0, withdrawn: 0 });
  });

  it('counts by status', async () => {
    await writeIndex([
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'applied',
        appliedOn: '2026-06-01',
        site: '',
        targetRole: '',
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
      {
        slug: '2026-Jun-03-SE-Gamma',
        status: 'interview',
        appliedOn: '2026-06-03',
        site: '',
        targetRole: '',
        tags: [],
      },
      {
        slug: '2026-Jun-04-SE-Delta',
        status: 'offer',
        appliedOn: '2026-06-04',
        site: '',
        targetRole: '',
        tags: [],
      },
      {
        slug: '2026-Jun-05-SE-Epsilon',
        status: 'rejected',
        appliedOn: '2026-06-05',
        site: '',
        targetRole: '',
        tags: [],
      },
    ]);

    const stats = await computeStats(appliedDir);
    expect(stats.total).toBe(5);
    expect(stats.byStatus.applied).toBe(2);
    expect(stats.byStatus.interview).toBe(1);
    expect(stats.byStatus.offer).toBe(1);
    expect(stats.byStatus.rejected).toBe(1);
    expect(stats.byStatus.withdrawn).toBe(0);
    expect(stats.byStatus.abandoned).toBe(0);
    expect(stats.byStatus.ghosted).toBe(0);
    expect(stats.byStatus.accepted).toBe(0);
  });

  it('counts by role including unassigned', async () => {
    await writeIndex([
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'applied',
        appliedOn: '2026-06-01',
        site: '',
        targetRole: 'senior-backend',
        tags: [],
      },
      {
        slug: '2026-Jun-02-SE-Beta',
        status: 'applied',
        appliedOn: '2026-06-02',
        site: '',
        targetRole: 'senior-backend',
        tags: [],
      },
      {
        slug: '2026-Jun-03-SE-Gamma',
        status: 'applied',
        appliedOn: '2026-06-03',
        site: '',
        targetRole: '',
        tags: [],
      },
    ]);

    const stats = await computeStats(appliedDir);
    expect(stats.byRole['senior-backend']).toBe(2);
    expect(stats.byRole['']).toBe(1);
  });

  it('counts by site including unknown', async () => {
    await writeIndex([
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'applied',
        appliedOn: '2026-06-01',
        site: 'Seek',
        targetRole: '',
        tags: [],
      },
      {
        slug: '2026-Jun-02-SE-Beta',
        status: 'applied',
        appliedOn: '2026-06-02',
        site: 'LinkedIn',
        targetRole: '',
        tags: [],
      },
      {
        slug: '2026-Jun-03-SE-Gamma',
        status: 'applied',
        appliedOn: '2026-06-03',
        site: '',
        targetRole: '',
        tags: [],
      },
    ]);

    const stats = await computeStats(appliedDir);
    expect(stats.bySite['Seek']).toBe(1);
    expect(stats.bySite['LinkedIn']).toBe(1);
    expect(stats.bySite['']).toBe(1);
  });

  it('computes funnel from status counts', async () => {
    await writeIndex([
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'applied',
        appliedOn: '2026-06-01',
        site: '',
        targetRole: '',
        tags: [],
      },
      {
        slug: '2026-Jun-02-SE-Beta',
        status: 'interview',
        appliedOn: '2026-06-02',
        site: '',
        targetRole: '',
        tags: [],
      },
      {
        slug: '2026-Jun-03-SE-Gamma',
        status: 'offer',
        appliedOn: '2026-06-03',
        site: '',
        targetRole: '',
        tags: [],
      },
      {
        slug: '2026-Jun-04-SE-Delta',
        status: 'accepted',
        appliedOn: '2026-06-04',
        site: '',
        targetRole: '',
        tags: [],
      },
    ]);

    const stats = await computeStats(appliedDir);
    expect(stats.funnel.applied).toBe(1);
    expect(stats.funnel.interview).toBe(1);
    expect(stats.funnel.offer).toBe(1);
    expect(stats.funnel.accepted).toBe(1);
  });

  it('applies accepted heuristic from meta.md body', async () => {
    await writeMeta(
      '2026-Jun-01-SE-Acme',
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'offer',
        appliedOn: '2026-06-01',
        site: '',
        targetRole: '',
      },
      'I have accepted this offer.',
    );
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

    const stats = await computeStats(appliedDir);
    expect(stats.funnel.offer).toBe(0);
    expect(stats.funnel.accepted).toBe(1);
  });

  it('applies accepted heuristic for "joining"', async () => {
    await writeMeta(
      '2026-Jun-01-SE-Acme',
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'offer',
        appliedOn: '2026-06-01',
        site: '',
        targetRole: '',
      },
      'Looking forward to joining the team.',
    );
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

    const stats = await computeStats(appliedDir);
    expect(stats.funnel.offer).toBe(0);
    expect(stats.funnel.accepted).toBe(1);
  });

  it('does not apply accepted heuristic when body has no match', async () => {
    await writeMeta(
      '2026-Jun-01-SE-Acme',
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'offer',
        appliedOn: '2026-06-01',
        site: '',
        targetRole: '',
      },
      'This is just a regular note.',
    );
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

    const stats = await computeStats(appliedDir);
    expect(stats.funnel.offer).toBe(1);
    expect(stats.funnel.accepted).toBe(0);
  });

  it('counts this-month delta correctly', async () => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const thisMonthDate = `${y}-${m}-15`;
    const lastMonth = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth();
    const lastMonthM = String(lastMonth).padStart(2, '0');
    const lastMonthDate = `${y}-${lastMonthM}-15`;

    await writeIndex([
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'applied',
        appliedOn: thisMonthDate,
        site: '',
        targetRole: '',
        tags: [],
      },
      {
        slug: '2026-Jun-02-SE-Beta',
        status: 'rejected',
        appliedOn: thisMonthDate,
        site: '',
        targetRole: '',
        tags: [],
      },
      {
        slug: '2026-Jun-03-SE-Gamma',
        status: 'offer',
        appliedOn: thisMonthDate,
        site: '',
        targetRole: '',
        tags: [],
      },
      {
        slug: '2026-Jun-04-SE-Delta',
        status: 'withdrawn',
        appliedOn: thisMonthDate,
        site: '',
        targetRole: '',
        tags: [],
      },
      {
        slug: '2026-Jun-05-SE-Epsilon',
        status: 'applied',
        appliedOn: lastMonthDate,
        site: '',
        targetRole: '',
        tags: [],
      },
    ]);

    const stats = await computeStats(appliedDir);
    expect(stats.thisMonth.applied).toBe(1);
    expect(stats.thisMonth.rejected).toBe(1);
    expect(stats.thisMonth.offer).toBe(1);
    expect(stats.thisMonth.withdrawn).toBe(1);
  });

  it('filters by targetRole', async () => {
    await writeIndex([
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'applied',
        appliedOn: '2026-06-01',
        site: '',
        targetRole: 'backend',
        tags: [],
      },
      {
        slug: '2026-Jun-02-SE-Beta',
        status: 'applied',
        appliedOn: '2026-06-02',
        site: '',
        targetRole: 'frontend',
        tags: [],
      },
    ]);

    const stats = await computeStats(appliedDir, { targetRole: 'backend' });
    expect(stats.total).toBe(1);
    expect(stats.byStatus.applied).toBe(1);
  });

  it('filters by since (ISO date)', async () => {
    await writeIndex([
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'applied',
        appliedOn: '2026-06-01',
        site: '',
        targetRole: '',
        tags: [],
      },
      {
        slug: '2026-Jun-15-SE-Beta',
        status: 'applied',
        appliedOn: '2026-06-15',
        site: '',
        targetRole: '',
        tags: [],
      },
      {
        slug: '2026-Jun-30-SE-Gamma',
        status: 'applied',
        appliedOn: '2026-06-30',
        site: '',
        targetRole: '',
        tags: [],
      },
    ]);

    const stats = await computeStats(appliedDir, { since: '2026-06-10' });
    expect(stats.total).toBe(2);
    expect(stats.since).toBe('2026-06-15');
  });

  it('filters by since (relative 7d)', async () => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const recent = `${y}-${m}-25`;
    const old = `${y}-${m}-01`;

    await writeIndex([
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'applied',
        appliedOn: old,
        site: '',
        targetRole: '',
        tags: [],
      },
      {
        slug: '2026-Jun-25-SE-Beta',
        status: 'applied',
        appliedOn: recent,
        site: '',
        targetRole: '',
        tags: [],
      },
    ]);

    const stats = await computeStats(appliedDir, { since: '7d' });
    expect(stats.total).toBe(1);
    expect(stats.since).toBe(recent);
  });

  it('combines targetRole and since filters', async () => {
    await writeIndex([
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'applied',
        appliedOn: '2026-06-01',
        site: '',
        targetRole: 'backend',
        tags: [],
      },
      {
        slug: '2026-Jun-20-SE-Beta',
        status: 'applied',
        appliedOn: '2026-06-20',
        site: '',
        targetRole: 'frontend',
        tags: [],
      },
      {
        slug: '2026-Jun-25-SE-Gamma',
        status: 'applied',
        appliedOn: '2026-06-25',
        site: '',
        targetRole: 'backend',
        tags: [],
      },
    ]);

    const stats = await computeStats(appliedDir, { targetRole: 'backend', since: '2026-06-10' });
    expect(stats.total).toBe(1);
    expect(stats.since).toBe('2026-06-25');
  });

  it('returns zeros with since when all entries are filtered out', async () => {
    await writeIndex([
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'applied',
        appliedOn: '2026-01-01',
        site: '',
        targetRole: '',
        tags: [],
      },
    ]);

    const stats = await computeStats(appliedDir, { since: '2026-06-15' });
    expect(stats.total).toBe(0);
    expect(stats.since).toBe('2026-06-15');
  });

  it('returns zeros with targetRole when all entries are filtered out', async () => {
    await writeIndex([
      {
        slug: '2026-Jun-01-SE-Acme',
        status: 'applied',
        appliedOn: '2026-06-01',
        site: '',
        targetRole: 'backend',
        tags: [],
      },
    ]);

    const stats = await computeStats(appliedDir, { targetRole: 'frontend' });
    expect(stats.total).toBe(0);
  });

  it('returns since field from earliest appliedOn', async () => {
    await writeIndex([
      {
        slug: '2026-Jun-20-SE-Acme',
        status: 'applied',
        appliedOn: '2026-06-20',
        site: '',
        targetRole: '',
        tags: [],
      },
      {
        slug: '2026-Jun-01-SE-Beta',
        status: 'applied',
        appliedOn: '2026-06-01',
        site: '',
        targetRole: '',
        tags: [],
      },
      {
        slug: '2026-Jun-10-SE-Gamma',
        status: 'applied',
        appliedOn: '2026-06-10',
        site: '',
        targetRole: '',
        tags: [],
      },
    ]);

    const stats = await computeStats(appliedDir);
    expect(stats.since).toBe('2026-06-01');
  });

  it('throws InvalidSinceError for invalid --since value', async () => {
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
      'invalid --since value',
    );
  });
});
