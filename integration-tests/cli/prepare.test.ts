import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { prepareCommand } from '../../src/cli/commands/prepare.js';
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

vi.mock('../../src/core/logger/logger.js', async (importOriginal) => {
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
    '# Profile\n\nExperienced software engineer with TypeScript skills.',
  );
}

describe('CLI: prepare command', () => {
  let env: TestEnv;
  let restore: () => void;

  beforeEach(async () => {
    env = await createTestCampaign();
    restore = setupTestEnv(env.configHome, env.dataRoot);
    await createProfile(env.dataRoot);
    mockChatComplete.mockResolvedValue({
      content: JSON.stringify({
        topics: [
          {
            title: 'TypeScript',
            whatToKnow: ['Generics'],
            resources: ['TS handbook'],
            estimatedTime: '2h',
            depth: 2,
          },
        ],
        behavioral: [{ question: 'Tell me about yourself', answer: 'I am a developer' }],
        timeline: [{ daysBefore: 7, task: 'Review notes' }],
        checklist: ['Prepare resume'],
        notes: 'Focus on strengths',
      }),
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

  it('generates prep plan', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Prep App',
      company: 'PrepCo',
    });

    const { stdout, exitCode } = await runCommand(prepareCommand, ['prepare', slug]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Prep plan');
  });

  it('adds topic without LLM', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Topic App',
      company: 'TopicCo',
    });
    await writeFile(
      join(env.appliedDir, slug, 'prepare.md'),
      '<!-- jho:prepare -->\n\n# Prep plan\n\n## Topics\n\nExisting topic.',
    );

    const { stdout, exitCode } = await runCommand(prepareCommand, [
      'prepare',
      slug,
      '--add',
      'React hooks',
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Topic added');
  });

  it('show displays existing prep plan', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Show Prep',
      company: 'ShowPrepCo',
    });
    await writeFile(
      join(env.appliedDir, slug, 'prepare.md'),
      '# Prep plan\n\n## Topics\n\nExisting prep content.',
    );

    const { stdout, exitCode } = await runCommand(prepareCommand, ['prepare', 'show', slug]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Existing prep content');
  });
});
