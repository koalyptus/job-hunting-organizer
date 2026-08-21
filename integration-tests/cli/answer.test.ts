import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { answerCommand } from '../../src/cli/commands/answer.js';
import { createApplication } from '../../src/workflow/applications/applications.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

const mockChatComplete = vi.hoisted(() => vi.fn());

vi.mock('../../src/core/llm.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    chatComplete: mockChatComplete,
    defaultLlmConfig: vi.fn(() => ({
      baseUrl: 'https://api.test.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      timeoutMs: 300_000,
    })),
  };
});

vi.mock('../../src/core/prompts.js', () => ({
  loadPromptTemplate: vi.fn(async () => ({
    body: 'You are a job-hunting coach.',
    temperature: 0.6,
  })),
  loadPromptTemplateWithVoice: vi.fn(async () => ({
    body: 'You are a job-hunting coach.',
    temperature: 0.6,
  })),
}));

vi.mock('../../src/lib/logger/logger.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getRootLogger: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      flush: vi.fn(),
      child: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        flush: vi.fn(),
      })),
    })),
    moduleLogger: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    })),
    childLogger: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  };
});

async function createProfile(dataRoot: string, campaign = 'default'): Promise<void> {
  const campaignDir = join(dataRoot, 'campaigns', campaign);
  await writeFile(
    join(campaignDir, 'profile.md'),
    '# Profile\n\nExperienced software engineer with 5 years in TypeScript.',
  );
}

describe('CLI: answer command', () => {
  let env: TestEnv;
  let restore: () => void;

  beforeEach(async () => {
    env = await createTestCampaign();
    restore = setupTestEnv(env.configHome, env.dataRoot);
    await createProfile(env.dataRoot);
    mockChatComplete.mockResolvedValue({
      content: 'I am a passionate developer with strong skills.',
      model: 'test-model',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 100,
    });
  });

  afterEach(async () => {
    restore();
    await cleanupTestDir(env.testHome);
  });

  it('answers a question', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Answer App',
      company: 'AnswerCo',
    });

    const { stdout, exitCode } = await runCommand(answerCommand, [
      'answer',
      slug,
      'Tell me about yourself',
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('passionate developer');
  });

  it('show displays existing Q&A', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Show QA',
      company: 'ShowQACo',
    });
    await writeFile(
      join(env.appliedDir, slug, 'qa.md'),
      '# Q&A — Show QA @ ShowQACo\n\n## Previous answer entry',
    );

    const { stdout, exitCode } = await runCommand(answerCommand, ['answer', 'show', slug]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Previous answer entry');
  });
});
