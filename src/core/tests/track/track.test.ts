import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runTrack, runTrackRefresh, prepareTrack, confirmAndCreate } from '../../track/track.js';
import { TrackError, TrackCancelled, NoLinkStoredError } from '../../track/errors.js';
import { extractJdFromUrl, extractJdFromText } from '../../jobs/extract.js';
import { suggestTargetRole } from '../../jobs/suggest.js';
import { readProfile } from '../../profile.js';
import { parseTargetRoles } from '../../target-roles.js';
import {
  createApplication,
  updateApplication,
  readApplication,
  appendNote,
} from '../../applications/applications.js';
import { confirmTrackSummary, confirmTrackUpdate } from '../../track/prompts.js';
import { replaceRegion, replaceSteer } from '../../markers.js';
import { atomicWrite } from '../../fs.js';
import type { ApplicationFrontmatter } from '../../applications/types.js';

vi.mock('../../config.js', () => ({
  getConfig: vi.fn(() => ({
    global: { llm: { baseUrl: 'http://test', apiKey: 'key', model: 'model' } },
  })),
}));

vi.mock('../../llm.js', () => ({
  defaultLlmConfig: vi.fn(() => ({ baseUrl: 'http://test', apiKey: 'key', model: 'model' })),
}));

vi.mock('../../profile.js', () => ({
  readProfile: vi.fn(),
}));

vi.mock('../../target-roles.js', () => ({
  parseTargetRoles: vi.fn(() => []),
}));

vi.mock('../../jobs/extract.js', () => ({
  extractJdFromUrl: vi.fn(),
  extractJdFromText: vi.fn(),
}));

vi.mock('../../jobs/suggest.js', () => ({
  suggestTargetRole: vi.fn(),
}));

vi.mock('../../applications/applications.js', () => ({
  createApplication: vi.fn(() => Promise.resolve('2026-Jun-21-SE-test-co')),
  updateApplication: vi.fn(),
  readApplication: vi.fn(() =>
    Promise.resolve({
      frontmatter: { status: 'applied', title: 'Test', company: 'Co' },
      body: '',
    }),
  ),
  appendNote: vi.fn(),
}));

vi.mock('../../track/prompts.js', () => ({
  confirmTrackSummary: vi.fn(() => Promise.resolve(true)),
  confirmTrackUpdate: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../../markers.js', () => ({
  replaceRegion: vi.fn(
    (_content, _name, newContent) =>
      `<!-- jho:start:fetched-jd -->\n${newContent}\n<!-- jho:end:fetched-jd -->`,
  ),
  replaceSteer: vi.fn((_content, steer) => (steer ? `<!-- jho:steer: ${steer} -->` : '')),
}));

vi.mock('../../fs.js', () => ({
  atomicWrite: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../../locks.js', () => ({
  acquireLock: vi.fn(async (_target, fn) => fn()),
}));

