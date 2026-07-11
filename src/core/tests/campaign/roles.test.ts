import { describe, expect, it, vi, beforeEach } from 'vitest';
import { text, select, isCancel } from '@clack/prompts';
import { reviewRoles, validateRoleSlug, validateRoleTitle } from '../../campaign/roles.js';
import { InitCancelled } from '../../init/errors.js';
import type { TargetRole } from '../../types.js';

vi.mock('@clack/prompts', () => ({
  text: vi.fn(),
  select: vi.fn(),
  isCancel: vi.fn(() => false),
  log: {
    info: vi.fn(),
  },
}));

const mockRoles: TargetRole[] = [
  {
    slug: 'senior-backend',
    title: 'Senior Backend Engineer',
    priority: 'primary',
    level: 'Senior',
    domain: 'Backend',
    stack: 'TypeScript, Node.js',
    workStyle: 'Remote',
    compensation: '150k',
    notes: '',
  },
  {
    slug: 'fullstack',
    title: 'Fullstack Developer',
    priority: 'secondary',
    level: 'Mid',
    domain: 'Fullstack',
    stack: 'React, Node.js',
    workStyle: 'Hybrid',
    compensation: '120k',
    notes: '',
  },
];

describe('reviewRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns original roles when accept is selected', async () => {
    vi.mocked(select).mockResolvedValue('accept');

    const result = await reviewRoles(mockRoles);

    expect(result).toEqual(mockRoles);
  });

  it('adds a new role when add is selected', async () => {
    vi.mocked(select)
      .mockResolvedValueOnce('add')
      .mockResolvedValueOnce('primary')
      .mockResolvedValueOnce('accept');
    vi.mocked(text)
      .mockResolvedValueOnce('staff-engineer') // slug
      .mockResolvedValueOnce('Staff Engineer') // title
      .mockResolvedValueOnce('Staff') // level
      .mockResolvedValueOnce('Backend') // domain
      .mockResolvedValueOnce('Go, Kubernetes') // stack
      .mockResolvedValueOnce('Remote') // workStyle
      .mockResolvedValueOnce('200k') // compensation
      .mockResolvedValueOnce(''); // notes

    const result = await reviewRoles(mockRoles);

    expect(result).toHaveLength(3);
    expect(result[2]?.slug).toBe('staff-engineer');
  });

  it('deletes a role when delete is selected', async () => {
    vi.mocked(select)
      .mockResolvedValueOnce('delete')
      .mockResolvedValueOnce(0) // select first role
      .mockResolvedValueOnce('accept');

    const result = await reviewRoles(mockRoles);

    expect(result).toHaveLength(1);
    expect(result[0]?.slug).toBe('fullstack');
  });

  it('edits a role when edit is selected', async () => {
    vi.mocked(select)
      .mockResolvedValueOnce('edit')
      .mockResolvedValueOnce(0) // select first role
      .mockResolvedValueOnce('primary')
      .mockResolvedValueOnce('accept');
    vi.mocked(text)
      .mockResolvedValueOnce('senior-backend') // slug
      .mockResolvedValueOnce('Senior Backend Engineer II') // title (changed)
      .mockResolvedValueOnce('Staff') // level (changed)
      .mockResolvedValueOnce('Backend') // domain
      .mockResolvedValueOnce('TypeScript, Node.js') // stack
      .mockResolvedValueOnce('Remote') // workStyle
      .mockResolvedValueOnce('180k') // compensation (changed)
      .mockResolvedValueOnce(''); // notes

    const result = await reviewRoles(mockRoles);

    expect(result).toHaveLength(2);
    expect(result[0]?.title).toBe('Senior Backend Engineer II');
    expect(result[0]?.level).toBe('Staff');
    expect(result[0]?.compensation).toBe('180k');
  });

  it('pre-fills existing values when editing a role', async () => {
    vi.mocked(select)
      .mockResolvedValueOnce('edit')
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce('primary')
      .mockResolvedValueOnce('accept');
    vi.mocked(text)
      .mockResolvedValueOnce('senior-backend')
      .mockResolvedValueOnce('Senior Backend Engineer')
      .mockResolvedValueOnce('Senior')
      .mockResolvedValueOnce('Backend')
      .mockResolvedValueOnce('TypeScript, Node.js')
      .mockResolvedValueOnce('Remote')
      .mockResolvedValueOnce('150k')
      .mockResolvedValueOnce('');

    await reviewRoles(mockRoles);

    expect(text).toHaveBeenCalledWith(expect.objectContaining({ initialValue: 'senior-backend' }));
    expect(text).toHaveBeenCalledWith(
      expect.objectContaining({ initialValue: 'Senior Backend Engineer' }),
    );
    expect(text).toHaveBeenCalledWith(expect.objectContaining({ initialValue: 'Senior' }));
    expect(text).toHaveBeenCalledWith(expect.objectContaining({ initialValue: 'Backend' }));
    expect(text).toHaveBeenCalledWith(
      expect.objectContaining({ initialValue: 'TypeScript, Node.js' }),
    );
    expect(text).toHaveBeenCalledWith(expect.objectContaining({ initialValue: 'Remote' }));
    expect(text).toHaveBeenCalledWith(expect.objectContaining({ initialValue: '150k' }));
    expect(text).toHaveBeenCalledWith(expect.objectContaining({ initialValue: '' }));
  });

  it('continues loop on cancel during edit selection', async () => {
    vi.mocked(select).mockResolvedValueOnce('edit').mockResolvedValueOnce(0);
    vi.mocked(isCancel).mockReturnValueOnce(false).mockReturnValueOnce(true); // cancel role selection

    // Second iteration: accept
    vi.mocked(select).mockResolvedValueOnce('accept');

    const result = await reviewRoles(mockRoles);

    expect(result).toEqual(mockRoles);
  });

  it('continues loop on cancel during delete selection', async () => {
    vi.mocked(select).mockResolvedValueOnce('delete').mockResolvedValueOnce(0);
    vi.mocked(isCancel).mockReturnValueOnce(false).mockReturnValueOnce(true); // cancel role selection

    // Second iteration: accept
    vi.mocked(select).mockResolvedValueOnce('accept');

    const result = await reviewRoles(mockRoles);

    expect(result).toEqual(mockRoles);
  });

  it('throws InitCancelled when action is cancelled', async () => {
    vi.mocked(isCancel).mockReturnValueOnce(true);

    await expect(reviewRoles(mockRoles)).rejects.toThrow(InitCancelled);
  });

  it('skips edit when slug is cancelled', async () => {
    vi.mocked(select).mockResolvedValueOnce('edit').mockResolvedValueOnce(0);
    vi.mocked(isCancel)
      .mockReturnValueOnce(false) // action select
      .mockReturnValueOnce(false) // role select
      .mockReturnValueOnce(true); // slug cancel

    vi.mocked(select).mockResolvedValueOnce('accept');

    const result = await reviewRoles(mockRoles);

    expect(result).toEqual(mockRoles);
  });

  it('skips edit when title is cancelled', async () => {
    vi.mocked(select).mockResolvedValueOnce('edit').mockResolvedValueOnce(0);
    vi.mocked(isCancel)
      .mockReturnValueOnce(false) // action select
      .mockReturnValueOnce(false) // role select
      .mockReturnValueOnce(false) // slug ok
      .mockReturnValueOnce(true); // title cancel

    vi.mocked(text).mockResolvedValueOnce('new-slug');
    vi.mocked(select).mockResolvedValueOnce('accept');

    const result = await reviewRoles(mockRoles);

    expect(result).toEqual(mockRoles);
  });

  it('skips edit when priority is cancelled', async () => {
    vi.mocked(select).mockResolvedValueOnce('edit').mockResolvedValueOnce(0);
    vi.mocked(isCancel)
      .mockReturnValueOnce(false) // action select
      .mockReturnValueOnce(false) // role select
      .mockReturnValueOnce(false) // slug ok
      .mockReturnValueOnce(false) // title ok
      .mockReturnValueOnce(true); // priority cancel

    vi.mocked(text).mockResolvedValueOnce('new-slug').mockResolvedValueOnce('New Title');
    vi.mocked(select).mockResolvedValueOnce('accept');

    const result = await reviewRoles(mockRoles);

    expect(result).toEqual(mockRoles);
  });

  it('skips edit when level is cancelled', async () => {
    vi.mocked(select).mockResolvedValueOnce('edit').mockResolvedValueOnce(0);
    vi.mocked(isCancel)
      .mockReturnValueOnce(false) // action select
      .mockReturnValueOnce(false) // role select
      .mockReturnValueOnce(false) // slug ok
      .mockReturnValueOnce(false) // title ok
      .mockReturnValueOnce(false) // priority ok
      .mockReturnValueOnce(true); // level cancel

    vi.mocked(text).mockResolvedValueOnce('new-slug').mockResolvedValueOnce('New Title');
    vi.mocked(select).mockResolvedValueOnce('primary');
    vi.mocked(select).mockResolvedValueOnce('accept');

    const result = await reviewRoles(mockRoles);

    expect(result).toEqual(mockRoles);
  });

  it('skips add when slug is cancelled', async () => {
    vi.mocked(select).mockResolvedValueOnce('add');
    vi.mocked(isCancel)
      .mockReturnValueOnce(false) // action select
      .mockReturnValueOnce(true); // slug cancel

    vi.mocked(select).mockResolvedValueOnce('accept');

    const result = await reviewRoles(mockRoles);

    expect(result).toHaveLength(2);
  });

  it('continues loop on cancel during edit role selection', async () => {
    vi.mocked(select).mockResolvedValueOnce('edit');
    vi.mocked(isCancel).mockReturnValueOnce(false).mockReturnValueOnce(true);

    vi.mocked(select).mockResolvedValueOnce('accept');

    const result = await reviewRoles(mockRoles);

    expect(result).toEqual(mockRoles);
  });

  it('skips edit when domain is cancelled', async () => {
    vi.mocked(select).mockResolvedValueOnce('edit').mockResolvedValueOnce(0);
    vi.mocked(isCancel)
      .mockReturnValueOnce(false) // action select
      .mockReturnValueOnce(false) // role select
      .mockReturnValueOnce(false) // slug ok
      .mockReturnValueOnce(false) // title ok
      .mockReturnValueOnce(false) // priority ok
      .mockReturnValueOnce(false) // level ok
      .mockReturnValueOnce(true); // domain cancel

    vi.mocked(text)
      .mockResolvedValueOnce('new-slug')
      .mockResolvedValueOnce('New Title')
      .mockResolvedValueOnce('Staff');
    vi.mocked(select).mockResolvedValueOnce('primary').mockResolvedValueOnce('accept');

    const result = await reviewRoles(mockRoles);

    expect(result).toEqual(mockRoles);
  });

  it('skips edit when stack is cancelled', async () => {
    vi.mocked(select).mockResolvedValueOnce('edit').mockResolvedValueOnce(0);
    vi.mocked(isCancel)
      .mockReturnValueOnce(false) // action select
      .mockReturnValueOnce(false) // role select
      .mockReturnValueOnce(false) // slug ok
      .mockReturnValueOnce(false) // title ok
      .mockReturnValueOnce(false) // priority ok
      .mockReturnValueOnce(false) // level ok
      .mockReturnValueOnce(false) // domain ok
      .mockReturnValueOnce(true); // stack cancel

    vi.mocked(text)
      .mockResolvedValueOnce('new-slug')
      .mockResolvedValueOnce('New Title')
      .mockResolvedValueOnce('Staff')
      .mockResolvedValueOnce('Backend');
    vi.mocked(select).mockResolvedValueOnce('primary').mockResolvedValueOnce('accept');

    const result = await reviewRoles(mockRoles);

    expect(result).toEqual(mockRoles);
  });

  it('skips edit when workStyle is cancelled', async () => {
    vi.mocked(select).mockResolvedValueOnce('edit').mockResolvedValueOnce(0);
    vi.mocked(isCancel)
      .mockReturnValueOnce(false) // action select
      .mockReturnValueOnce(false) // role select
      .mockReturnValueOnce(false) // slug ok
      .mockReturnValueOnce(false) // title ok
      .mockReturnValueOnce(false) // priority ok
      .mockReturnValueOnce(false) // level ok
      .mockReturnValueOnce(false) // domain ok
      .mockReturnValueOnce(false) // stack ok
      .mockReturnValueOnce(true); // workStyle cancel

    vi.mocked(text)
      .mockResolvedValueOnce('new-slug')
      .mockResolvedValueOnce('New Title')
      .mockResolvedValueOnce('Staff')
      .mockResolvedValueOnce('Backend')
      .mockResolvedValueOnce('Go');
    vi.mocked(select).mockResolvedValueOnce('primary').mockResolvedValueOnce('accept');

    const result = await reviewRoles(mockRoles);

    expect(result).toEqual(mockRoles);
  });

  it('skips edit when compensation is cancelled', async () => {
    vi.mocked(select).mockResolvedValueOnce('edit').mockResolvedValueOnce(0);
    vi.mocked(isCancel)
      .mockReturnValueOnce(false) // action select
      .mockReturnValueOnce(false) // role select
      .mockReturnValueOnce(false) // slug ok
      .mockReturnValueOnce(false) // title ok
      .mockReturnValueOnce(false) // priority ok
      .mockReturnValueOnce(false) // level ok
      .mockReturnValueOnce(false) // domain ok
      .mockReturnValueOnce(false) // stack ok
      .mockReturnValueOnce(false) // workStyle ok
      .mockReturnValueOnce(true); // compensation cancel

    vi.mocked(text)
      .mockResolvedValueOnce('new-slug')
      .mockResolvedValueOnce('New Title')
      .mockResolvedValueOnce('Staff')
      .mockResolvedValueOnce('Backend')
      .mockResolvedValueOnce('Go')
      .mockResolvedValueOnce('Remote');
    vi.mocked(select).mockResolvedValueOnce('primary').mockResolvedValueOnce('accept');

    const result = await reviewRoles(mockRoles);

    expect(result).toEqual(mockRoles);
  });

  it('skips edit when notes is cancelled', async () => {
    vi.mocked(select).mockResolvedValueOnce('edit').mockResolvedValueOnce(0);
    vi.mocked(isCancel)
      .mockReturnValueOnce(false) // action select
      .mockReturnValueOnce(false) // role select
      .mockReturnValueOnce(false) // slug ok
      .mockReturnValueOnce(false) // title ok
      .mockReturnValueOnce(false) // priority ok
      .mockReturnValueOnce(false) // level ok
      .mockReturnValueOnce(false) // domain ok
      .mockReturnValueOnce(false) // stack ok
      .mockReturnValueOnce(false) // workStyle ok
      .mockReturnValueOnce(false) // compensation ok
      .mockReturnValueOnce(true); // notes cancel

    vi.mocked(text)
      .mockResolvedValueOnce('new-slug')
      .mockResolvedValueOnce('New Title')
      .mockResolvedValueOnce('Staff')
      .mockResolvedValueOnce('Backend')
      .mockResolvedValueOnce('Go')
      .mockResolvedValueOnce('Remote')
      .mockResolvedValueOnce('200k');
    vi.mocked(select).mockResolvedValueOnce('primary').mockResolvedValueOnce('accept');

    const result = await reviewRoles(mockRoles);

    expect(result).toEqual(mockRoles);
  });

  describe('validateRoleSlug', () => {
    it('returns error for empty slug', () => {
      expect(validateRoleSlug('')).toBe('Slug is required');
    });

    it('returns error for invalid slug format', () => {
      expect(validateRoleSlug('UPPERCASE')).toBe('Must be lowercase alphanumeric with hyphens');
      expect(validateRoleSlug('has space')).toBe('Must be lowercase alphanumeric with hyphens');
      expect(validateRoleSlug('special!chars')).toBe('Must be lowercase alphanumeric with hyphens');
    });

    it('returns undefined for valid slug', () => {
      expect(validateRoleSlug('senior-backend')).toBeUndefined();
      expect(validateRoleSlug('staff-engineer')).toBeUndefined();
      expect(validateRoleSlug('a')).toBeUndefined();
    });
  });

  describe('validateRoleTitle', () => {
    it('returns error for empty title', () => {
      expect(validateRoleTitle('')).toBe('Title is required');
    });

    it('returns undefined for non-empty title', () => {
      expect(validateRoleTitle('Senior Backend Engineer')).toBeUndefined();
    });
  });
});
