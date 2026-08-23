import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestServer, promptText } from './helpers.js';
import { startRetro } from '../../../workflow/retro/retro.js';
import { registerRetroPrompt } from '../../prompts/retro.js';

vi.mock('../../../lib/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../workflow/retro/retro.js', () => ({
  startRetro: vi.fn().mockResolvedValue({ learningPlan: 'test learning plan' }),
}));

describe('retro prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns retro message', async () => {
    const { client } = await createTestServer(registerRetroPrompt);
    const result = await client.getPrompt({
      name: 'retro',
      arguments: { campaign: 'default', slug: 'test-app' },
    });
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(message.role).toBe('assistant');
    expect(message.content.type).toBe('text');
    const data = JSON.parse(promptText(message));
    expect(data.learningPlan).toBe('test learning plan');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(startRetro).mockRejectedValue(new Error('test error'));

    const { client } = await createTestServer(registerRetroPrompt);
    const result = await client.getPrompt({
      name: 'retro',
      arguments: { campaign: 'default', slug: 'test-app' },
    });
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(promptText(message)).toContain('Error generating retro');
    expect(promptText(message)).toContain('test error');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(startRetro).mockRejectedValue('string error');

    const { client } = await createTestServer(registerRetroPrompt);
    const result = await client.getPrompt({
      name: 'retro',
      arguments: { campaign: 'default', slug: 'test-app' },
    });
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(promptText(message)).toContain('Error generating retro');
    expect(promptText(message)).toContain('string error');
  });
});
