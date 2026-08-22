import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { trackCommand } from '../../src/cli/commands/track.js';
import {
  createApplication,
  readApplication,
} from '../../src/workflow/applications/applications.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

// track tests seed mock data in the factory rather than via mockChatComplete
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

describe('CLI: track command', () => {
  let env: TestEnv;
  let restore: () => void;

  beforeEach(async () => {
    env = await createTestCampaign();
    restore = setupTestEnv(env.configHome, env.dataRoot);
  });

  afterEach(async () => {
    restore();
    await cleanupTestDir(env.testHome);
  });

  it('track update changes application status', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Track App',
      company: 'TrackCo',
    });

    const { exitCode } = await runCommand(trackCommand, [
      'track',
      slug,
      '--status',
      'interview',
      '--yes',
    ]);

    expect(exitCode).toBe(0);
    const app = await readApplication(env.appliedDir, slug);
    expect(app.frontmatter.status).toBe('interview');
  });

  it('track update with salary', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Salary App',
      company: 'SalaryCo',
    });

    const { exitCode } = await runCommand(trackCommand, [
      'track',
      slug,
      '--salary',
      '$120k-$150k',
      '--yes',
    ]);

    expect(exitCode).toBe(0);
    const app = await readApplication(env.appliedDir, slug);
    expect(app.frontmatter.salary).toBe('$120k-$150k');
  });

  it('track update with tags', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Tag App',
      company: 'TagCo',
    });

    const { exitCode } = await runCommand(trackCommand, [
      'track',
      slug,
      '--tag',
      'urgent',
      '--tag',
      'remote',
      '--yes',
    ]);

    expect(exitCode).toBe(0);
    const app = await readApplication(env.appliedDir, slug);
    expect(app.frontmatter.tags).toContain('urgent');
    expect(app.frontmatter.tags).toContain('remote');
  });

  it('track with no changes reports no changes', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'No Changes',
      company: 'NoChangesCo',
    });

    const { stdout, exitCode } = await runCommand(trackCommand, ['track', slug]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('No changes');
  });
});
