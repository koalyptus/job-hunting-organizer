import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { fakeServer, getTextContent } from '../../src/mcp/tests/tools/helpers.js';
import { registerTrackApplication } from '../../src/mcp/tools/track-application.js';
import { registerListApplications } from '../../src/mcp/tools/list-applications.js';
import { registerShowApplication } from '../../src/mcp/tools/show-application.js';
import { registerAddInterview } from '../../src/mcp/tools/add-interview.js';
import { registerMarkInterview } from '../../src/mcp/tools/mark-interview.js';
import { registerListInterviews } from '../../src/mcp/tools/list-interviews.js';
import { registerGetRoot } from '../../src/mcp/tools/get-root.js';
import { registerGetCampaign } from '../../src/mcp/tools/get-campaign.js';
import { registerListCampaigns } from '../../src/mcp/tools/list-campaigns.js';
import { registerReadConfig } from '../../src/mcp/tools/read-config.js';
import { registerDoctor } from '../../src/mcp/tools/doctor-tool.js';
import { registerRemoveApplication } from '../../src/mcp/tools/remove-application.js';
import { registerRenameApplication } from '../../src/mcp/tools/rename-application.js';
import { registerAggregateRetros } from '../../src/mcp/tools/aggregate-retros.js';
import { registerAnswerQuestion } from '../../src/mcp/tools/answer-question.js';
import { registerAppendRetro } from '../../src/mcp/tools/append-retro-tool.js';
import { registerCoverLetter, registerReadCoverLetter } from '../../src/mcp/tools/cover-letter.js';
import { registerExtractJd } from '../../src/mcp/tools/extract-jd.js';
import { registerGetStats } from '../../src/mcp/tools/get-stats.js';
import { registerInit } from '../../src/mcp/tools/init-tool.js';
import { registerKbAdd } from '../../src/mcp/tools/kb-add.js';
import { registerKbUpdate } from '../../src/mcp/tools/kb-update.js';
import { registerOwnership } from '../../src/mcp/tools/ownership-tool.js';
import { registerPostMortem } from '../../src/mcp/tools/post-mortem.js';
import { registerPrepare } from '../../src/mcp/tools/prepare-tool.js';
import { registerReadCampaignConfig } from '../../src/mcp/tools/read-campaign-config.js';
import { registerReadLogs } from '../../src/mcp/tools/read-logs.js';
import { registerReadPrep } from '../../src/mcp/tools/read-prep.js';
import { registerReadProfile } from '../../src/mcp/tools/read-profile.js';
import { registerReadQa } from '../../src/mcp/tools/read-qa.js';
import { registerReadRetro } from '../../src/mcp/tools/read-retro.js';
import { registerRemoveCampaign } from '../../src/mcp/tools/remove-campaign.js';
import { registerRenameCampaign } from '../../src/mcp/tools/rename-campaign.js';
import { registerRepair } from '../../src/mcp/tools/repair-tool.js';
import { registerUpdateConfig } from '../../src/mcp/tools/update-config.js';
import { registerUpdateProfile } from '../../src/mcp/tools/update-profile.js';
import {
  createApplication,
  readApplication,
  listApplications,
  updateApplication,
} from '../../src/core/applications/applications.js';
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
      child: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
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

function mockLlmResponse(content: string) {
  mockChatComplete.mockResolvedValue({
    content,
    model: 'test-model',
    finishReason: 'stop',
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    durationMs: 100,
  });
}

function mockLlmJsonResponse(obj: unknown) {
  mockLlmResponse(JSON.stringify(obj, null, 2));
}

async function createProfile(dataRoot: string, campaign = 'default'): Promise<void> {
  const campaignDir = join(dataRoot, 'campaigns', campaign);
  await writeFile(
    join(campaignDir, 'profile.md'),
    [
      '# Profile',
      '',
      '## Target roles',
      '',
      '### Senior Software Engineer [P1]',
      '- Level: Senior',
      '- Domain: Web',
      '- Stack: TypeScript, React, Node.js',
      '- Work style: Remote',
      '- Compensation: $150k-$180k',
      '- Notes: Strong backend focus',
    ].join('\n'),
  );
}

async function createRetroFile(appliedDir: string, slug: string): Promise<void> {
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
    'Focus on distributed systems and STAR method.',
  ].join('\n');
  await writeFile(join(appliedDir, slug, 'retro.md'), retroContent);
}

