import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import {
  validateTrackStatus,
  hasTrackUpdateFlags,
  runTrack,
  prepareTrack,
  describeChanges,
  writeSteerToJd,
  runTrackCreate,
  runTrackUpdate,
} from './track.js';
import { createApplication } from '../applications/applications.js';
import * as applicationsModule from '../applications/applications.js';
import * as jobsExtractModule from '../../core/jobs/extract.js';
import * as fsModule from '../../lib/fs.js';
import * as trackPromptsModule from './prompts.js';
import type { ExtractedJd } from '../../core/jobs/types.js';

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
    delete process.env['JHO_CONFIG_HOME'];
    delete process.env['JHO_DATA'];
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
      const { frontmatter } = await applicationsModule.readApplication(appliedDir, slug);
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
      const spy = vi.spyOn(jobsExtractModule, 'extractJdFromText').mockResolvedValue({
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
    it('prepareTrack throws No URL or text provided when both missing (covers track.ts:285-287)', async () => {
      await expect(prepareTrack({ campaign: campaignName })).rejects.toThrow(
        /No URL or text provided/,
      );
    });
  });

  describe('describeChanges (211-221)', () => {
    it('covers each branch: status, salary, tags, targetRole, employmentType', () => {
      expect(describeChanges({ status: 'interview' }, { status: 'applied' })).toEqual([
        'status → interview',
      ]);
      expect(describeChanges({ status: 'applied' }, { status: 'applied' })).toEqual([]);
      expect(describeChanges({ salary: '100k' }, {})).toEqual(['salary → 100k']);
      expect(describeChanges({ targetRole: 'backend' }, {})).toEqual(['target role → backend']);
      expect(describeChanges({ tags: ['a', 'b'] }, {})).toEqual(['tags +a, b']);
      expect(describeChanges({ tags: [] }, {})).toEqual([]);
      expect(describeChanges({ employmentType: 'contract' }, {})).toEqual([
        'employment type → contract',
      ]);
      expect(
        describeChanges(
          {
            status: 'offer',
            salary: '200k',
            targetRole: 'frontend',
            tags: ['remote'],
            employmentType: 'permanent',
          },
          { status: 'applied' },
        ),
      ).toEqual([
        'status → offer',
        'salary → 200k',
        'target role → frontend',
        'tags +remote',
        'employment type → permanent',
      ]);
    });
  });

  describe('writeSteerToJd failure (139-140)', () => {
    it('throws TrackError when atomicWrite returns false', async () => {
      const slug = await createApplication({
        appliedDir,
        title: 'Eng',
        company: 'Acme',
        appliedOn: '2026-06-01',
      });
      const spy = vi.spyOn(fsModule, 'atomicWrite').mockResolvedValue(false);
      await expect(writeSteerToJd(appliedDir, slug, 'steer text')).rejects.toThrow(
        /failed to write jd\.md/,
      );
      spy.mockRestore();
    });

    it('writes steer even when jd.md missing (covers readFile catch)', async () => {
      const slug = await createApplication({
        appliedDir,
        title: 'Eng',
        company: 'Acme',
        appliedOn: '2026-06-01',
      });
      // Remove jd.md to trigger ENOENT path
      await rm(join(appliedDir, slug, 'jd.md'), { force: true });
      await expect(writeSteerToJd(appliedDir, slug, 'new steer')).resolves.toBeUndefined();
      const jdContent = await readFile(join(appliedDir, slug, 'jd.md'), 'utf8');
      expect(jdContent).toContain('new steer');
    });
  });

  describe('runTrackCreate / runTrackUpdate direct coverage (418-419,518-519)', () => {
    it('runTrackCreate throws when no url/text (defensive)', async () => {
      await expect(runTrackCreate({ campaign: campaignName })).rejects.toThrow(
        /No URL or text provided/,
      );
    });

    it('runTrackUpdate throws when missing slug (defensive)', async () => {
      await expect(
        runTrackUpdate({ campaign: campaignName } as unknown as Parameters<
          typeof runTrackUpdate
        >[0]),
      ).rejects.toThrow(/missing slug/);
    });
  });

  describe('runTrackUpdate with confirm branches (211-221 via prompts)', () => {
    it('calls describeChanges and confirmTrackUpdate when yes is false', async () => {
      const slug = await createApplication({
        appliedDir,
        title: 'Eng',
        company: 'Acme',
        appliedOn: '2026-06-01',
        status: 'applied',
      });

      const spy = vi.spyOn(trackPromptsModule, 'confirmTrackUpdate').mockResolvedValue(true);
      const result = await runTrackUpdate({
        campaign: campaignName,
        slug,
        status: 'interview',
        salary: '150k',
        tags: ['onsite'],
        targetRole: 'backend',
        employmentType: 'contract',
        note: 'note text',
        steer: 'steer text',
        // yes undefined -> triggers confirm
      });
      expect(result.changed).toBe(true);
      expect(spy).toHaveBeenCalled();
      const changesArg = spy.mock.calls[0]?.[2] as string[];
      expect(changesArg).toEqual(
        expect.arrayContaining([
          'status → interview',
          'salary → 150k',
          'tags +onsite',
          'target role → backend',
          'employment type → contract',
          'note +note text',
          'steer → steer text',
        ]),
      );
      spy.mockRestore();
    });
  });

  describe('runTrackRefresh jd.md missing (669-670)', () => {
    it('creates jd.md when missing during refresh', async () => {
      const spy = vi.spyOn(jobsExtractModule, 'extractJdFromUrl').mockResolvedValue({
        title: 'Title',
        company: 'Acme',
        description: 'Refreshed via URL',
        location: '',
        site: '',
      } as unknown as ExtractedJd);
      const slug = await createApplication({
        appliedDir,
        title: 'Eng',
        company: 'Acme',
        appliedOn: '2026-06-01',
        url: 'https://example.com/job',
      });
      await rm(join(appliedDir, slug, 'jd.md'), { force: true });
      const result = await runTrack({
        campaign: campaignName,
        slug,
        refresh: true,
        yes: true,
      });
      expect(result.changed).toBe(true);
      const jdContent = await readFile(join(appliedDir, slug, 'jd.md'), 'utf8');
      expect(jdContent).toContain('Refreshed via URL');
      spy.mockRestore();
    });

    it('throws TrackError when atomicWrite fails during refresh', async () => {
      const spyExtract = vi.spyOn(jobsExtractModule, 'extractJdFromText').mockResolvedValue({
        title: 'Title',
        company: 'Acme',
        description: 'JD text',
        location: '',
        site: '',
      } as unknown as ExtractedJd);
      const slug = await createApplication({
        appliedDir,
        title: 'Eng',
        company: 'Acme',
        appliedOn: '2026-06-01',
        url: 'https://example.com/job',
      });
      const originalAtomicWrite = fsModule.atomicWrite;
      const spyWrite = vi
        .spyOn(fsModule, 'atomicWrite')
        .mockImplementation(
          async (target: string, content: string | Uint8Array, opts?: unknown) => {
            if (target.endsWith('jd.md')) {
              return false;
            }
            return originalAtomicWrite(target, content, opts as never);
          },
        );
      await expect(
        runTrack({
          campaign: campaignName,
          slug,
          refresh: true,
          text: 'pasted',
          yes: true,
        } as unknown as Parameters<typeof runTrack>[0]),
      ).rejects.toThrow(/failed to write jd\.md/);
      spyExtract.mockRestore();
      spyWrite.mockRestore();
    });
  });
});
