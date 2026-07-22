import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { runInit } from '../../../core/init/wizard.js';
import { registerInit } from '../../tools/init-tool.js';

vi.mock('../../../core/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../error-handler.js', () => ({
  handleToolError: vi.fn((err: unknown) => ({
    content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
    isError: true as const,
  })),
}));

vi.mock('../../schemas.js', () => ({
  InitInput: z.object({
    campaign: z.string().optional(),
    cvPath: z.string().optional(),
    githubUser: z.string().optional(),
    linkedinUrl: z.string().optional(),
  }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/init/wizard.js', () => ({
  runInit: vi.fn().mockResolvedValue(undefined),
}));

describe('init tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes a campaign with default name and returns ok', async () => {
    vi.mocked(runInit).mockResolvedValue(undefined);

    const { server, getCallback } = fakeServer();
    registerInit(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    expect(runInit).toHaveBeenCalledWith({
      name: 'default',
      cv: undefined,
      github: undefined,
      linkedin: undefined,
      yes: true,
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.status).toBe('ok');
  });

  it('initializes with custom CV, GitHub, and LinkedIn', async () => {
    vi.mocked(runInit).mockResolvedValue(undefined);

    const { server, getCallback } = fakeServer();
    registerInit(server);
    const cb = getCallback()!;

    const result = await cb(
      {
        campaign: 'freelance',
        cvPath: '/path/to/cv.pdf',
        githubUser: 'maxgu',
        linkedinUrl: 'https://linkedin.com/in/maxgu',
      },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(runInit).toHaveBeenCalledWith({
      name: 'freelance',
      cv: '/path/to/cv.pdf',
      github: 'maxgu',
      linkedin: 'https://linkedin.com/in/maxgu',
      yes: true,
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.status).toBe('ok');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(runInit).mockRejectedValue(new Error('invalid campaign name'));

    const { server, getCallback } = fakeServer();
    registerInit(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'invalid name!' }, { signal: AbortSignal.timeout(3000) });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('invalid campaign name');
  });
});