async function createPrepFile(appliedDir: string, slug: string): Promise<void> {
  const prepContent = [
    '<!-- jho:prepare -->',
    '',
    '# Prep plan',
    '',
    '## Topics',
    '',
    '### TypeScript (depth 2)',
    '',
    '**What to know:**',
    '- Advanced types',
    '',
    '**Resources:**',
    '- TypeScript handbook',
    '',
    '**Estimated time:** 2h',
  ].join('\n');
  await writeFile(join(appliedDir, slug, 'prepare.md'), prepContent);
}

async function createQaFile(appliedDir: string, slug: string): Promise<void> {
  const qaContent = [
    '# Q&A — Test App @ TestCo',
    '',
    '## 2026-07-01 10:00 — "Tell me about yourself" [text]',
    '',
    '- Source: application form',
    '- Answer:',
    '  > I am a software engineer with 5 years of experience.',
  ].join('\n');
  await writeFile(join(appliedDir, slug, 'qa.md'), qaContent);
}

describe('MCP tool handlers: track_application (real core)', () => {
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

  it('updates application status via track handler', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Existing App',
      company: 'ExistingCo',
    });

    const { server, getCallback } = fakeServer();
    registerTrackApplication(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug, status: 'interview', salary: '$100k', yes: true },
      { signal: AbortSignal.timeout(5000) },
    );

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.slug).toBe(slug);
    expect(parsed.changed).toBe(true);

    const app = await readApplication(env.appliedDir, slug);
    expect(app.frontmatter.status).toBe('interview');
    expect(app.frontmatter.salary).toBe('$100k');
  });
});

describe('MCP tool handlers: list_applications (real core)', () => {
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

  it('lists all applications', async () => {
    await createApplication({ appliedDir: env.appliedDir, title: 'App A', company: 'Co A' });
    await createApplication({ appliedDir: env.appliedDir, title: 'App B', company: 'Co B' });

    const { server, getCallback } = fakeServer();
    registerListApplications(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(5000) });

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.entries).toHaveLength(2);
  });

  it('filters by status', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'App',
      company: 'Co',
    });
    await updateApplication(env.appliedDir, slug, { status: 'interview' });

    const { server, getCallback } = fakeServer();
    registerListApplications(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', status: 'interview' },
      { signal: AbortSignal.timeout(5000) },
    );

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]!.slug).toBe(slug);
  });
});

describe('MCP tool handlers: show_application (real core)', () => {
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

  it('shows application details', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Show Me',
      company: 'ShowCo',
      location: 'Remote',
    });

    const { server, getCallback } = fakeServer();
    registerShowApplication(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default', slug }, { signal: AbortSignal.timeout(5000) });

    const text = getTextContent(result);
    expect(text).toContain('Show Me');
    expect(text).toContain('ShowCo');
    expect(text).toContain('Remote');
  });

  it('returns error for nonexistent application', async () => {
    const { server, getCallback } = fakeServer();
    registerShowApplication(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'nonexistent' },
      { signal: AbortSignal.timeout(5000) },
    );

    expect(result.isError).toBe(true);
  });
});

