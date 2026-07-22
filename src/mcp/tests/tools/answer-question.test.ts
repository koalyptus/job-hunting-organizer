import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { answerQuestion } from '../../../core/applications/application-qa.js';
import { registerAnswerQuestion } from '../../tools/answer-question.js';

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

vi.mock('../../schemas.js', () => {
  const CampaignParam = z.string();
  const SlugParam = z.string();
  return {
    AnswerQuestionInput: z.object({
      campaign: CampaignParam,
      slug: SlugParam,
      question: z.string().describe('Question to answer'),
      steer: z.string().optional().describe('Custom LLM instructions'),
    }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/applications/application-qa.js', () => ({
  answerQuestion: vi.fn().mockResolvedValue({
    answer: 'The candidate has 5 years of experience in React.',
    wordCount: 12,
    model: 'gpt-4',
    durationMs: 4000,
  }),
}));

describe('answer_question tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('answers a question with explicit steer', async () => {
    vi.mocked(answerQuestion).mockResolvedValue({
      answer: 'The candidate has 5 years of experience in React.',
      wordCount: 12,
      model: 'gpt-4',
      durationMs: 4000,
    });

    const { server, getCallback } = fakeServer();
    registerAnswerQuestion(server);
    const cb = getCallback()!;

    const result = await cb(
      {
        campaign: 'default',
        slug: 'test-app',
        question: 'How much React experience does the candidate have?',
        steer: 'Be concise',
      },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(answerQuestion).toHaveBeenCalledWith({
      slug: 'test-app',
      campaign: 'default',
      question: 'How much React experience does the candidate have?',
      steer: 'Be concise',
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.answer).toContain('React');
    expect(parsed.wordCount).toBe(12);
  });

  it('answers question with undefined steer (defaults)', async () => {
    vi.mocked(answerQuestion).mockResolvedValue({
      answer: 'The candidate has 3 years of experience in Node.js.',
      wordCount: 8,
      model: 'gpt-4',
      durationMs: 2000,
    });

    const { server, getCallback } = fakeServer();
    registerAnswerQuestion(server);
    const cb = getCallback()!;

    const result = await cb(
      {
        campaign: 'default',
        slug: 'test-app',
        question: 'How much Node.js experience?',
      },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(answerQuestion).toHaveBeenCalledWith({
      slug: 'test-app',
      campaign: 'default',
      question: 'How much Node.js experience?',
      steer: undefined,
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.answer).toContain('Node.js');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(answerQuestion).mockRejectedValue(new Error('LLM refused to answer the question'));

    const { server, getCallback } = fakeServer();
    registerAnswerQuestion(server);
    const cb = getCallback()!;

    const result = await cb(
      {
        campaign: 'default',
        slug: 'test-app',
        question: 'What is your greatest weakness?',
      },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('LLM refused to answer the question');
  });
});