describe('runTrack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mode detection', () => {
    it('throws TrackError when no slug and not create mode', async () => {
      await expect(runTrack({ campaign: 'default' })).rejects.toThrow(TrackError);
    });

    it('throws TrackError with hint message', async () => {
      await expect(runTrack({ campaign: 'default' })).rejects.toThrow('missing slug');
    });
  });

  describe('create mode', () => {
    it('creates application from URL', async () => {
      vi.mocked(extractJdFromUrl).mockResolvedValue({
        title: 'Engineer',
        company: 'TestCo',
        location: 'Remote',
        description: 'desc',
      });

      const result = await runTrack({
        campaign: 'default',
        url: 'https://example.com/job/123',
        yes: true,
      });

      expect(result.slug).toBe('2026-Jun-21-SE-test-co');
      expect(result.changed).toBe(true);
      expect(extractJdFromUrl).toHaveBeenCalledOnce();
    });

    it('passes description to createApplication', async () => {
      vi.mocked(extractJdFromUrl).mockResolvedValue({
        title: 'Engineer',
        company: 'TestCo',
        location: 'Remote',
        description: 'Build scalable systems',
      });

      await runTrack({
        campaign: 'default',
        url: 'https://example.com/job/123',
        yes: true,
      });

      expect(createApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Build scalable systems',
        }),
      );
    });

    it('creates application from text', async () => {
      vi.mocked(extractJdFromText).mockResolvedValue({
        title: 'Engineer',
        company: 'TestCo',
        location: 'Remote',
        description: 'desc',
        rawText: 'Job description text',
      });

      const result = await runTrack({
        campaign: 'default',
        text: 'Job description text',
        yes: true,
      });

      expect(result.slug).toBe('2026-Jun-21-SE-test-co');
      expect(extractJdFromText).toHaveBeenCalledOnce();
    });

    it('throws TrackError on extraction failure', async () => {
      vi.mocked(extractJdFromUrl).mockRejectedValue(new Error('fetch failed'));

      await expect(
        runTrack({
          campaign: 'default',
          url: 'https://example.com/job/123',
          yes: true,
        }),
      ).rejects.toThrow('Failed to extract JD: fetch failed');
    });

    it('proceeds without role suggestion when profile read fails', async () => {
      vi.mocked(extractJdFromUrl).mockResolvedValue({
        title: 'Engineer',
        company: 'TestCo',
        location: 'Remote',
        description: 'desc',
      });
      vi.mocked(readProfile).mockRejectedValue(new Error('No profile'));

      const result = await runTrack({
        campaign: 'default',
        url: 'https://example.com/job/123',
        yes: true,
      });

      expect(result.slug).toBe('2026-Jun-21-SE-test-co');
    });

    it('appends note when provided', async () => {
      vi.mocked(extractJdFromUrl).mockResolvedValue({
        title: 'Engineer',
        company: 'TestCo',
        location: 'Remote',
        description: 'desc',
      });

      await runTrack({
        campaign: 'default',
        url: 'https://example.com/job/123',
        note: 'Referred by Alice',
        yes: true,
      });

      expect(appendNote).toHaveBeenCalledWith(
        expect.any(String),
        '2026-Jun-21-SE-test-co',
        'Referred by Alice',
      );
    });

    it('does not append note when not provided', async () => {
      vi.mocked(extractJdFromUrl).mockResolvedValue({
        title: 'Engineer',
        company: 'TestCo',
        location: 'Remote',
        description: 'desc',
      });

      await runTrack({
        campaign: 'default',
        url: 'https://example.com/job/123',
        yes: true,
      });

      expect(appendNote).not.toHaveBeenCalled();
    });

    it('suggests target role when profile has roles', async () => {
      vi.mocked(extractJdFromUrl).mockResolvedValue({
        title: 'Engineer',
        company: 'TestCo',
        location: 'Remote',
        description: 'desc',
      });
      vi.mocked(readProfile).mockResolvedValue('profile content');
      vi.mocked(parseTargetRoles).mockReturnValue([
        {
          slug: 'frontend',
          title: 'Frontend Dev',
          priority: 'primary',
          level: '',
          domain: '',
          stack: '',
          workStyle: '',
          compensation: '',
          notes: '',
        },
      ]);
      vi.mocked(suggestTargetRole).mockResolvedValue({
        roleSlug: 'frontend',
        confidence: 0.9,
        reasoning: 'Good match',
      });

      const result = await runTrack({
        campaign: 'default',
        url: 'https://example.com/job/123',
        yes: true,
      });

      expect(suggestTargetRole).toHaveBeenCalledOnce();
      expect(result.slug).toBe('2026-Jun-21-SE-test-co');
    });

    it('throws TrackError on role suggestion failure', async () => {
      vi.mocked(extractJdFromUrl).mockResolvedValue({
        title: 'Engineer',
        company: 'TestCo',
        location: 'Remote',
        description: 'desc',
      });
      vi.mocked(readProfile).mockResolvedValue('profile content');
      vi.mocked(parseTargetRoles).mockReturnValue([
        {
          slug: 'frontend',
          title: 'Frontend Dev',
          priority: 'primary',
          level: '',
          domain: '',
          stack: '',
          workStyle: '',
          compensation: '',
          notes: '',
        },
      ]);
      vi.mocked(suggestTargetRole).mockRejectedValue(new Error('LLM error'));

      await expect(
        runTrack({
          campaign: 'default',
          url: 'https://example.com/job/123',
          yes: true,
        }),
      ).rejects.toThrow('Failed to suggest target role: LLM error');
    });
  });

  describe('update mode', () => {
    it('updates application status', async () => {
      const result = await runTrack({
        campaign: 'default',
        slug: '2026-Jun-21-SE-test-co',
        status: 'interview',
        yes: true,
      });

      expect(result.slug).toBe('2026-Jun-21-SE-test-co');
      expect(result.changed).toBe(true);
      expect(updateApplication).toHaveBeenCalledWith(
        expect.any(String),
        '2026-Jun-21-SE-test-co',
        expect.objectContaining({ status: 'interview' }),
      );
    });

    it('updates multiple fields', async () => {
      await runTrack({
        campaign: 'default',
        slug: '2026-Jun-21-SE-test-co',
        status: 'offer',
        salary: '100k',
        tags: ['urgent'],
        targetRole: 'senior',
        yes: true,
      });

      expect(updateApplication).toHaveBeenCalledWith(
        expect.any(String),
        '2026-Jun-21-SE-test-co',
        expect.objectContaining({
          status: 'offer',
          salary: '100k',
          tags: ['urgent'],
          targetRole: 'senior',
        }),
      );
    });

    it('returns changed: false when no changes specified', async () => {
      const result = await runTrack({
        campaign: 'default',
        slug: '2026-Jun-21-SE-test-co',
        yes: true,
      });

      expect(result.slug).toBe('2026-Jun-21-SE-test-co');
      expect(result.changed).toBe(false);
      expect(updateApplication).not.toHaveBeenCalled();
      expect(confirmTrackUpdate).not.toHaveBeenCalled();
    });

    it('throws TrackError when slug is missing in update mode', async () => {
      await expect(
        runTrack({
          campaign: 'default',
          status: 'interview',
          yes: true,
        }),
      ).rejects.toThrow('missing slug');
    });

    it('appends note on update when provided', async () => {
      await runTrack({
        campaign: 'default',
        slug: '2026-Jun-21-SE-test-co',
        note: 'Updated note',
        yes: true,
      });

      expect(appendNote).toHaveBeenCalledWith(
        expect.any(String),
        '2026-Jun-21-SE-test-co',
        'Updated note',
      );
    });

    it('considers note as a change', async () => {
      await runTrack({
        campaign: 'default',
        slug: '2026-Jun-21-SE-test-co',
        note: 'Some note',
        yes: true,
      });

      expect(updateApplication).toHaveBeenCalled();
    });

    it('includes target role in changes', async () => {
      await runTrack({
        campaign: 'default',
        slug: '2026-Jun-21-SE-test-co',
        targetRole: 'senior-dev',
        yes: true,
      });

      expect(updateApplication).toHaveBeenCalledWith(
        expect.any(String),
        '2026-Jun-21-SE-test-co',
        expect.objectContaining({ targetRole: 'senior-dev' }),
      );
    });

    it('shows note in confirmation when not skipping', async () => {
      vi.mocked(confirmTrackUpdate).mockResolvedValue(true);

      await runTrack({
        campaign: 'default',
        slug: '2026-Jun-21-SE-test-co',
        note: 'Important note',
      });

      expect(confirmTrackUpdate).toHaveBeenCalledWith(
        '2026-Jun-21-SE-test-co',
        'applied',
        expect.arrayContaining([expect.stringContaining('note')]),
      );
    });

    it('omits status from changes when it matches current status', async () => {
      vi.mocked(confirmTrackUpdate).mockResolvedValue(true);

      await runTrack({
        campaign: 'default',
        slug: '2026-Jun-21-SE-test-co',
        status: 'applied',
        note: 'test note',
      });

      const changes = vi.mocked(confirmTrackUpdate).mock.calls[0]![2];
      expect(changes).not.toContainEqual(expect.stringContaining('status'));
    });
  });

  describe('update errors', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('propagates readApplication errors without wrapping', async () => {
      const err = new Error('not found');
      vi.mocked(readApplication).mockRejectedValue(err);
      vi.mocked(confirmTrackUpdate).mockResolvedValue(true);

      await expect(
        runTrack({
          campaign: 'default',
          slug: 'non-existent-slug',
          status: 'interview',
          yes: true,
        }),
      ).rejects.toThrow('not found');

      await expect(
        runTrack({
          campaign: 'default',
          slug: 'non-existent-slug',
          status: 'interview',
          yes: true,
        }),
      ).rejects.not.toThrow(TrackError);
    });
  });

  describe('cancellation', () => {
    it('throws TrackCancelled when user cancels create', async () => {
      vi.mocked(extractJdFromUrl).mockResolvedValue({
        title: 'Engineer',
        company: 'TestCo',
        location: 'Remote',
        description: 'desc',
      });
      vi.mocked(confirmTrackSummary).mockResolvedValue(false);
      vi.mocked(suggestTargetRole).mockResolvedValue({
        roleSlug: '',
        confidence: 0,
        reasoning: 'No roles',
      });

      await expect(
        runTrack({
          campaign: 'default',
          url: 'https://example.com/job/123',
        }),
      ).rejects.toThrow(TrackCancelled);
    });

    it('throws TrackCancelled when user cancels update', async () => {
      vi.mocked(confirmTrackUpdate).mockResolvedValue(false);

      await expect(
        runTrack({
          campaign: 'default',
          slug: '2026-Jun-21-SE-test-co',
          status: 'interview',
        }),
      ).rejects.toThrow(TrackCancelled);
    });
  });
});

