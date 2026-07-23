import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer } from './helpers.js';
import { generatePrep } from '../../../core/prepare/prepare.js';
import { registerInterviewPrompt } from '../../prompts/interview.js';

vi.mock('../../../core/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/prepare/prepare.js', () => ({
  generatePrep: vi.fn().mockResolvedValue({ prep: 'test prep content' }),
}));

describe('interview prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns interview prep message', async () => {
    const { server, getHandler } = fakeServer();
    registerInterviewPrompt(server);
    const handler = getHandler()!;

    const result = await handler({ campaign: 'default', slug: 'test-app' });
    expect(result.messages).toBeDefined();
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(message.role).toBe('assistant');
    expect(message.content.type).toBe('text');
    const data = JSON.parse(message.content.text);
    expect(data.prep).toBe('test prep content');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(generatePrep).mockRejectedValue(new Error('test error'));

    const { server, getHandler } = fakeServer();
    registerInterviewPrompt(server);
    const handler = getHandler()!;

    const result = await handler({ campaign: 'default', slug: 'test-app' });
    expect(result.messages).toBeDefined();
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(message.content.text).toContain('Error generating interview prep');
    expect(message.content.text).toContain('test error');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(generatePrep).mockRejectedValue('string error');

    const { server, getHandler } = fakeServer();
    registerInterviewPrompt(server);
    const handler = getHandler()!;

    const result = await handler({ campaign: 'default', slug: 'test-app' });
    expect(result.messages).toBeDefined();
    const message = result.messages[0]!;
    expect(message.content.text).toContain('Error generating interview prep');
    expect(message.content.text).toContain('string error');
  });
});