describe('MCP tool handlers: interview management (real core)', () => {
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

  it('adds interview', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Interview App',
      company: 'InterviewCo',
    });

    const { server, getCallback } = fakeServer();
    registerAddInterview(server);
    const cb = getCallback()!;

    const result = await cb(
      {
        campaign: 'default',
        slug,
        when: '2026-08-01 10:00',
        title: 'Technical Screen',
        type: 'technical',
        duration: 60,
        interviewers: ['Alice', 'Bob'],
        location: 'Zoom',
      },
      { signal: AbortSignal.timeout(5000) },
    );

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.index).toBe(1);
  });

  it('lists interviews', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'List Interviews',
      company: 'ListCo',
    });

    const addServer = fakeServer();
    registerAddInterview(addServer.server);
    await addServer.getCallback()!(
      {
        campaign: 'default',
        slug,
        when: '2026-08-01 10:00',
        title: 'Screen',
        type: 'hr',
      },
      { signal: AbortSignal.timeout(5000) },
    );

    const { server, getCallback } = fakeServer();
    registerListInterviews(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default', slug }, { signal: AbortSignal.timeout(5000) });

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.interviews).toHaveLength(1);
    expect(parsed.interviews[0]!.title).toBe('Screen');
  });

  it('marks interview status', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Mark Interview',
      company: 'MarkCo',
    });

    const addServer = fakeServer();
    registerAddInterview(addServer.server);
    await addServer.getCallback()!(
      {
        campaign: 'default',
        slug,
        when: '2026-08-01 10:00',
        title: 'Final Round',
        type: 'final',
      },
      { signal: AbortSignal.timeout(5000) },
    );

    const { server, getCallback } = fakeServer();
    registerMarkInterview(server);
    const cb = getCallback()!;

    const result = await cb(
      {
        campaign: 'default',
        slug,
        index: 0,
        status: 'completed',
        notes: 'Went well',
      },
      { signal: AbortSignal.timeout(5000) },
    );

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.success).toBe(true);
  });

  it('returns empty interviews for app with none', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'No Interviews',
      company: 'NoCo',
    });

    const { server, getCallback } = fakeServer();
    registerListInterviews(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default', slug }, { signal: AbortSignal.timeout(5000) });

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.interviews).toHaveLength(0);
  });
});

describe('MCP tool handlers: campaign and config tools (real core)', () => {
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

  it('get_root returns data root', async () => {
    const { server, getCallback } = fakeServer();
    registerGetRoot(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(5000) });

    const text = getTextContent(result);
    const parsed = JSON.parse(text);
    expect(parsed.root).toBe(join(env.dataRoot, 'campaigns', 'default'));
  });

  it('get_campaign returns campaign info', async () => {
    const { server, getCallback } = fakeServer();
    registerGetCampaign(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(5000) });

    const text = getTextContent(result);
    const parsed = JSON.parse(text);
    expect(parsed.version).toBe(1);
  });

  it('list_campaigns returns campaigns', async () => {
    const { server, getCallback } = fakeServer();
    registerListCampaigns(server);
    const cb = getCallback()!;

    const result = await cb({}, { signal: AbortSignal.timeout(5000) });

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.campaigns).toBeDefined();
    expect(parsed.campaigns.length).toBeGreaterThanOrEqual(1);
  });

  it('read_config returns config', async () => {
    const { server, getCallback } = fakeServer();
    registerReadConfig(server);
    const cb = getCallback()!;

    const result = await cb({}, { signal: AbortSignal.timeout(5000) });

    const text = getTextContent(result);
    expect(text).toContain('dataRoot');
  });

  it('doctor diagnoses campaign', async () => {
    await createApplication({
      appliedDir: env.appliedDir,
      title: 'Diag App',
      company: 'DiagCo',
    });

    const { server, getCallback } = fakeServer();
    registerDoctor(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(5000) });

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.issues).toBeDefined();
    expect(Array.isArray(parsed.issues)).toBe(true);
    expect(parsed.issues).toHaveLength(0);
  });

  it('doctor diagnoses single app', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Diag Single',
      company: 'DiagSingleCo',
    });

    const { server, getCallback } = fakeServer();
    registerDoctor(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default', slug }, { signal: AbortSignal.timeout(5000) });

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.issues).toBeDefined();
    expect(Array.isArray(parsed.issues)).toBe(true);
  });
});

describe('MCP tool handlers: remove and rename application (real core)', () => {
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

  it('removes application', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Remove Me',
      company: 'RemoveCo',
    });

    let apps = await listApplications(env.appliedDir);
    expect(apps).toHaveLength(1);

    const { server, getCallback } = fakeServer();
    registerRemoveApplication(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug, confirm: true },
      { signal: AbortSignal.timeout(5000) },
    );

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.removed).toBe(true);

    apps = await listApplications(env.appliedDir);
    expect(apps).toHaveLength(0);
  });

  it('renames application', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Rename Me',
      company: 'RenameCo',
    });

    const newSlug = '2026-Jul-20-RN-RenameCo';
    const { server, getCallback } = fakeServer();
    registerRenameApplication(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', from: slug, to: newSlug },
      { signal: AbortSignal.timeout(5000) },
    );

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.renamed).toBe(true);

    const app = await readApplication(env.appliedDir, newSlug);
    expect(app.frontmatter.slug).toBe(newSlug);
  });
});