describe('prepareTrack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts JD from URL', async () => {
    vi.mocked(extractJdFromUrl).mockResolvedValue({
      title: 'Engineer',
      company: 'TestCo',
      location: 'Remote',
      description: 'desc',
    });

    const result = await prepareTrack({
      campaign: 'default',
      url: 'https://example.com/job/123',
    });

    expect(result.jd.title).toBe('Engineer');
    expect(result.jd.company).toBe('TestCo');
    expect(extractJdFromUrl).toHaveBeenCalledOnce();
  });

  it('extracts JD from text', async () => {
    vi.mocked(extractJdFromText).mockResolvedValue({
      title: 'Engineer',
      company: 'TestCo',
      location: 'Remote',
      description: 'desc',
      rawText: 'Job description text',
    });

    const result = await prepareTrack({
      campaign: 'default',
      text: 'Job description text',
    });

    expect(result.jd.title).toBe('Engineer');
    expect(extractJdFromText).toHaveBeenCalledOnce();
  });

  it('throws TrackError when no URL or text provided', async () => {
    await expect(prepareTrack({ campaign: 'default' })).rejects.toThrow(TrackError);
  });

  it('throws TrackError on extraction failure', async () => {
    vi.mocked(extractJdFromUrl).mockRejectedValue(new Error('fetch failed'));

    await expect(
      prepareTrack({
        campaign: 'default',
        url: 'https://example.com/job/123',
      }),
    ).rejects.toThrow('Failed to extract JD: fetch failed');
  });

  it('includes target roles from profile', async () => {
    vi.mocked(extractJdFromUrl).mockResolvedValue({
      title: 'Engineer',
      company: 'TestCo',
      location: 'Remote',
      description: 'desc',
    });
    vi.mocked(readProfile).mockResolvedValue('profile content');
    vi.mocked(parseTargetRoles).mockReturnValue([
      {
        slug: 'frontend-dev',
        title: 'Frontend Developer',
        priority: 'primary',
        level: '',
        domain: '',
        stack: '',
        workStyle: '',
        compensation: '',
        notes: '',
      },
    ]);

    const result = await prepareTrack({
      campaign: 'default',
      url: 'https://example.com/job/123',
    });

    expect(result.targetRoles).toHaveLength(1);
    expect(result.targetRoles[0]!.slug).toBe('frontend-dev');
  });

  it('handles missing profile gracefully', async () => {
    vi.mocked(extractJdFromUrl).mockResolvedValue({
      title: 'Engineer',
      company: 'TestCo',
      location: 'Remote',
      description: 'desc',
    });
    vi.mocked(readProfile).mockRejectedValue(new Error('no profile'));

    const result = await prepareTrack({
      campaign: 'default',
      url: 'https://example.com/job/123',
    });

    expect(result.targetRoles).toHaveLength(0);
  });
});

