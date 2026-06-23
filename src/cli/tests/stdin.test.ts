import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import { readStdin } from '../stdin.js';
import { UserInputError } from '../errors.js';

describe('readStdin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns stdin text', async () => {
    const mockStream = new Readable({
      read() {
        this.push('stdin content');
        this.push(null);
      },
    });
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(
      mockStream as unknown as typeof process.stdin,
    );

    const result = await readStdin();

    expect(result).toBe('stdin content');
  });

  it('throws UserInputError if stdin is empty', async () => {
    const mockStream = new Readable({
      read() {
        this.push(null);
      },
    });
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(
      mockStream as unknown as typeof process.stdin,
    );

    await expect(readStdin()).rejects.toThrow(UserInputError);
    await expect(readStdin()).rejects.toThrow('stdin is empty');
  });

  it('throws UserInputError if stdin is whitespace only', async () => {
    const mockStream = new Readable({
      read() {
        this.push('   \n\t  ');
        this.push(null);
      },
    });
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(
      mockStream as unknown as typeof process.stdin,
    );

    await expect(readStdin()).rejects.toThrow(UserInputError);
    await expect(readStdin()).rejects.toThrow('stdin is empty');
  });

  it('throws UserInputError if stdin is a TTY', async () => {
    const mockStream = new Readable({
      read() {
        this.push(null);
      },
    });
    Object.defineProperty(mockStream, 'isTTY', { value: true });
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(
      mockStream as unknown as typeof process.stdin,
    );

    await expect(readStdin()).rejects.toThrow(UserInputError);
    await expect(readStdin()).rejects.toThrow('--stdin requires piped input');
  });

  it('concatenates multiple chunks', async () => {
    const mockStream = new Readable({
      read() {
        this.push('chunk1');
        this.push('chunk2');
        this.push('chunk3');
        this.push(null);
      },
    });
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(
      mockStream as unknown as typeof process.stdin,
    );

    const result = await readStdin();

    expect(result).toBe('chunk1chunk2chunk3');
  });
});
