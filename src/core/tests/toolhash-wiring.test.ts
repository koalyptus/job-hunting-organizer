import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeHash, readToolhash } from '../toolhash.js';
import { createApplication, updateApplication } from '../applications/applications.js';
import { addInterview, markInterviewStatus } from '../interviews/interviews.js';

vi.mock('../logger/logger.js', () => ({
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
      child: vi.fn(),
    })),
  })),
  moduleLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  })),
}));

vi.mock('../llm.js', () => ({
  defaultLlmConfig: vi.fn(() => ({})),
  chatComplete: vi.fn(async () => ({
    content: 'Mocked LLM response',
    model: 'test-model',
    durationMs: 100,
  })),
  extractJson: vi.fn((s: string) => {
    try {
      return JSON.parse(s);
    } catch {
      return {};
    }
  }),
}));

vi.mock('../prompts.js', () => ({
  loadPromptTemplate: vi.fn(async () => ({
    body: 'Test prompt template',
    temperature: 0.6,
  })),
}));

vi.mock('../profile.js', () => ({
  readProfile: vi.fn(async () => '# Profile\n\nExperienced engineer.'),
}));

vi.mock('../target-roles.js', () => ({
  parseTargetRoles: vi.fn(() => []),
}));

vi.mock('../jobs/extract.js', () => ({
  extractJdFromUrl: vi.fn(async () => ({
    title: 'Software Engineer',
    company: 'Test Corp',
    location: 'Remote',
    description: 'Test job description.',
    salary: '',
    tags: [],
  })),
  extractJdFromText: vi.fn(async () => ({
    title: 'Software Engineer',
    company: 'Test Corp',
    location: 'Remote',
    description: 'Test job description.',
    salary: '',
    tags: [],
  })),
}));

vi.mock('../jobs/suggest.js', () => ({
  suggestTargetRole: vi.fn(async () => ({
    roleSlug: '',
    confidence: 0,
    reasoning: 'No roles.',
  })),
}));

vi.mock('../retro/aggregate.js', () => ({
  aggregateRetros: vi.fn(async () => []),
}));

vi.mock('../generation-utils.js', () => ({
  extractJdContent: vi.fn((s: string) => s),
  isRefusal: vi.fn(() => false),
  countWords: vi.fn(() => 10),
}));

describe('toolhash wiring: applications.ts', () => {
  let workDir: string;
  let appliedDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-toolhash-wiring-app-'));
    appliedDir = join(workDir, 'applied');
    await mkdir(appliedDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('createApplication writes toolhash for meta.md', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Software Engineer',
      company: 'Test Corp',
      url: 'https://example.com/job/123',
      description: 'Test job.',
    });

    const metaPath = join(appliedDir, slug, 'meta.md');
    const metaContent = await readFile(metaPath, 'utf8');
    const expectedHash = computeHash(metaContent);
    const storedHash = await readToolhash(metaPath);

    expect(storedHash).toBe(expectedHash);
  });

  it('updateApplication writes toolhash for meta.md', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Software Engineer',
      company: 'Test Corp',
    });

    await updateApplication(appliedDir, slug, { status: 'interview' });

    const metaPath = join(appliedDir, slug, 'meta.md');
    const metaContent = await readFile(metaPath, 'utf8');
    const expectedHash = computeHash(metaContent);
    const storedHash = await readToolhash(metaPath);

    expect(storedHash).toBe(expectedHash);
  });
});

describe('toolhash wiring: interviews.ts', () => {
  let workDir: string;
  let appliedDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-toolhash-wiring-iv-'));
    appliedDir = join(workDir, 'applied');
    await mkdir(appliedDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('addInterview writes toolhash for interviews.md', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Software Engineer',
      company: 'Test Corp',
    });

    await addInterview(appliedDir, slug, {
      when: '2026-06-10 14:00',
      type: 'technical',
    });

    const interviewsPath = join(appliedDir, slug, 'interviews.md');
    const content = await readFile(interviewsPath, 'utf8');
    const expectedHash = computeHash(content);
    const storedHash = await readToolhash(interviewsPath);

    expect(storedHash).toBe(expectedHash);
  });

  it('markInterviewStatus writes toolhash for interviews.md', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Software Engineer',
      company: 'Test Corp',
    });

    await addInterview(appliedDir, slug, {
      when: '2026-06-10 14:00',
      type: 'technical',
    });

    await markInterviewStatus(appliedDir, slug, {
      sectionNumber: 1,
      status: 'completed',
    });

    const interviewsPath = join(appliedDir, slug, 'interviews.md');
    const content = await readFile(interviewsPath, 'utf8');
    const expectedHash = computeHash(content);
    const storedHash = await readToolhash(interviewsPath);

    expect(storedHash).toBe(expectedHash);
  });
});