describe('confirmAndCreate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates application after confirmation', async () => {
    vi.mocked(confirmTrackSummary).mockResolvedValue(true);
    vi.mocked(createApplication).mockResolvedValue('2026-Jun-21-SE-test-co');

    const slug = await confirmAndCreate({
      campaign: 'default',
      summary: {
        jd: {
          title: 'Engineer',
          company: 'TestCo',
          location: 'Remote',
          description: 'desc',
        },
        suggestion: { roleSlug: '', confidence: 0, reasoning: '' },
        targetRoles: [],
      },
      url: 'https://example.com/job/123',
      yes: true,
    });

    expect(slug).toBe('2026-Jun-21-SE-test-co');
    expect(createApplication).toHaveBeenCalledOnce();
  });

  it('skips confirmation when --yes is set', async () => {
    vi.mocked(createApplication).mockResolvedValue('2026-Jun-21-SE-test-co');

    await confirmAndCreate({
      campaign: 'default',
      summary: {
        jd: {
          title: 'Engineer',
          company: 'TestCo',
          location: 'Remote',
          description: 'desc',
        },
        suggestion: { roleSlug: '', confidence: 0, reasoning: '' },
        targetRoles: [],
      },
      url: 'https://example.com/job/123',
      yes: true,
    });

    expect(confirmTrackSummary).not.toHaveBeenCalled();
  });

  it('throws TrackCancelled when user cancels', async () => {
    vi.mocked(confirmTrackSummary).mockResolvedValue(false);

    await expect(
      confirmAndCreate({
        campaign: 'default',
        summary: {
          jd: {
            title: 'Engineer',
            company: 'TestCo',
            location: 'Remote',
            description: 'desc',
          },
          suggestion: { roleSlug: '', confidence: 0, reasoning: '' },
          targetRoles: [],
        },
        url: 'https://example.com/job/123',
      }),
    ).rejects.toThrow(TrackCancelled);
  });

  it('appends note when provided', async () => {
    vi.mocked(confirmTrackSummary).mockResolvedValue(true);
    vi.mocked(createApplication).mockResolvedValue('2026-Jun-21-SE-test-co');

    await confirmAndCreate({
      campaign: 'default',
      summary: {
        jd: {
          title: 'Engineer',
          company: 'TestCo',
          location: 'Remote',
          description: 'desc',
        },
        suggestion: { roleSlug: '', confidence: 0, reasoning: '' },
        targetRoles: [],
      },
      url: 'https://example.com/job/123',
      note: 'Referred by Alice',
      yes: true,
    });

    expect(appendNote).toHaveBeenCalledOnce();
  });
});

