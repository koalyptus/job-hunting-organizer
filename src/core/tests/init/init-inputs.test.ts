import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { text, isCancel } from '@clack/prompts';
import { validateCvPath } from '../../../core/cv.js';
import { loadCampaignConfig } from '../../../core/config/config.js';
import {
  promptLinkedin,
  promptCvPath,
  promptKbPath,
  validateCvWithRetry,
  loadExistingCampaignValues,
} from '../../../core/init/init-inputs.js';
import { JHO_LINKEDIN_URL, JHO_CV_PATH, JHO_KB_PATH } from '../../../core/init/constants.js';
import type { CampaignConfig } from '../../../core/types.js';
import type { Logger } from 'pino';

vi.mock('@clack/prompts', () => ({
  text: vi.fn(),
  isCancel: vi.fn(() => false),
  log: { warn: vi.fn(), info: vi.fn() },
}));

vi.mock('../../../core/cv.js', () => ({
  validateCvPath: vi.fn(),
}));

vi.mock('../../../core/config/config.js', () => ({
  loadCampaignConfig: vi.fn(),
}));

const mockText = vi.mocked(text);
const mockIsCancel = vi.mocked(isCancel);
const mockValidateCvPath = vi.mocked(validateCvPath);
const mockLoadCampaignConfig = vi.mocked(loadCampaignConfig);

