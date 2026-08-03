import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createTestServer,
  createTestServerAndCapture,
  invokeResourceRead,
  resourceText,
} from './helpers.js';
import { runListApplications } from '../../../core/list/list.js';
import { registerApplications } from '../../resources/applications.js';

vi.mock('../../../core/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/list/list.js', () => ({
  runListApplications: vi.fn(),
}));

describe('applications resource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runListApplications).mockResolvedValue({ entries: [] });
  });

  it('returns applications list', async () => {
    vi.mocked(runListApplications).mockResolvedValue({
      entries: [{ slug: 'test-app', status: 'applied' }] as never[],
    });

    const { client } = await createTestServer(registerApplications);
    const result = await client.readResource({ uri: 'jho://applications/default' });
    expect(result.contents).toHaveLength(1);
    const content = result.contents[0]!;
    expect(content.mimeType).toBe('application/json');
    const data = JSON.parse(resourceText(content));
    expect(data.entries).toHaveLength(1);
  });

  it('returns error when core function fails', async () => {
    vi.mocked(runListApplications).mockImplementation(() => {
      throw new Error('test error');
    });

    const { client } = await createTestServer(registerApplications);
    const result = await client.readResource({ uri: 'jho://applications/default' });
    expect(result.contents).toHaveLength(1);
    const content = result.contents[0]!;
    const data = JSON.parse(resourceText(content));
    expect(data.error).toBe('test error');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(runListApplications).mockImplementation(() => {
      throw 'string error';
    });

    const { client } = await createTestServer(registerApplications);
    const result = await client.readResource({ uri: 'jho://applications/default' });
    expect(result.contents).toHaveLength(1);
    const content = result.contents[0]!;
    const data = JSON.parse(resourceText(content));
    expect(data.error).toBe('string error');
  });

  it('returns error when campaign parameter is missing', async () => {
    const { readCallbacks } = await createTestServerAndCapture(registerApplications);
    const handler = readCallbacks[0]!;

    const result = await invokeResourceRead(handler, 'jho://applications/default', {
      campaign: undefined as unknown as string,
    });
    expect(result.contents).toBeDefined();
    const content = result.contents[0]!;
    const data = JSON.parse(resourceText(content));
    expect(data.error).toContain('campaign parameter is required');
  });

  it('handles array campaign parameter', async () => {
    const { readCallbacks } = await createTestServerAndCapture(registerApplications);
    const handler = readCallbacks[0]!;

    const result = await invokeResourceRead(handler, 'jho://applications/default', {
      campaign: ['default'] as unknown as string,
    });
    expect(result.contents).toBeDefined();
    const content = result.contents[0]!;
    const data = JSON.parse(resourceText(content));
    expect(data.entries).toEqual([]);
  });

  it('list handler returns empty resources', async () => {
    const { client } = await createTestServer(registerApplications);
    const result = await client.listResources();
    expect(result.resources).toEqual([]);
  });
});
