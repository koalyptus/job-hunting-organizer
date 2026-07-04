import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Logger } from 'pino';
import type nodeFs from 'node:fs/promises';
import { cleanupTempDir } from './cleanup.js';

const { mockRm, mockCloseLogger } = vi.hoisted(() => ({
  mockRm: vi.fn(),
  mockCloseLogger: vi.fn(),
}));

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof nodeFs>('node:fs/promises');
  return { ...actual, rm: mockRm };
});

vi.mock('../logger/logger.js', () => ({
  closeLogger: mockCloseLogger,
}));

let originalPlatform: string;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
    writable: true,
  });
}

describe('cleanupTempDir', () => {
  beforeEach(() => {
    originalPlatform = process.platform;
    vi.clearAllMocks();
  });

  afterEach(() => {
    setPlatform(originalPlatform as NodeJS.Platform);
  });

  describe('non-Windows', () => {
    beforeEach(() => {
      setPlatform('linux');
    });

    it('calls rm, closes loggers, and resolves on happy path', async () => {
      mockRm.mockResolvedValue(undefined);
      const logger = {} as unknown as Logger;

      await cleanupTempDir('/tmp/foo', [logger]);

      expect(mockCloseLogger).toHaveBeenCalledTimes(1);
      expect(mockCloseLogger).toHaveBeenCalledWith(logger);
      expect(mockRm).toHaveBeenCalledTimes(1);
      expect(mockRm).toHaveBeenCalledWith('/tmp/foo', { recursive: true, force: true });
    });

    it('propagates error when rm fails', async () => {
      const testErr = new Error('permission denied');
      mockRm.mockRejectedValue(testErr);

      await expect(cleanupTempDir('/tmp/foo')).rejects.toThrow('permission denied');
      expect(mockRm).toHaveBeenCalledTimes(1);
    });
  });

  describe('Windows', () => {
    beforeEach(() => {
      setPlatform('win32');
    });

    it('calls rm once on happy path', async () => {
      mockRm.mockResolvedValue(undefined);

      await cleanupTempDir('C:\\tmp\\foo');

      expect(mockRm).toHaveBeenCalledTimes(1);
    });

    it('retries on ENOTEMPTY and succeeds on attempt 3', async () => {
      mockRm
        .mockRejectedValueOnce(Object.assign(new Error('dir not empty'), { code: 'ENOTEMPTY' }))
        .mockRejectedValueOnce(Object.assign(new Error('dir not empty'), { code: 'ENOTEMPTY' }))
        .mockResolvedValueOnce(undefined);

      await cleanupTempDir('C:\\tmp\\foo');

      expect(mockRm).toHaveBeenCalledTimes(3);
    });

    it('throws after 5 persistent ENOTEMPTY errors', async () => {
      const err = Object.assign(new Error('dir not empty'), { code: 'ENOTEMPTY' });
      mockRm.mockRejectedValue(err);

      await expect(cleanupTempDir('C:\\tmp\\foo')).rejects.toThrow('dir not empty');
      expect(mockRm).toHaveBeenCalledTimes(5);
    });

    it('throws immediately on non-retryable error (ENOENT)', async () => {
      const err = Object.assign(new Error('no such file'), { code: 'ENOENT' });
      mockRm.mockRejectedValue(err);

      await expect(cleanupTempDir('C:\\tmp\\foo')).rejects.toThrow('no such file');
      expect(mockRm).toHaveBeenCalledTimes(1);
    });
  });

  it('does not call closeLogger when loggers array is empty', async () => {
    setPlatform('linux');
    mockRm.mockResolvedValue(undefined);

    await cleanupTempDir('/tmp/foo');

    expect(mockCloseLogger).not.toHaveBeenCalled();
    expect(mockRm).toHaveBeenCalledTimes(1);
  });

  it('closes all loggers when multiple are provided', async () => {
    setPlatform('linux');
    mockRm.mockResolvedValue(undefined);
    const loggers = [{} as unknown as Logger, {} as unknown as Logger, {} as unknown as Logger];

    await cleanupTempDir('/tmp/foo', loggers);

    expect(mockCloseLogger).toHaveBeenCalledTimes(3);
    loggers.forEach((log) => {
      expect(mockCloseLogger).toHaveBeenCalledWith(log);
    });
  });
});
