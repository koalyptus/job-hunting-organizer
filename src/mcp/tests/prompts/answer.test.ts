import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer } from './helpers.js';
import { answerQuestion } from '../../../core/applications/application-qa.js';
import { registerAnswerPrompt } from '../../prompts/answer.js';

vi.mock('../../../core/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/applications/application-qa.js', () => ({
  answerQuestion: vi.fn().mockResolvedValue({ answer: 'test answer' }),
}));

describe('answer prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns answer message', async () => {
    const { server, getHandler } = fakeServer();
    registerAnswerPrompt(server);
    const handler = getHandler()!;

    const result = await handler({
      campaign: 'default',
      slug: 'test-app',
      question: 'test question',
    });
    expect(result.messages).toBeDefined();
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(message.role).toBe('assistant');
    expect(message.content.type).toBe('text');
    const data = JSON.parse(message.content.text);
    expect(data.answer).toBe('test answer');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(answerQuestion).mockRejectedValue(new Error('test error'));

    const { server, getHandler } = fakeServer();
    registerAnswerPrompt(server);
    const handler = getHandler()!;

    const result = await handler({
      campaign: 'default',
      slug: 'test-app',
      question: 'test question',
    });
    expect(result.messages).toBeDefined();
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(message.content.text).toContain('Error answering question');
    expect(message.content.text).toContain('test error');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(answerQuestion).mockRejectedValue('string error');

    const { server, getHandler } = fakeServer();
    registerAnswerPrompt(server);
    const handler = getHandler()!;

    const result = await handler({
      campaign: 'default',
      slug: 'test-app',
      question: 'test question',
    });
    expect(result.messages).toBeDefined();
    const message = result.messages[0]!;
    expect(message.content.text).toContain('Error answering question');
    expect(message.content.text).toContain('string error');
  });
});