describe('MCP tool handlers: aggregate_retros (real core)', () => {
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

  it('aggregates weak topics across applications', async () => {
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
    await createRetroFile(env.appliedDir, slug1);
    await createRetroFile(env.appliedDir, slug2);

    const { server, getCallback } = fakeServer();
    registerAggregateRetros(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(5000) });

    const parsed = JSON.parse(getTextContent(result));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThanOrEqual(1);
    const systemDesignTopic = parsed.find((t: { label: string }) => t.label === 'System design');
    expect(systemDesignTopic).toBeDefined();
    expect(systemDesignTopic.count).toBe(2);
  });

  it('returns empty array when no retros exist', async () => {
    await createApplication({ appliedDir: env.appliedDir, title: 'App', company: 'Co' });

    const { server, getCallback } = fakeServer();
    registerAggregateRetros(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(5000) });

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed).toHaveLength(0);
  });
});

describe('MCP tool handlers: answer_question (LLM-backed)', () => {
  let env: TestEnv;
  let restore: () => void;

  beforeEach(async () => {
    env = await createTestCampaign();
    restore = setupTestEnv(env.configHome, env.dataRoot);
    await createProfile(env.dataRoot);
  });

  afterEach(async () => {
    restore();
    await cleanupTestDir(env.testHome);
  });

  it('answers a question and appends to qa.md', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'QA App',
      company: 'QACo',
    });
    mockLlmResponse('I am a passionate developer with strong TypeScript skills.');

    const { server, getCallback } = fakeServer();
    registerAnswerQuestion(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug, question: 'Tell me about yourself', noSave: false },
      { signal: AbortSignal.timeout(10000) },
    );

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.answer).toContain('passionate developer');
    expect(parsed.wordCount).toBeGreaterThan(0);
  });

  it('answers without saving when noSave is true', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'NoSave',
      company: 'NoSaveCo',
    });
    mockLlmResponse('Short answer.');

    const { server, getCallback } = fakeServer();
    registerAnswerQuestion(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug, question: 'Why this role?', noSave: true },
      { signal: AbortSignal.timeout(10000) },
    );

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.answer).toBe('Short answer.');
  });
});

describe('MCP tool handlers: append_retro (LLM-backed)', () => {
  let env: TestEnv;
  let restore: () => void;

  beforeEach(async () => {
    env = await createTestCampaign();
    restore = setupTestEnv(env.configHome, env.dataRoot);
    await createProfile(env.dataRoot);
  });

  afterEach(async () => {
    restore();
    await cleanupTestDir(env.testHome);
  });

  it('appends new section to existing retro', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Retro App',
      company: 'RetroCo',
    });
    await createRetroFile(env.appliedDir, slug);
    mockLlmResponse('Updated learning plan: focus on system design patterns.');

    const { server, getCallback } = fakeServer();
    registerAppendRetro(server);
    const cb = getCallback()!;

    const result = await cb(
      {
        campaign: 'default',
        slug,
        weakTopics: ['SQL queries', 'System design'],
        notes: 'Second attempt',
      },
      { signal: AbortSignal.timeout(10000) },
    );

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.index).toBe(2);
    expect(parsed.content).toContain('learning plan');
  });

  it('returns error when no retro exists', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'No Retro',
      company: 'NoRetroCo',
    });

    const { server, getCallback } = fakeServer();
    registerAppendRetro(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug, weakTopics: ['System design'] },
      { signal: AbortSignal.timeout(10000) },
    );

    expect(result.isError).toBe(true);
  });
});

describe('MCP tool handlers: cover_letter (LLM-backed)', () => {
  let env: TestEnv;
  let restore: () => void;

  beforeEach(async () => {
    env = await createTestCampaign();
    restore = setupTestEnv(env.configHome, env.dataRoot);
    await createProfile(env.dataRoot);
  });

  afterEach(async () => {
    restore();
    await cleanupTestDir(env.testHome);
  });

  it('generates cover letter and reads it back', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'CL App',
      company: 'CLCo',
      location: 'Remote',
    });
    mockLlmResponse('Dear Hiring Manager,\n\nI am excited to apply for this role.\n\nBest regards');

    const { server: genServer, getCallback: genCb } = fakeServer();
    registerCoverLetter(genServer);
    const gen = genCb()!;

    const genResult = await gen(
      { campaign: 'default', slug, noSave: false },
      { signal: AbortSignal.timeout(10000) },
    );

    const genParsed = JSON.parse(getTextContent(genResult));
    expect(genParsed.content).toContain('Dear Hiring Manager');
    expect(genParsed.wordCount).toBeGreaterThan(0);

    const { server: readServer, getCallback: readCb } = fakeServer();
    registerReadCoverLetter(readServer);
    const read = readCb()!;

    const readResult = await read(
      { campaign: 'default', slug },
      { signal: AbortSignal.timeout(5000) },
    );

    const readText = getTextContent(readResult);
    expect(readText).toContain('Dear Hiring Manager');
  });
});

