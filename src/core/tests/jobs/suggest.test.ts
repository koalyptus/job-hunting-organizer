import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Logger } from 'pino';
import { suggestTargetRole } from '../../jobs/suggest.js';
import { RoleSuggestionSchema } from '../../jobs/role-suggestion-schema.js';
import type { ExtractedJd } from '../../jobs/types.js';
import type { LlmConfig, TargetRole } from '../../types.js';

const testLlmConfig: LlmConfig = {
  baseUrl: 'https://api.test.com/v1',
  apiKey: 'sk-test',
  model: 'gpt-4o',
  timeoutMs: 300_000,
};

const mockChatComplete = vi.fn();

vi.mock('../../llm.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    chatComplete: (...args: unknown[]) => mockChatComplete(...args),
  };
});

vi.mock('../../config.js', () => ({
  loadGlobalConfig: vi.fn(() => ({
    version: 1,
    dataRoot: '/tmp',
    llm: { baseUrl: 'https://config.com/v1', apiKey: 'sk-config', model: 'gpt-4' },
    github: { user: '', token: '', repos: [] },
    calendar: {
      defaultProvider: 'ics',
      outlook: { tenantId: '', clientId: '', clientSecret: '' },
    },
    logging: { level: 'info', file: '', redactPaths: [] },
  })),
}));

const testJd: ExtractedJd = {
  title: 'Senior Backend Engineer',
  company: 'Acme Corp',
  location: 'Remote',
  tags: ['typescript', 'node.js', 'postgresql'],
  description: 'Build scalable APIs and microservices.',
  requirements: ['5+ years backend experience', 'TypeScript proficiency'],
  seniorityLevel: 'senior',
};

const testRoles: TargetRole[] = [
  {
    slug: 'senior-backend-engineer',
    title: 'Senior Backend Engineer',
    priority: 'primary',
    level: 'Senior (IC4)',
    domain: 'Backend, distributed systems',
    stack: 'TypeScript, Node.js, PostgreSQL',
    workStyle: 'Remote',
    compensation: '160k AUD',
    notes: '',
  },
  {
    slug: 'fullstack-developer',
    title: 'Fullstack Developer',
    priority: 'secondary',
    level: 'Mid-Senior (IC3-IC4)',
    domain: 'Fullstack, web apps',
    stack: 'React, TypeScript, Node.js',
    workStyle: 'Hybrid',
    compensation: '140k AUD',
    notes: 'Good fit for someone wanting broader scope',
  },
];

function mockSuggestionResponse(suggestion: {
  roleSlug?: string;
  confidence?: number;
  reasoning?: string;
}): void {
  mockChatComplete.mockResolvedValueOnce({
    content: JSON.stringify({
      roleSlug: 'senior-backend-engineer',
      confidence: 0.85,
      reasoning: 'Strong match on domain and stack.',
      ...suggestion,
    }),
    model: 'gpt-4o',
    finishReason: 'stop',
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    durationMs: 200,
  });
}

beforeEach(() => {
  mockChatComplete.mockReset();
});

