import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer } from './helpers.js';
import { readShowData, readShowFile, ShowError } from '../../../core/applications/show.js';
import { registerApplication } from '../../resources/application.js';

vi.mock('../../../core/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/paths.js', () => ({
  resolveCampaignRoot: vi.fn().mockReturnValue('/mock/campaign'),
  resolveAppliedDir: vi.fn().mockReturnValue('/mock/applied'),
}));

vi.mock('../../../core/applications/show.js', () => ({
  readShowData: vi.fn(),
  readShowFile: vi.fn(),
  ShowError: class MockShowError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ShowError';
    }
  },
}));

describe('application resource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readShowData).mockResolvedValue({
      frontmatter: {} as never,
      body: 'test body',
      filesPresent: [],
    });
    vi.mocked(readShowFile).mockResolvedValue('');
  });

  it('returns application data', async () => {
    const { server, getHandler } = fakeServer();
    registerApplication(server);
    const handler = getHandler()!;

    const result = await handler(new URL('jho://applications/default/test-app'), {
      campaign: 'default',
      slug: 'test-app',
    });
    expect(result.contents).toBeDefined();
    expect(result.contents).toHaveLength(1);
    const content = result.contents[0]!;
    expect(content.mimeType).toBe('application/json');
    const data = JSON.parse(content.text);
    expect(data.body).toBe('test body');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(readShowData).mockRejectedValue(new Error('test error'));

    const { server, getHandler } = fakeServer();
    registerApplication(server);
    const handler = getHandler()!;

    const result = await handler(new URL('jho://applications/default/test-app'), {
      campaign: 'default',
      slug: 'test-app',
    });
    expect(result.contents).toBeDefined();
    expect(result.contents).toHaveLength(1);
    const content = result.contents[0]!;
    const data = JSON.parse(content.text);
    expect(data.error).toBe('test error');
  });

  it('returns error when campaign parameter is missing', async () => {
    const { server, getHandler } = fakeServer();
    registerApplication(server);
    const handler = getHandler()!;

    const result = await handler(new URL('jho://applications/default/test-app'), {
      campaign: undefined as unknown as string,
      slug: 'test-app',
    });
    expect(result.contents).toBeDefined();
    const content = result.contents[0]!;
    const data = JSON.parse(content.text);
    expect(data.error).toContain('campaign and slug parameters are required');
  });

  it('returns error when slug parameter is missing', async () => {
    const { server, getHandler } = fakeServer();
    registerApplication(server);
    const handler = getHandler()!;

    const result = await handler(new URL('jho://applications/default/test-app'), {
      campaign: 'default',
      slug: undefined as unknown as string,
    });
    expect(result.contents).toBeDefined();
    const content = result.contents[0]!;
    const data = JSON.parse(content.text);
    expect(data.error).toContain('campaign and slug parameters are required');
  });

  it('handles ShowError from readShowFile gracefully', async () => {
    vi.mocked(readShowFile).mockRejectedValueOnce(new ShowError('not found'));

    const { server, getHandler } = fakeServer();
    registerApplication(server);
    const handler = getHandler()!;

    const result = await handler(new URL('jho://applications/default/test-app'), {
      campaign: 'default',
      slug: 'test-app',
    });
    expect(result.contents).toBeDefined();
    const content = result.contents[0]!;
    const data = JSON.parse(content.text);
    expect(data.body).toBe('test body');
    expect(data.jdContent).toBe('');
  });

  it('re-throws non-ShowError from readShowFile', async () => {
    vi.mocked(readShowFile).mockRejectedValueOnce(new Error('different error'));

    const { server, getHandler } = fakeServer();
    registerApplication(server);
    const handler = getHandler()!;

    const result = await handler(new URL('jho://applications/default/test-app'), {
      campaign: 'default',
      slug: 'test-app',
    });
    expect(result.contents).toBeDefined();
    const content = result.contents[0]!;
    const data = JSON.parse(content.text);
    expect(data.error).toBe('different error');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(readShowData).mockRejectedValue('string error');

    const { server, getHandler } = fakeServer();
    registerApplication(server);
    const handler = getHandler()!;

    const result = await handler(new URL('jho://applications/default/test-app'), {
      campaign: 'default',
      slug: 'test-app',
    });
    expect(result.contents).toBeDefined();
    const content = result.contents[0]!;
    const data = JSON.parse(content.text);
    expect(data.error).toBe('string error');
  });

  it('handles array campaign parameter', async () => {
    const { server, getHandler } = fakeServer();
    registerApplication(server);
    const handler = getHandler()!;

    const result = await handler(new URL('jho://applications/default/test-app'), {
      campaign: ['default'] as unknown as string,
      slug: 'test-app',
    });
    expect(result.contents).toBeDefined();
    const content = result.contents[0]!;
    const data = JSON.parse(content.text);
    expect(data.body).toBe('test body');
  });

  it('handles array slug parameter', async () => {
    const { server, getHandler } = fakeServer();
    registerApplication(server);
    const handler = getHandler()!;

    const result = await handler(new URL('jho://applications/default/test-app'), {
      campaign: 'default',
      slug: ['test-app'] as unknown as string,
    });
    expect(result.contents).toBeDefined();
    const content = result.contents[0]!;
    const data = JSON.parse(content.text);
    expect(data.body).toBe('test body');
  });

  it('list handler returns empty resources', async () => {
    const { server, getListHandler } = fakeServer();
    registerApplication(server);
    const listHandler = getListHandler()!;

    const result = await listHandler();
    expect(result.resources).toEqual([]);
  });
});
