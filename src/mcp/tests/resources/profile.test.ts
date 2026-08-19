import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createTestServer,
  createTestServerAndCapture,
  invokeResourceRead,
  resourceText,
} from './helpers.js';
import { readProfile } from '../../../workflow/campaign/profile-read.js';
import { registerProfile } from '../../resources/profile.js';

vi.mock('../../../core/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/paths.js', () => ({
  resolveCampaignRoot: vi.fn().mockReturnValue('/mock/campaign'),
}));

vi.mock('../../../workflow/campaign/profile-read.js', () => ({
  readProfile: vi.fn(),
}));

describe('profile resource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readProfile).mockResolvedValue('test profile content');
  });

  it('returns profile content', async () => {
    const { client } = await createTestServer(registerProfile);
    const result = await client.readResource({ uri: 'jho://profile/default' });
    expect(result.contents).toHaveLength(1);
    const content = result.contents[0]!;
    expect(content.mimeType).toBe('application/json');
    const data = JSON.parse(resourceText(content));
    expect(data.content).toBe('test profile content');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(readProfile).mockRejectedValue(new Error('test error'));

    const { client } = await createTestServer(registerProfile);
    const result = await client.readResource({ uri: 'jho://profile/default' });
    expect(result.contents).toHaveLength(1);
    const content = result.contents[0]!;
    const data = JSON.parse(resourceText(content));
    expect(data.error).toBe('test error');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(readProfile).mockRejectedValue('string error');

    const { client } = await createTestServer(registerProfile);
    const result = await client.readResource({ uri: 'jho://profile/default' });
    expect(result.contents).toHaveLength(1);
    const content = result.contents[0]!;
    const data = JSON.parse(resourceText(content));
    expect(data.error).toBe('string error');
  });

  it('returns error when campaign parameter is missing', async () => {
    const { readCallbacks } = await createTestServerAndCapture(registerProfile);
    const handler = readCallbacks[0]!;

    const result = await invokeResourceRead(handler, 'jho://profile/default', {
      campaign: undefined as unknown as string,
    });
    expect(result.contents).toBeDefined();
    const content = result.contents[0]!;
    const data = JSON.parse(resourceText(content));
    expect(data.error).toContain('campaign parameter is required');
  });

  it('handles array campaign parameter', async () => {
    const { readCallbacks } = await createTestServerAndCapture(registerProfile);
    const handler = readCallbacks[0]!;

    const result = await invokeResourceRead(handler, 'jho://profile/default', {
      campaign: ['default'] as unknown as string,
    });
    expect(result.contents).toBeDefined();
    const content = result.contents[0]!;
    const data = JSON.parse(resourceText(content));
    expect(data.content).toBe('test profile content');
  });

  it('list handler returns empty resources', async () => {
    const { client } = await createTestServer(registerProfile);
    const result = await client.listResources();
    expect(result.resources).toEqual([]);
  });
});