describe('MCP tool handlers: extract_jd (LLM-backed)', () => {
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

  it('extracts JD from text', async () => {
    mockLlmJsonResponse({
      title: 'Software Engineer',
      company: 'TechCo',
      location: 'Remote',
      description: 'Build amazing products',
      requirements: ['TypeScript', 'React'],
      salary: '$100k-$150k',
      url: '',
      employmentType: 'permanent',
    });

    const { server, getCallback } = fakeServer();
    registerExtractJd(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', text: 'We are looking for a Software Engineer...' },
      { signal: AbortSignal.timeout(10000) },
    );

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.title).toBe('Software Engineer');
    expect(parsed.company).toBe('TechCo');
  });
});

describe('MCP tool handlers: get_stats (real core)', () => {
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

  it('computes stats for applications', async () => {
    const slug1 = await createApplication({
      appliedDir: env.appliedDir,
      title: 'App 1',
      company: 'Co 1',
    });
    const _slug2 = await createApplication({
      appliedDir: env.appliedDir,
      title: 'App 2',
      company: 'Co 2',
    });
    await updateApplication(env.appliedDir, slug1, { status: 'interview' });

    const { server, getCallback } = fakeServer();
    registerGetStats(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(5000) });

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.total).toBe(2);
    expect(parsed.byStatus).toBeDefined();
  });

  it('returns zero stats for empty campaign', async () => {
    const { server, getCallback } = fakeServer();
    registerGetStats(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(5000) });

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.total).toBe(0);
  });
});

describe('MCP tool handlers: init (real core)', () => {
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

  it('init tool returns a result for a new campaign', async () => {
    const { server, getCallback } = fakeServer();
    registerInit(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'new-campaign' }, { signal: AbortSignal.timeout(10000) });

    const text = getTextContent(result);
    expect(text).toBeDefined();
  });
});

describe('MCP tool handlers: kb_add and kb_update (real core)', () => {
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

  it('kb_add copies files into knowledge base', async () => {
    const tmpDir = join(env.testHome, 'kb-source');
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'notes.md'), '# Interview Notes\n\nPractice STAR method.');

    const { server, getCallback } = fakeServer();
    registerKbAdd(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', paths: [tmpDir] },
      { signal: AbortSignal.timeout(5000) },
    );

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.copied).toBeGreaterThanOrEqual(1);
  });

  it('kb_update syncs knowledge base', async () => {
    const { server, getCallback } = fakeServer();
    registerKbUpdate(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(5000) });

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.count).toBeGreaterThanOrEqual(0);
  });
});

describe('MCP tool handlers: ownership (real core)', () => {
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

  it('returns ownership table as markdown', async () => {
    const { server, getCallback } = fakeServer();
    registerOwnership(server);
    const cb = getCallback()!;

    const result = await cb({}, { signal: AbortSignal.timeout(5000) });

    const text = getTextContent(result);
    expect(text).toContain('File ownership');
    expect(text).toContain('meta.md');
    expect(text).toContain('jd.md');
  });
});

