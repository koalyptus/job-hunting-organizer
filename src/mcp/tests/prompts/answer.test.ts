import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestServer, promptText } from './helpers.js';
import { answerQuestion } from '../../../workflow/applications/application-qa.js';
import { registerAnswerPrompt } from '../../prompts/answer.js';

vi.mock('../../../core/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../workflow/applications/application-qa.js', () => ({
  answerQuestion: vi.fn().mockResolvedValue({ answer: 'test answer' }),
}));

describe('answer prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns answer message', async () => {
    const { client } = await createTestServer(registerAnswerPrompt);
    const result = await client.getPrompt({
      name: 'answer',
      arguments: { campaign: 'default', slug: 'test-app', question: 'test question' },
    });
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(message.role).toBe('assistant');
    expect(message.content.type).toBe('text');
    const data = JSON.parse(promptText(message));
    expect(data.answer).toBe('test answer');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(answerQuestion).mockRejectedValue(new Error('test error'));

    const { client } = await createTestServer(registerAnswerPrompt);
    const result = await client.getPrompt({
      name: 'answer',
      arguments: { campaign: 'default', slug: 'test-app', question: 'test question' },
    });
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(promptText(message)).toContain('Error answering question');
    expect(promptText(message)).toContain('test error');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(answerQuestion).mockRejectedValue('string error');

    const { client } = await createTestServer(registerAnswerPrompt);
    const result = await client.getPrompt({
      name: 'answer',
      arguments: { campaign: 'default', slug: 'test-app', question: 'test question' },
    });
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(promptText(message)).toContain('Error answering question');
    expect(promptText(message)).toContain('string error');
  });
});