describe('runTrackRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockFrontmatter = (overrides: Partial<ApplicationFrontmatter> = {}) => ({
    slug: '2026-Jun-21-SE-test-co',
    status: 'applied' as const,
    appliedOn: '2026-06-21',
    title: 'Engineer',
    company: 'TestCo',
    location: 'Remote',
    site: 'Seek',
    link: 'https://example.com/job/123',
    salary: '',
    tags: [] as string[],
    targetRole: '',
    ...overrides,
  });

  it('refreshes JD from stored URL', async () => {
    vi.mocked(readApplication).mockResolvedValue({
      frontmatter: createMockFrontmatter(),
      body: '',
    });
    vi.mocked(extractJdFromUrl).mockResolvedValue({
      title: 'Engineer',
      company: 'TestCo',
      location: 'Remote',
      description: 'Updated description',
    });

    const result = await runTrackRefresh({
      campaign: 'default',
      slug: '2026-Jun-21-SE-test-co',
      yes: true,
    });

    expect(result.slug).toBe('2026-Jun-21-SE-test-co');
    expect(result.changed).toBe(true);
    expect(extractJdFromUrl).toHaveBeenCalledWith(
      'https://example.com/job/123',
      expect.any(Object),
      undefined,
      undefined,
    );
  });

  it('refreshes JD with pasted text', async () => {
    vi.mocked(readApplication).mockResolvedValue({
      frontmatter: createMockFrontmatter(),
      body: '',
    });
    vi.mocked(extractJdFromText).mockResolvedValue({
      title: 'Engineer',
      company: 'TestCo',
      location: 'Remote',
      description: 'Pasted description',
    });

    const result = await runTrackRefresh({
      campaign: 'default',
      slug: '2026-Jun-21-SE-test-co',
      text: 'Pasted JD content',
      yes: true,
    });

    expect(result.slug).toBe('2026-Jun-21-SE-test-co');
    expect(result.changed).toBe(true);
    expect(extractJdFromText).toHaveBeenCalledWith(
      'Pasted JD content',
      expect.any(Object),
      undefined,
    );
  });

  it('throws NoLinkStoredError when no link stored', async () => {
    vi.mocked(readApplication).mockResolvedValue({
      frontmatter: createMockFrontmatter({ link: '' }),
      body: '',
    });

    await expect(
      runTrackRefresh({
        campaign: 'default',
        slug: '2026-Jun-21-SE-test-co',
        yes: true,
      }),
    ).rejects.toThrow(NoLinkStoredError);
  });

  it('throws TrackError on fetch failure', async () => {
    vi.mocked(readApplication).mockResolvedValue({
      frontmatter: createMockFrontmatter(),
      body: '',
    });
    vi.mocked(extractJdFromUrl).mockRejectedValue(new Error('Fetch failed'));

    await expect(
      runTrackRefresh({
        campaign: 'default',
        slug: '2026-Jun-21-SE-test-co',
        yes: true,
      }),
    ).rejects.toThrow('Failed to refresh JD: Fetch failed');
  });

  it('throws TrackCancelled when user cancels', async () => {
    vi.mocked(readApplication).mockResolvedValue({
      frontmatter: createMockFrontmatter(),
      body: '',
    });
    vi.mocked(extractJdFromUrl).mockResolvedValue({
      title: 'Engineer',
      company: 'TestCo',
      location: 'Remote',
      description: 'Updated description',
    });
    vi.mocked(confirmTrackUpdate).mockResolvedValue(false);

    await expect(
      runTrackRefresh({
        campaign: 'default',
        slug: '2026-Jun-21-SE-test-co',
      }),
    ).rejects.toThrow(TrackCancelled);
  });

  it('throws TrackError when slug is missing in refresh mode', async () => {
    await expect(
      runTrack({
        campaign: 'default',
        refresh: true,
      }),
    ).rejects.toThrow('missing slug');
  });

  it('throws TrackError when slug is missing in runTrackRefresh', async () => {
    await expect(
      runTrackRefresh({
        campaign: 'default',
      }),
    ).rejects.toThrow('missing slug');
  });

  it('handles missing jd.md file gracefully', async () => {
    vi.mocked(readApplication).mockResolvedValue({
      frontmatter: createMockFrontmatter(),
      body: '',
    });
    vi.mocked(extractJdFromUrl).mockResolvedValue({
      title: 'Engineer',
      company: 'TestCo',
      location: 'Remote',
      description: 'Updated description',
    });
    vi.mocked(replaceRegion).mockReturnValue(
      '<!-- jho:start:fetched-jd -->\nUpdated description\n<!-- jho:end:fetched-jd -->',
    );

    const result = await runTrackRefresh({
      campaign: 'default',
      slug: '2026-Jun-21-SE-test-co',
      yes: true,
    });

    expect(result.changed).toBe(true);
    expect(replaceRegion).toHaveBeenCalledWith('', 'fetched-jd', 'Updated description', {
      createIfMissing: true,
    });
  });

  it('throws TrackError when atomicWrite fails', async () => {
    vi.mocked(readApplication).mockResolvedValue({
      frontmatter: createMockFrontmatter(),
      body: '',
    });
    vi.mocked(extractJdFromUrl).mockResolvedValue({
      title: 'Engineer',
      company: 'TestCo',
      location: 'Remote',
      description: 'Updated description',
    });
    vi.mocked(atomicWrite).mockResolvedValue(false);

    await expect(
      runTrackRefresh({
        campaign: 'default',
        slug: '2026-Jun-21-SE-test-co',
        yes: true,
      }),
    ).rejects.toThrow('failed to write jd.md');
  });
});

