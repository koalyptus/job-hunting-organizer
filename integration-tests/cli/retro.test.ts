import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { retroCommand } from '../../src/cli/commands/retro.js';
import { createApplication } from '../../src/core/applications/applications.js';
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
  await writeFile(join(campaignDir, 'profile.md'), '# Profile\n\nExperienced software engineer.');
}

const retroContent = [
  '<!-- jho:retro -->',
  '',
  '# Retro — Test App @ TestCo',
  '',
  '## Retro for interview: 2026-07-01 — Interview #1 [rejected]',
  '',
  '- Date: 2026-07-01',
  '- Interview id: 1',
  '- Status at the time: rejected',
  '',
  '### Weak topics',
  '',
  '- System design',
  '- Behavioural answers',
  '',
  '### Other notes',
  '',
  'Need to practice more.',
  '',
  '### Learning plan',
  '',
  'Focus on distributed systems.',
].join('\n');

describe('CLI: retro command', () => {
  let env: TestEnv;
  let restore: () => void;

  beforeEach(async () => {
    env = await createTestCampaign();
    restore = setupTestEnv(env.configHome, env.dataRoot);
    await createProfile(env.dataRoot);
    mockChatComplete.mockResolvedValue({
      content: 'Updated learning plan: review system design patterns.',
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

  it('generates retro with --weak-topics', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Retro App',
      company: 'RetroCo',
    });

    const { stdout, exitCode } = await runCommand(retroCommand, [
      'retro',
      slug,
      '--weak-topics',
      'System design, SQL',
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Retro saved');
  });

  it('show displays existing retro', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Show Retro',
      company: 'ShowRetroCo',
    });
    await writeFile(join(env.appliedDir, slug, 'retro.md'), retroContent);

    const { stdout, exitCode } = await runCommand(retroCommand, ['retro', 'show', slug]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('System design');
  });

  it('aggregate shows recurring weak topics', async () => {
    const slug1 = await createApplication({
      appliedDir: env.appliedDir,
      title: 'App A',
      company: 'Co A',
    });
    const slug2 = await createApplication({
      appliedDir: env.appliedDir,
      title: 'App B',
      company: 'Co B',
    });
    await writeFile(join(env.appliedDir, slug1, 'retro.md'), retroContent);
    await writeFile(join(env.appliedDir, slug2, 'retro.md'), retroContent);

    const { stdout, exitCode } = await runCommand(retroCommand, ['retro', 'aggregate']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('System design');
  });
});