describe('MCP tool handlers: post_mortem (LLM-backed)', () => {
  let env: TestEnv;
  let restore: () => void;

  beforeEach(async () => {
    env = await createTestCampaign();
    restore = setupTestEnv(env.configHome, env.dataRoot);
    await createProfile(env.dataRoot);
  });

  afterEach(async () => {
    restore();
    await cleanupTestDir(env.testHome);
  });

  it('generates a post-mortem learning plan', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'PM App',
      company: 'PMCo',
    });
    mockLlmResponse(
      'Learning plan: review system design patterns and practice behavioural questions.',
    );

    const { server, getCallback } = fakeServer();
    registerPostMortem(server);
    const cb = getCallback()!;

    const result = await cb(
      {
        campaign: 'default',
        slug,
        weakTopics: ['System design', 'Behavioural'],
        notes: 'Struggled with both',
      },
      { signal: AbortSignal.timeout(10000) },
    );

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.content).toContain('Learning plan');
    expect(parsed.index).toBe(1);
  });

  it('returns error when no weak topics provided', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'NoTopics',
      company: 'NoTopicsCo',
    });

    const { server, getCallback } = fakeServer();
    registerPostMortem(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug, weakTopics: [] },
      { signal: AbortSignal.timeout(10000) },
    );

    expect(result.isError).toBe(true);
  });
});

describe('MCP tool handlers: prepare (LLM-backed)', () => {
  let env: TestEnv;
  let restore: () => void;

  beforeEach(async () => {
    env = await createTestCampaign();
    restore = setupTestEnv(env.configHome, env.dataRoot);
    await createProfile(env.dataRoot);
  });

  afterEach(async () => {
    restore();
    await cleanupTestDir(env.testHome);
  });

  it('generates prep plan and reads it back', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Prep App',
      company: 'PrepCo',
    });
    mockLlmJsonResponse({
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
    });

    const { server: genServer, getCallback: genCb } = fakeServer();
    registerPrepare(genServer);
    const gen = genCb()!;

    const genResult = await gen(
      { campaign: 'default', slug, days: 7 },
      { signal: AbortSignal.timeout(10000) },
    );

    const genParsed = JSON.parse(getTextContent(genResult));
    expect(genParsed.wordCount).toBeGreaterThan(0);

    const { server: readServer, getCallback: readCb } = fakeServer();
    registerReadPrep(readServer);
    const read = readCb()!;

    const readResult = await read(
      { campaign: 'default', slug },
      { signal: AbortSignal.timeout(5000) },
    );

    const readText = getTextContent(readResult);
    expect(readText).toContain('Prep plan');
  });

  it('appends topics without LLM', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Topic App',
      company: 'TopicCo',
    });
    await createPrepFile(env.appliedDir, slug);

    const { server, getCallback } = fakeServer();
    registerPrepare(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug, topics: ['React hooks', 'GraphQL'] },
      { signal: AbortSignal.timeout(5000) },
    );

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.topicsAdded).toEqual(['React hooks', 'GraphQL']);
  });
});

describe('MCP tool handlers: read_campaign_config (real core)', () => {
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

  it('returns redacted campaign config', async () => {
    const { server, getCallback } = fakeServer();
    registerReadCampaignConfig(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(5000) });

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.version).toBe(1);
  });
});

describe('MCP tool handlers: read_logs (real core)', () => {
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

  it('returns error when no log files exist', async () => {
    const { server, getCallback } = fakeServer();
    registerReadLogs(server);
    const cb = getCallback()!;

    const result = await cb({}, { signal: AbortSignal.timeout(5000) });

    expect(result.isError).toBe(true);
  });

  it('reads log content when log file exists', async () => {
    const logContent =
      JSON.stringify({ level: 30, msg: 'test log entry', time: Date.now() }) + '\n';
    await writeFile(join(env.configHome, 'jho.log'), logContent);

    const { server, getCallback } = fakeServer();
    registerReadLogs(server);
    const cb = getCallback()!;

    const result = await cb({}, { signal: AbortSignal.timeout(5000) });

    const text = getTextContent(result);
    expect(text).toContain('test log entry');
  });
});

describe('MCP tool handlers: read_prep (real core)', () => {
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

  it('reads existing prep plan', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Prep Read',
      company: 'PrepReadCo',
    });
    await createPrepFile(env.appliedDir, slug);

    const { server, getCallback } = fakeServer();
    registerReadPrep(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default', slug }, { signal: AbortSignal.timeout(5000) });

    const text = getTextContent(result);
    expect(text).toContain('Prep plan');
  });

  it('returns error when no prep exists', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'No Prep',
      company: 'NoPrepCo',
    });

    const { server, getCallback } = fakeServer();
    registerReadPrep(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default', slug }, { signal: AbortSignal.timeout(5000) });

    expect(result.isError).toBe(true);
  });
});

