import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestServer, promptText } from './helpers.js';
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
    const { client } = await createTestServer(registerInterviewPrompt);
    const result = await client.getPrompt({
      name: 'interview',
      arguments: { campaign: 'default', slug: 'test-app' },
    });
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(message.role).toBe('assistant');
    expect(message.content.type).toBe('text');
    const data = JSON.parse(promptText(message));
    expect(data.prep).toBe('test prep content');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(generatePrep).mockRejectedValue(new Error('test error'));

    const { client } = await createTestServer(registerInterviewPrompt);
    const result = await client.getPrompt({
      name: 'interview',
      arguments: { campaign: 'default', slug: 'test-app' },
    });
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(promptText(message)).toContain('Error generating interview prep');
    expect(promptText(message)).toContain('test error');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(generatePrep).mockRejectedValue('string error');

    const { client } = await createTestServer(registerInterviewPrompt);
    const result = await client.getPrompt({
      name: 'interview',
      arguments: { campaign: 'default', slug: 'test-app' },
    });
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(promptText(message)).toContain('Error generating interview prep');
    expect(promptText(message)).toContain('string error');
  });
});