describe('init-inputs', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv[JHO_LINKEDIN_URL] = process.env[JHO_LINKEDIN_URL];
    savedEnv[JHO_CV_PATH] = process.env[JHO_CV_PATH];
    savedEnv[JHO_KB_PATH] = process.env[JHO_KB_PATH];
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  describe('promptLinkedin', () => {
    it('returns opts.linkedin when provided', async () => {
      const result = await promptLinkedin({ linkedin: 'https://linkedin.com/in/test' }, undefined);
      expect(result).toBe('https://linkedin.com/in/test');
      expect(mockText).not.toHaveBeenCalled();
    });

    it('uses JHO_LINKEDIN_URL env var', async () => {
      process.env[JHO_LINKEDIN_URL] = 'https://linkedin.com/in/env';
      const result = await promptLinkedin({}, undefined);
      expect(result).toBe('https://linkedin.com/in/env');
    });

    it('falls back to existingLinkedinUrl in --yes mode', async () => {
      const result = await promptLinkedin({ yes: true }, 'https://linkedin.com/in/existing');
      expect(result).toBe('https://linkedin.com/in/existing');
      expect(mockText).not.toHaveBeenCalled();
    });

    it('prompts when no option, env, or existing', async () => {
      mockText.mockResolvedValueOnce('https://linkedin.com/in/user');
      const result = await promptLinkedin({}, undefined);
      expect(result).toBe('https://linkedin.com/in/user');
      expect(mockText).toHaveBeenCalledOnce();
    });

    it('trims input', async () => {
      mockText.mockResolvedValueOnce('  https://linkedin.com/in/trimmed  ');
      const result = await promptLinkedin({}, undefined);
      expect(result).toBe('https://linkedin.com/in/trimmed');
    });

    it('returns undefined on empty input', async () => {
      mockText.mockResolvedValueOnce('');
      const result = await promptLinkedin({}, undefined);
      expect(result).toBeUndefined();
    });

    it('throws InitCancelled on cancel', async () => {
      mockIsCancel.mockReturnValueOnce(true);
      await expect(promptLinkedin({}, undefined)).rejects.toThrow('Init cancelled');
    });
  });

  describe('promptCvPath', () => {
    it('returns opts.cv when provided', async () => {
      const result = await promptCvPath({ cv: '/path/to/cv.pdf' }, undefined);
      expect(result).toBe('/path/to/cv.pdf');
      expect(mockText).not.toHaveBeenCalled();
    });

    it('uses JHO_CV_PATH env var', async () => {
      process.env[JHO_CV_PATH] = '/env/cv.pdf';
      const result = await promptCvPath({}, undefined);
      expect(result).toBe('/env/cv.pdf');
    });

    it('falls back to existingCvPath in --yes mode', async () => {
      const result = await promptCvPath({ yes: true }, '/existing/cv.pdf');
      expect(result).toBe('/existing/cv.pdf');
    });

    it('prompts when no option', async () => {
      mockText.mockResolvedValueOnce('/user/cv.pdf');
      const result = await promptCvPath({}, undefined);
      expect(result).toBe('/user/cv.pdf');
    });

    it('throws InitCancelled on cancel', async () => {
      mockIsCancel.mockReturnValueOnce(true);
      await expect(promptCvPath({}, undefined)).rejects.toThrow('Init cancelled');
    });
  });

  describe('promptKbPath', () => {
    it('returns opts.kb when provided', async () => {
      const result = await promptKbPath({ kb: '/path/to/kb' });
      expect(result).toBe('/path/to/kb');
    });

    it('uses JHO_KB_PATH env var', async () => {
      process.env[JHO_KB_PATH] = '/env/kb';
      const result = await promptKbPath({});
      expect(result).toBe('/env/kb');
    });

    it('prompts when no option', async () => {
      mockText.mockResolvedValueOnce('/user/kb');
      const result = await promptKbPath({});
      expect(result).toBe('/user/kb');
    });

    it('throws InitCancelled on cancel', async () => {
      mockIsCancel.mockReturnValueOnce(true);
      await expect(promptKbPath({})).rejects.toThrow('Init cancelled');
    });
  });

  describe('validateCvWithRetry', () => {
    it('returns path unchanged when valid', async () => {
      mockValidateCvPath.mockResolvedValueOnce({ ok: true });
      const result = await validateCvWithRetry('/valid/cv.pdf', false);
      expect(result).toBe('/valid/cv.pdf');
    });

    it('skips invalid path in non-interactive mode', async () => {
      mockValidateCvPath.mockResolvedValueOnce({ ok: false, error: 'bad file' });
      const result = await validateCvWithRetry('/bad/cv.pdf', true);
      expect(result).toBeUndefined();
    });

    it('re-prompts on invalid path interactively', async () => {
      mockValidateCvPath
        .mockResolvedValueOnce({ ok: false, error: 'bad' })
        .mockResolvedValueOnce({ ok: true });
      mockText.mockResolvedValueOnce('/new/cv.pdf');
      const result = await validateCvWithRetry('/bad/cv.pdf', false);
      expect(result).toBe('/new/cv.pdf');
    });

    it('returns undefined when user skips retry', async () => {
      mockValidateCvPath.mockResolvedValueOnce({ ok: false, error: 'bad' });
      mockText.mockResolvedValueOnce('');
      const result = await validateCvWithRetry('/bad/cv.pdf', false);
      expect(result).toBeUndefined();
    });

    it('returns undefined when no cvPath', async () => {
      const result = await validateCvWithRetry(undefined, false);
      expect(result).toBeUndefined();
      expect(mockValidateCvPath).not.toHaveBeenCalled();
    });
  });

  describe('loadExistingCampaignValues', () => {
    it('returns values when config exists', async () => {
      mockLoadCampaignConfig.mockReturnValueOnce({
        cv: { path: '/cv.pdf' },
        linkedin: { url: 'https://linkedin.com/in/test' },
      } as CampaignConfig);
      const log = { debug: vi.fn() } as unknown as Logger;
      const result = await loadExistingCampaignValues('test', log);
      expect(result).toEqual({ cvPath: '/cv.pdf', linkedinUrl: 'https://linkedin.com/in/test' });
    });

    it('returns empty when config load fails', async () => {
      mockLoadCampaignConfig.mockImplementationOnce(() => {
        throw new Error('not found');
      });
      const log = { debug: vi.fn() } as unknown as Logger;
      const result = await loadExistingCampaignValues('test', log);
      expect(result).toEqual({});
      expect(log.debug).toHaveBeenCalled();
    });
  });
});
