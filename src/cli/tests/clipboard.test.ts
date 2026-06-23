import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readClipboard } from '../clipboard.js';
import { UserInputError } from '../errors.js';
import clipboardy from 'clipboardy';

vi.mock('clipboardy', () => ({
  default: {
    read: vi.fn(),
  },
}));

describe('readClipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns clipboard text', async () => {
    vi.mocked(clipboardy.read).mockResolvedValue('clipboard content');

    const result = await readClipboard();

    expect(result).toBe('clipboard content');
  });

  it('throws UserInputError if clipboard is empty', async () => {
    vi.mocked(clipboardy.read).mockResolvedValue('');

    await expect(readClipboard()).rejects.toThrow(UserInputError);
    await expect(readClipboard()).rejects.toThrow('clipboard is empty');
  });

  it('throws UserInputError if clipboard is whitespace only', async () => {
    vi.mocked(clipboardy.read).mockResolvedValue('   \n\t  ');

    await expect(readClipboard()).rejects.toThrow(UserInputError);
    await expect(readClipboard()).rejects.toThrow('clipboard is empty');
  });
});
