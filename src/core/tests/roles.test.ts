import { describe, expect, it, vi, beforeEach } from 'vitest';
import { reviewRoles } from '../roles.js';
import type { TargetRole } from '../types.js';

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
    const { select } = await import('@clack/prompts');
    vi.mocked(select).mockResolvedValue('accept');

    const result = await reviewRoles(mockRoles);

    expect(result).toEqual(mockRoles);
  });

  it('adds a new role when add is selected', async () => {
    const { select, text } = await import('@clack/prompts');
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
    const { select } = await import('@clack/prompts');
    vi.mocked(select)
      .mockResolvedValueOnce('delete')
      .mockResolvedValueOnce(0) // select first role
      .mockResolvedValueOnce('accept');

    const result = await reviewRoles(mockRoles);

    expect(result).toHaveLength(1);
    expect(result[0]?.slug).toBe('fullstack');
  });

  it('edits a role when edit is selected', async () => {
    const { select, text } = await import('@clack/prompts');
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
    const { select, text } = await import('@clack/prompts');
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
    const { select, isCancel } = await import('@clack/prompts');
    vi.mocked(select).mockResolvedValueOnce('edit').mockResolvedValueOnce(0);
    vi.mocked(isCancel).mockReturnValueOnce(false).mockReturnValueOnce(true); // cancel role selection

    // Second iteration: accept
    vi.mocked(select).mockResolvedValueOnce('accept');

    const result = await reviewRoles(mockRoles);

    expect(result).toEqual(mockRoles);
  });

  it('continues loop on cancel during delete selection', async () => {
    const { select, isCancel } = await import('@clack/prompts');
    vi.mocked(select).mockResolvedValueOnce('delete').mockResolvedValueOnce(0);
    vi.mocked(isCancel).mockReturnValueOnce(false).mockReturnValueOnce(true); // cancel role selection

    // Second iteration: accept
    vi.mocked(select).mockResolvedValueOnce('accept');

    const result = await reviewRoles(mockRoles);

    expect(result).toEqual(mockRoles);
  });
});
