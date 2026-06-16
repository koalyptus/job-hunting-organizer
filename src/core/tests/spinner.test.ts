import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockFail = vi.fn();
const mockSucceed = vi.fn();
const mockStart = vi.fn().mockReturnThis();

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: mockStart,
    stop: vi.fn().mockReturnThis(),
    succeed: mockSucceed,
    fail: mockFail,
    warn: vi.fn().mockReturnThis(),
    info: vi.fn().mockReturnThis(),
    text: '',
  })),
}));

vi.mock('../logger.js', () => ({
  isInteractive: vi.fn(() => true),
}));

describe('withSpinner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStart.mockReturnThis();
  });

  it('returns the result on success', async () => {
    const { withSpinner } = await import('../spinner.js');
    const result = await withSpinner('loading', 'done', async () => 42);
    expect(result).toBe(42);
    expect(mockSucceed).toHaveBeenCalledWith('done');
  });

  it('re-throws on error', async () => {
    const { withSpinner } = await import('../spinner.js');
    await expect(
      withSpinner('loading', 'done', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('uses raw error message as fail text by default', async () => {
    const { withSpinner } = await import('../spinner.js');
    await expect(
      withSpinner('loading', 'done', async () => {
        throw new Error('api error');
      }),
    ).rejects.toThrow();

    expect(mockFail).toHaveBeenCalledWith('Error: api error');
  });

  it('uses custom failText when provided', async () => {
    const { withSpinner } = await import('../spinner.js');
    await expect(
      withSpinner(
        'loading',
        'done',
        async () => {
          throw new Error('sensitive details');
        },
        'Profile build failed',
      ),
    ).rejects.toThrow();

    expect(mockFail).toHaveBeenCalledWith('Profile build failed');
  });
});
