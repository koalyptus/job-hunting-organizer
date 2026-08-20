import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { answerQuestion } from '../../../workflow/applications/application-qa.js';
import { registerAnswerQuestion } from '../../tools/answer-question.js';
import { createStore } from '../../../storage/index.js';

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
      noSave: z.boolean().optional().describe('Do not save to file (stdout only)'),
      imagePath: z.string().optional().describe('Path to image file (screenshot of the question)'),
    }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../workflow/applications/application-qa.js', () => ({
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

    const { client } = await createTestServer((srv) => registerAnswerQuestion(srv, createStore()));

    const result = await client.callTool({
      name: 'answer_question',
      arguments: {
        campaign: 'default',
        slug: 'test-app',
        question: 'How much React experience does the candidate have?',
        steer: 'Be concise',
      },
    });
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

    const { client } = await createTestServer((srv) => registerAnswerQuestion(srv, createStore()));

    const result = await client.callTool({
      name: 'answer_question',
      arguments: {
        campaign: 'default',
        slug: 'test-app',
        question: 'How much Node.js experience?',
      },
    });
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

    const { client } = await createTestServer((srv) => registerAnswerQuestion(srv, createStore()));

    const result = await client.callTool({
      name: 'answer_question',
      arguments: {
        campaign: 'default',
        slug: 'test-app',
        question: 'What is your greatest weakness?',
      },
    });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('LLM refused to answer the question');
  });
});
