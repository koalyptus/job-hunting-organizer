import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { coverLetterCommand } from '../../src/cli/commands/cover-letter.js';
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
    '# Profile\n\n## Target roles\n\n### Senior Software Engineer [P1]\n- Level: Senior\n- Domain: Web\n- Stack: TypeScript\n- Work style: Remote\n- Compensation: $150k\n- Notes: Backend focus',
  );
}

describe('CLI: cover-letter command', () => {
  let env: TestEnv;
  let restore: () => void;

  beforeEach(async () => {
    env = await createTestCampaign();
    restore = setupTestEnv(env.configHome, env.dataRoot);
    await createProfile(env.dataRoot);
    mockChatComplete.mockResolvedValue({
      content: 'Dear Hiring Manager,\n\nI am excited to apply.\n\nBest regards',
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

  it('generates cover letter', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'CL App',
      company: 'CLCo',
    });

    const { stdout, exitCode } = await runCommand(coverLetterCommand, ['cover-letter', slug]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Dear Hiring Manager');
  });

  it('show displays existing cover letter', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Show CL',
      company: 'ShowCLCo',
    });
    await writeFile(
      join(env.appliedDir, slug, 'cover-letter.md'),
      '<!-- jho:cover-letter -->\n\nSaved cover letter content here.',
    );

    const { stdout, exitCode } = await runCommand(coverLetterCommand, [
      'cover-letter',
      'show',
      slug,
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Saved cover letter content');
  });
});
