import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer } from './helpers.js';
import { startRetro } from '../../../core/retro/retro.js';
import { registerRetroPrompt } from '../../prompts/retro.js';

vi.mock('../../../core/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/retro/retro.js', () => ({
  startRetro: vi.fn().mockResolvedValue({ learningPlan: 'test learning plan' }),
}));

describe('retro prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns retro message', async () => {
    const { server, getHandler } = fakeServer();
    registerRetroPrompt(server);
    const handler = getHandler()!;

    const result = await handler({ campaign: 'default', slug: 'test-app' });
    expect(result.messages).toBeDefined();
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(message.role).toBe('assistant');
    expect(message.content.type).toBe('text');
    const data = JSON.parse(message.content.text);
    expect(data.learningPlan).toBe('test learning plan');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(startRetro).mockRejectedValue(new Error('test error'));

    const { server, getHandler } = fakeServer();
    registerRetroPrompt(server);
    const handler = getHandler()!;

    const result = await handler({ campaign: 'default', slug: 'test-app' });
    expect(result.messages).toBeDefined();
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(message.content.text).toContain('Error generating retro');
    expect(message.content.text).toContain('test error');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(startRetro).mockRejectedValue('string error');

    const { server, getHandler } = fakeServer();
    registerRetroPrompt(server);
    const handler = getHandler()!;

    const result = await handler({ campaign: 'default', slug: 'test-app' });
    expect(result.messages).toBeDefined();
    const message = result.messages[0]!;
    expect(message.content.text).toContain('Error generating retro');
    expect(message.content.text).toContain('string error');
  });
});