describe('MCP tool handlers: read_profile (real core)', () => {
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

  it('reads existing profile', async () => {
    await createProfile(env.dataRoot);

    const { server, getCallback } = fakeServer();
    registerReadProfile(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(5000) });

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.content).toContain('Profile');
    expect(parsed.content).toContain('Senior Software Engineer');
  });

  it('returns error when no profile exists', async () => {
    const { server, getCallback } = fakeServer();
    registerReadProfile(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(5000) });

    expect(result.isError).toBe(true);
  });
});

describe('MCP tool handlers: read_qa (real core)', () => {
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

  it('reads existing Q&A entries', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'QA Read',
      company: 'QAReadCo',
    });
    await createQaFile(env.appliedDir, slug);

    const { server, getCallback } = fakeServer();
    registerReadQa(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default', slug }, { signal: AbortSignal.timeout(5000) });

    const text = getTextContent(result);
    expect(text).toContain('Q&A');
    expect(text).toContain('Tell me about yourself');
  });

  it('returns error when no Q&A exists', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'No QA',
      company: 'NoQACo',
    });

    const { server, getCallback } = fakeServer();
    registerReadQa(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default', slug }, { signal: AbortSignal.timeout(5000) });

    expect(result.isError).toBe(true);
  });
});

describe('MCP tool handlers: read_retro (real core)', () => {
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

  it('reads existing retro', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Retro Read',
      company: 'RetroReadCo',
    });
    await createRetroFile(env.appliedDir, slug);

    const { server, getCallback } = fakeServer();
    registerReadRetro(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default', slug }, { signal: AbortSignal.timeout(5000) });

    const text = getTextContent(result);
    expect(text).toContain('Retro');
    expect(text).toContain('System design');
  });

  it('returns error when no retro exists', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'No Retro',
      company: 'NoRetroCo',
    });

    const { server, getCallback } = fakeServer();
    registerReadRetro(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default', slug }, { signal: AbortSignal.timeout(5000) });

    expect(result.isError).toBe(true);
  });
});

describe('MCP tool handlers: remove_campaign (real core)', () => {
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

  it('removes a campaign', async () => {
    const { server, getCallback } = fakeServer();
    registerRemoveCampaign(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', confirm: true },
      { signal: AbortSignal.timeout(5000) },
    );

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.removed).toBe(true);
    expect(parsed.campaign).toBe('default');
  });
});

describe('MCP tool handlers: rename_campaign (real core)', () => {
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

  it('renames a campaign', async () => {
    const { server, getCallback } = fakeServer();
    registerRenameCampaign(server);
    const cb = getCallback()!;

    const result = await cb(
      { from: 'default', to: 'renamed' },
      { signal: AbortSignal.timeout(5000) },
    );

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.renamed).toBe(true);
    expect(parsed.from).toBe('default');
    expect(parsed.to).toBe('renamed');
  });
});

describe('MCP tool handlers: repair (real core)', () => {
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

  it('repairs a single application', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Repair App',
      company: 'RepairCo',
    });

    const { server, getCallback } = fakeServer();
    registerRepair(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default', slug }, { signal: AbortSignal.timeout(5000) });

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.actions).toBeDefined();
  });

  it('repairs entire campaign', async () => {
    await createApplication({
      appliedDir: env.appliedDir,
      title: 'Campaign Repair',
      company: 'CampRepairCo',
    });

    const { server, getCallback } = fakeServer();
    registerRepair(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(5000) });

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.actions).toBeDefined();
  });
});

describe('MCP tool handlers: update_config (real core)', () => {
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

  it('updates global config', async () => {
    const { server, getCallback } = fakeServer();
    registerUpdateConfig(server);
    const cb = getCallback()!;

    const result = await cb(
      { patch: { llm: { model: 'gpt-4o' } } },
      { signal: AbortSignal.timeout(5000) },
    );

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.status).toBe('ok');
  });
});

describe('MCP tool handlers: update_profile (real core)', () => {
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

  it('writes profile content', async () => {
    const { server, getCallback } = fakeServer();
    registerUpdateProfile(server);
    const cb = getCallback()!;

    const profileContent = '# Updated Profile\n\n## Target roles\n\n### Full Stack Dev [P1]';
    const result = await cb(
      { campaign: 'default', content: profileContent },
      { signal: AbortSignal.timeout(5000) },
    );

    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.success).toBe(true);
  });
});