describe('RoleSuggestionSchema', () => {
  it('accepts valid suggestion', () => {
    const result = RoleSuggestionSchema.safeParse({
      roleSlug: 'senior-backend-engineer',
      confidence: 0.85,
      reasoning: 'Strong match.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects confidence > 1', () => {
    const result = RoleSuggestionSchema.safeParse({
      roleSlug: 'senior-backend-engineer',
      confidence: 1.5,
      reasoning: 'Strong match.',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative confidence', () => {
    const result = RoleSuggestionSchema.safeParse({
      roleSlug: 'senior-backend-engineer',
      confidence: -0.1,
      reasoning: 'Strong match.',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty reasoning', () => {
    const result = RoleSuggestionSchema.safeParse({
      roleSlug: 'senior-backend-engineer',
      confidence: 0.85,
      reasoning: '',
    });
    expect(result.success).toBe(false);
  });

  it('accepts empty roleSlug (no match)', () => {
    const result = RoleSuggestionSchema.safeParse({
      roleSlug: '',
      confidence: 0,
      reasoning: 'No matching role found.',
    });
    expect(result.success).toBe(true);
  });
});

describe('suggestTargetRole', () => {
  it('returns matching role with confidence', async () => {
    mockSuggestionResponse({});

    const result = await suggestTargetRole(testJd, testRoles, testLlmConfig);

    expect(result.roleSlug).toBe('senior-backend-engineer');
    expect(result.confidence).toBe(0.85);
    expect(result.reasoning).toBeTruthy();
  });

  it('returns no-match when LLM finds no fit', async () => {
    mockSuggestionResponse({
      roleSlug: '',
      confidence: 0,
      reasoning: 'The JD focuses on data engineering which is not covered.',
    });

    const result = await suggestTargetRole(testJd, testRoles, testLlmConfig);

    expect(result.roleSlug).toBe('');
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toContain('data engineering');
  });

  it('returns no-match immediately when targetRoles is empty', async () => {
    const result = await suggestTargetRole(testJd, [], testLlmConfig);

    expect(result.roleSlug).toBe('');
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toContain('No target roles');
    expect(mockChatComplete).not.toHaveBeenCalled();
  });

  it('retries on validation failure', async () => {
    mockChatComplete.mockResolvedValueOnce({
      content: 'not valid json',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
      durationMs: 100,
    });
    mockSuggestionResponse({});

    const result = await suggestTargetRole(testJd, testRoles, testLlmConfig);

    expect(result.roleSlug).toBe('senior-backend-engineer');
    expect(mockChatComplete).toHaveBeenCalledTimes(2);
  });

  it('throws after max retries', async () => {
    mockChatComplete.mockResolvedValue({
      content: 'not valid json',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
      durationMs: 100,
    });

    await expect(suggestTargetRole(testJd, testRoles, testLlmConfig)).rejects.toThrow(
      /Role suggestion failed after 3 attempts/,
    );
  });

  it('sends jd fields and formatted roles in user message', async () => {
    mockSuggestionResponse({});

    await suggestTargetRole(testJd, testRoles, testLlmConfig);

    const messages = mockChatComplete.mock.calls[0]![0] as Array<{ role: string; content: string }>;
    const userMsg = messages.find((m) => m.role === 'user');
    expect(userMsg?.content).toContain('Acme Corp');
    expect(userMsg?.content).toContain('Senior Backend Engineer');
    expect(userMsg?.content).toContain('senior-backend-engineer');
    expect(userMsg?.content).toContain('fullstack-developer');
  });

  it('formats JD without optional fields', async () => {
    const minimalJd: ExtractedJd = { title: 'Dev', company: 'Co', description: 'Job description.' };
    mockSuggestionResponse({});

    await suggestTargetRole(minimalJd, testRoles, testLlmConfig);

    const messages = mockChatComplete.mock.calls[0]![0] as Array<{ role: string; content: string }>;
    const userMsg = messages.find((m) => m.role === 'user');
    expect(userMsg?.content).toContain('Title: Dev');
    expect(userMsg?.content).toContain('Company: Co');
    expect(userMsg?.content).not.toContain('Salary:');
    expect(userMsg?.content).not.toContain('Tags:');
  });

  it('formats JD with salary field', async () => {
    const jdWithSalary: ExtractedJd = {
      title: 'Dev',
      company: 'Co',
      description: 'Job description.',
      salary: '120k AUD',
    };
    mockSuggestionResponse({});

    await suggestTargetRole(jdWithSalary, testRoles, testLlmConfig);

    const messages = mockChatComplete.mock.calls[0]![0] as Array<{ role: string; content: string }>;
    const userMsg = messages.find((m) => m.role === 'user');
    expect(userMsg?.content).toContain('Salary: 120k AUD');
  });

  it('logs debug on success when logger provided', async () => {
    mockSuggestionResponse({});
    const log = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

    await suggestTargetRole(testJd, testRoles, testLlmConfig, log);

    expect(log.debug).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Senior Backend Engineer', company: 'Acme Corp' }),
      'suggest.start',
    );
    expect(log.debug).toHaveBeenCalledWith(
      expect.objectContaining({ roleSlug: 'senior-backend-engineer', confidence: 0.85 }),
      'suggest.complete',
    );
  });

  it('logs warning on validation failure when logger provided', async () => {
    mockChatComplete.mockResolvedValueOnce({
      content: 'not valid json',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
      durationMs: 100,
    });
    mockSuggestionResponse({});
    const log = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

    await suggestTargetRole(testJd, testRoles, testLlmConfig, log);

    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 0 }),
      'suggest.validation_failed',
    );
  });

  it('logs error and throws after max retries when logger provided', async () => {
    mockChatComplete.mockResolvedValue({
      content: 'not valid json',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
      durationMs: 100,
    });
    const log = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

    await expect(suggestTargetRole(testJd, testRoles, testLlmConfig, log)).rejects.toThrow(
      /Role suggestion failed after 3 attempts/,
    );
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 3 }),
      'suggest.failed',
    );
  });

  it('formats roles with notes in user message', async () => {
    mockSuggestionResponse({});

    await suggestTargetRole(testJd, testRoles, testLlmConfig);

    const messages = mockChatComplete.mock.calls[0]![0] as Array<{ role: string; content: string }>;
    const userMsg = messages.find((m) => m.role === 'user');
    expect(userMsg?.content).toContain('Good fit for someone wanting broader scope');
  });
});