describe('steer functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes steer to jd.md via replaceSteer in create mode', async () => {
    vi.mocked(extractJdFromUrl).mockResolvedValue({
      title: 'Engineer',
      company: 'TestCo',
      location: 'Remote',
      description: 'desc',
    });

    await runTrack({
      campaign: 'default',
      url: 'https://example.com/job/123',
      steer: 'Focus on remote roles',
      yes: true,
    });

    expect(replaceSteer).toHaveBeenCalledWith(expect.any(String), 'Focus on remote roles');
  });

  it('writes steer to jd.md via replaceSteer in update mode', async () => {
    await runTrack({
      campaign: 'default',
      slug: '2026-Jun-21-SE-test-co',
      steer: 'Updated steer instructions',
      yes: true,
    });

    expect(replaceSteer).toHaveBeenCalledWith(expect.any(String), 'Updated steer instructions');
  });

  it('does not call replaceSteer when steer is undefined', async () => {
    await runTrack({
      campaign: 'default',
      slug: '2026-Jun-21-SE-test-co',
      yes: true,
    });

    expect(replaceSteer).not.toHaveBeenCalled();
  });

  it('considers steer as a change in update mode', async () => {
    await runTrack({
      campaign: 'default',
      slug: '2026-Jun-21-SE-test-co',
      steer: 'New steer',
      yes: true,
    });

    expect(updateApplication).toHaveBeenCalled();
  });
});
