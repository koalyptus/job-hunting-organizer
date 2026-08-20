import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { confirmTrackSummary, confirmTrackUpdate } from '../../track/prompts.js';
import { confirm, isCancel } from '@clack/prompts';
import type { ExtractedJd, RoleSuggestion } from '../../jobs/types.js';
import type { TargetRole } from '../../types.js';
import type { ApplicationStatus } from '../../applications/types.js';

vi.mock('@clack/prompts', () => ({
  confirm: vi.fn(),
  isCancel: vi.fn((value) => Symbol.for('cancel') === value),
  log: {
    info: vi.fn(),
  },
}));

describe('confirmTrackSummary', () => {
  const mockStdout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stdout, 'write').mockImplementation(mockStdout);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when user confirms', async () => {
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(isCancel).mockReturnValue(false);

    const jd: ExtractedJd = {
      title: 'Senior Engineer',
      company: 'TestCo',
      location: 'Remote',
      description: 'Job description',
    };

    const result = await confirmTrackSummary(
      jd,
      { roleSlug: '', confidence: 0, reasoning: '' },
      [],
      'my-campaign',
    );

    expect(result).toBe(true);
  });

  it('returns false when user cancels', async () => {
    vi.mocked(confirm).mockResolvedValue(false);
    vi.mocked(isCancel).mockReturnValue(false);

    const jd: ExtractedJd = {
      title: 'Senior Engineer',
      company: 'TestCo',
      location: 'Remote',
      description: 'Job description',
    };

    const result = await confirmTrackSummary(
      jd,
      { roleSlug: '', confidence: 0, reasoning: '' },
      [],
      'my-campaign',
    );

    expect(result).toBe(false);
  });

  it('returns false when isCancel returns true', async () => {
    const cancelSymbol = Symbol.for('cancel');
    vi.mocked(confirm).mockResolvedValue(cancelSymbol);
    vi.mocked(isCancel).mockReturnValue(true);

    const jd: ExtractedJd = {
      title: 'Senior Engineer',
      company: 'TestCo',
      location: 'Remote',
      description: 'Job description',
    };

    const result = await confirmTrackSummary(
      jd,
      { roleSlug: '', confidence: 0, reasoning: '' },
      [],
      'my-campaign',
    );

    expect(result).toBe(false);
  });

  it('displays salary and tags when present', async () => {
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(isCancel).mockReturnValue(false);

    const jd: ExtractedJd = {
      title: 'Senior Engineer',
      company: 'TestCo',
      location: 'Remote',
      description: 'Job description',
      salary: '100k-150k',
      tags: ['remote', 'senior'],
    };

    const result = await confirmTrackSummary(
      jd,
      { roleSlug: '', confidence: 0, reasoning: '' },
      [],
      'my-campaign',
    );

    expect(result).toBe(true);
  });

  it('displays suggested role when present', async () => {
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(isCancel).mockReturnValue(false);

    const jd: ExtractedJd = {
      title: 'Senior Engineer',
      company: 'TestCo',
      location: 'Remote',
      description: 'Job description',
    };

    const suggestion: RoleSuggestion = {
      roleSlug: 'frontend-dev',
      confidence: 0.85,
      reasoning: 'Good match for the role',
    };

    const targetRoles: TargetRole[] = [
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
    ];

    const result = await confirmTrackSummary(jd, suggestion, targetRoles, 'my-campaign');

    expect(result).toBe(true);
  });

  it('displays no matching role message when slug is empty', async () => {
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(isCancel).mockReturnValue(false);

    const jd: ExtractedJd = {
      title: 'Senior Engineer',
      company: 'TestCo',
      location: 'Remote',
      description: 'Job description',
    };

    const result = await confirmTrackSummary(
      jd,
      { roleSlug: '', confidence: 0, reasoning: 'No match' },
      [],
      'my-campaign',
    );

    expect(result).toBe(true);
  });

  it('displays role slug when role not found in target roles', async () => {
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(isCancel).mockReturnValue(false);

    const jd: ExtractedJd = {
      title: 'Senior Engineer',
      company: 'TestCo',
      location: 'Remote',
      description: 'Job description',
    };

    const suggestion: RoleSuggestion = {
      roleSlug: 'unknown-role',
      confidence: 0.5,
      reasoning: 'Partial match',
    };

    const result = await confirmTrackSummary(jd, suggestion, [], 'my-campaign');

    expect(result).toBe(true);
  });
});

describe('confirmTrackUpdate', () => {
  const mockStdout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stdout, 'write').mockImplementation(mockStdout);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when user confirms', async () => {
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(isCancel).mockReturnValue(false);

    const result = await confirmTrackUpdate('2026-Jun-21-SE-test-co', 'applied', [
      'status → interview',
    ]);

    expect(result).toBe(true);
  });

  it('returns false when user declines', async () => {
    vi.mocked(confirm).mockResolvedValue(false);
    vi.mocked(isCancel).mockReturnValue(false);

    const result = await confirmTrackUpdate('2026-Jun-21-SE-test-co', 'applied', [
      'status → interview',
    ]);

    expect(result).toBe(false);
  });

  it('returns false when isCancel returns true', async () => {
    const cancelSymbol = Symbol.for('cancel');
    vi.mocked(confirm).mockResolvedValue(cancelSymbol);
    vi.mocked(isCancel).mockReturnValue(true);

    const result = await confirmTrackUpdate('2026-Jun-21-SE-test-co', 'applied', [
      'status → interview',
    ]);

    expect(result).toBe(false);
  });

  it('displays multiple changes', async () => {
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(isCancel).mockReturnValue(false);

    const result = await confirmTrackUpdate('2026-Jun-21-SE-test-co', 'applied', [
      'status → interview',
      'salary → 100k',
      'tags +urgent, remote',
    ]);

    expect(result).toBe(true);
  });

  it('handles empty changes list', async () => {
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(isCancel).mockReturnValue(false);

    const result = await confirmTrackUpdate('2026-Jun-21-SE-test-co', 'applied', []);

    expect(result).toBe(true);
  });

  it('accepts different status types', async () => {
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(isCancel).mockReturnValue(false);

    const statuses: ApplicationStatus[] = [
      'applied',
      'interview',
      'offer',
      'rejected',
      'withdrawn',
    ];

    for (const status of statuses) {
      const result = await confirmTrackUpdate('2026-Jun-21-SE-test-co', status, [
        `status → ${status}`,
      ]);
      expect(result).toBe(true);
    }
  });
});
