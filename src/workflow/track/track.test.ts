import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { validateTrackStatus, hasTrackUpdateFlags, runTrack } from './track.js';
import { createApplication } from '../applications/applications.js';
import type { ExtractedJd } from '../../core/jobs/types.js';

vi.mock('../../lib/logger/logger.js', () => ({
  moduleLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  })),
  getRootLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  })),
  childLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  })),
}));

const campaignName = `trk-wf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let configHome: string;
let dataRoot: string;

describe('track branch coverage (18-519,550-551)', () => {
  let tmpRoot: string;
  let campaignRoot: string;
  let appliedDir: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'jho-track-wf-'));
    configHome = join(tmpRoot, '.jho');
    dataRoot = join(tmpRoot, 'data');
    process.env['JHO_CONFIG_HOME'] = configHome;
    process.env['JHO_DATA'] = dataRoot;
    await mkdir(join(dataRoot, 'campaigns', campaignName), { recursive: true });
    campaignRoot = join(dataRoot, 'campaigns', campaignName);
    appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
    // Minimal config to avoid getConfig throw
    await mkdir(configHome, { recursive: true });
    await writeFile(
      join(configHome, 'config.json'),
      JSON.stringify({ llm: { provider: 'ollama', model: 'test' } }),
      'utf8',
    );
    await writeFile(join(campaignRoot, 'config.json'), JSON.stringify({}), 'utf8');
    // Create a minimal profile.md for targetRoles branches
    await writeFile(
      join(campaignRoot, 'profile.md'),
      '# Profile\n\n## Target Roles\n- Backend Engineer (backend)\n',
      'utf8',
    );
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('validateTrackStatus', () => {
    it('returns undefined for undefined', () => {
      expect(validateTrackStatus(undefined)).toBeUndefined();
    });
    it('returns status for valid', () => {
      expect(validateTrackStatus('applied')).toBe('applied');
    });
    it('throws InvalidStatusError for invalid', () => {
      expect(() => validateTrackStatus('bad-status')).toThrow(/invalid status/);
    });
  });

  describe('hasTrackUpdateFlags', () => {
    it('false when no flags', () => {
      expect(hasTrackUpdateFlags({})).toBe(false);
    });
    it('true for status', () => {
      expect(hasTrackUpdateFlags({ status: 'applied' })).toBe(true);
    });
    it('true for salary', () => {
      expect(hasTrackUpdateFlags({ salary: '100k' })).toBe(true);
    });
    it('true for tags with items', () => {
      expect(hasTrackUpdateFlags({ tags: ['a'] })).toBe(true);
    });
    it('false for empty tags array', () => {
      expect(hasTrackUpdateFlags({ tags: [] })).toBe(false);
    });
    it('true for note', () => {
      expect(hasTrackUpdateFlags({ note: 'hello' })).toBe(true);
    });
    it('true for targetRole', () => {
      expect(hasTrackUpdateFlags({ targetRole: 'backend' })).toBe(true);
    });
    it('true for steer', () => {
      expect(hasTrackUpdateFlags({ steer: 'do x' })).toBe(true);
    });
    it('true for employmentType', () => {
      expect(hasTrackUpdateFlags({ employmentType: 'contract' })).toBe(true);
    });
  });

  describe('runTrack update branches', () => {
    it('throws when missing slug and not create (line 268)', async () => {
      await expect(runTrack({ campaign: campaignName })).rejects.toThrow(/missing slug/);
    });

    it('throws when refresh without slug (line 254)', async () => {
      await expect(runTrack({ campaign: campaignName, refresh: true })).rejects.toThrow(
        /missing slug/,
      );
    });

    it('returns changed false when no patch fields provided (line 563-565)', async () => {
      const slug = await createApplication({
        appliedDir,
        title: 'Eng',
        company: 'Acme',
        appliedOn: '2026-06-01',
      });
      const result = await runTrack({ campaign: campaignName, slug });
      expect(result.slug).toBe(slug);
      expect(result.changed).toBe(false);
    });

    it('updates via runTrack with --yes and salary/tags/targetRole/employmentType/steer/note (covers 537-551)', async () => {
      const slug = await createApplication({
        appliedDir,
        title: 'Eng',
        company: 'Acme',
        appliedOn: '2026-06-01',
      });
      const result = await runTrack({
        campaign: campaignName,
        slug,
        salary: '120k',
        tags: ['remote'],
        targetRole: 'backend',
        employmentType: 'contract',
        steer: 'focus on backend',
        note: 'followed up',
        yes: true,
      });
      expect(result.changed).toBe(true);
      // Verify salary/tag update persisted via read
      const { frontmatter } = await (
        await import('../applications/applications.js')
      ).readApplication(appliedDir, slug);
      expect(frontmatter.salary).toBe('120k');
    });

    it('updates status via runTrack', async () => {
      const slug = await createApplication({
        appliedDir,
        title: 'Eng',
        company: 'Acme',
        appliedOn: '2026-06-01',
        status: 'applied',
      });
      const result = await runTrack({
        campaign: campaignName,
        slug,
        status: 'interview',
        yes: true,
      });
      expect(result.changed).toBe(true);
    });
  });

  describe('runTrack refresh branches', () => {
    it('throws NoLinkStoredError when no link stored', async () => {
      const slug = await createApplication({
        appliedDir,
        title: 'Eng',
        company: 'Acme',
        appliedOn: '2026-06-01',
      });
      await expect(
        runTrack({ campaign: campaignName, slug, refresh: true, yes: true }),
      ).rejects.toThrow(/no link stored/);
    });

    it('refresh succeeds with text and steer (covers text branch + steer write)', async () => {
      const jobsModule = await import('../../core/jobs/extract.js');
      const spy = vi.spyOn(jobsModule, 'extractJdFromText').mockResolvedValue({
        title: 'Refreshed Title',
        company: 'Acme',
        description: 'New JD description',
        location: '',
        site: '',
        employmentType: 'permanent',
      } as unknown as ExtractedJd);
      const slug = await createApplication({
        appliedDir,
        title: 'Eng',
        company: 'Acme',
        appliedOn: '2026-06-01',
        url: 'https://example.com/job',
      });
      // Ensure link stored - createApplication already stores link via url field
      const result = await runTrack({
        campaign: campaignName,
        slug,
        refresh: true,
        text: 'pasted jd',
        yes: true,
        steer: 'steer text',
      } as unknown as Parameters<typeof runTrack>[0]);
      expect(result.changed).toBe(true);
      const jdContent = await readFile(join(appliedDir, slug, 'jd.md'), 'utf8');
      expect(jdContent).toContain('New JD description');
      spy.mockRestore();
    });
  });

  describe('runTrack create with text branches', () => {
    it('throws when no URL or text provided via prepareTrack path', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(runTrack({ campaign: campaignName, url: 'not-a-url' } as any)).rejects.toThrow(
        /missing slug/,
      );
    });
  });
});
