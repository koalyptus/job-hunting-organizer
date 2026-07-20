import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeHash, readToolhash } from '../toolhash.js';
import { createApplication, updateApplication } from '../applications/applications.js';
import { chatComplete } from '../llm.js';
import { startRetro, appendRetro } from '../retro/index.js';
import {
  addInterview,
  markInterviewStatus,
  appendInterviewNotes,
} from '../interviews/interviews.js';
import { generateCoverLetter } from '../applications/cover-letter.js';
import { generatePrep, appendTopic } from '../prepare/prepare.js';

vi.mock('../config.js', () => ({
  getConfig: vi.fn(() => ({
    global: { llm: { baseUrl: 'http://test', apiKey: 'key', model: 'model' } },
  })),
}));

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
    content: JSON.stringify({
      topics: [
        {
          title: 'System Design',
          whatToKnow: ['Scalability patterns'],
          resources: ['https://example.com'],
          estimatedTime: '2h',
          depth: 2,
        },
      ],
      behavioral: [{ question: 'Tell me about yourself', answer: 'Use STAR method' }],
      timeline: [{ daysBefore: 3, task: 'Review notes' }],
      checklist: ['Prepare questions'],
      notes: 'Focus on distributed systems',
    }),
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

vi.mock('../campaign/profile-read.js', () => ({
  readProfile: vi.fn(async () => '# Profile\n\nExperienced engineer.'),
}));

vi.mock('../target-roles.js', () => ({
  extractTargetRoles: vi.fn(() => []),
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

  it('appendInterviewNotes writes toolhash for interviews.md', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Software Engineer',
      company: 'Test Corp',
    });

    await addInterview(appliedDir, slug, {
      when: '2026-06-10 14:00',
      type: 'technical',
    });

    await appendInterviewNotes(appliedDir, slug, {
      sectionNumber: 1,
      notes: 'Candidate was well-prepared.',
    });

    const interviewsPath = join(appliedDir, slug, 'interviews.md');
    const content = await readFile(interviewsPath, 'utf8');
    const expectedHash = computeHash(content);
    const storedHash = await readToolhash(interviewsPath);

    expect(storedHash).toBe(expectedHash);
  });
});

describe('toolhash wiring: cover-letter.ts', () => {
  let workDir: string;
  let appliedDir: string;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoData = process.env['JHO_DATA'];
    workDir = await mkdtemp(join(tmpdir(), 'jho-toolhash-wiring-cl-'));
    process.env['JHO_DATA'] = workDir;
    appliedDir = join(workDir, 'campaigns', 'default', 'applied');
    await mkdir(appliedDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
    if (originalJhoData) {
      process.env['JHO_DATA'] = originalJhoData;
    } else {
      delete process.env['JHO_DATA'];
    }
  });

  it('generateCoverLetter writes toolhash for cover-letter.md', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Software Engineer',
      company: 'Test Corp',
      url: 'https://example.com/job/123',
      description: 'Test job.',
    });

    await generateCoverLetter({
      slug,
      campaign: 'default',
      noSave: false,
    });

    const coverLetterPath = join(appliedDir, slug, 'cover-letter.md');
    const content = await readFile(coverLetterPath, 'utf8');
    const expectedHash = computeHash(content);
    const storedHash = await readToolhash(coverLetterPath);

    expect(storedHash).toBe(expectedHash);
  });
});

describe('toolhash wiring: prepare.ts', () => {
  let workDir: string;
  let appliedDir: string;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoData = process.env['JHO_DATA'];
    workDir = await mkdtemp(join(tmpdir(), 'jho-toolhash-wiring-prep-'));
    process.env['JHO_DATA'] = workDir;
    appliedDir = join(workDir, 'campaigns', 'default', 'applied');
    await mkdir(appliedDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
    if (originalJhoData) {
      process.env['JHO_DATA'] = originalJhoData;
    } else {
      delete process.env['JHO_DATA'];
    }
  });

  it('generatePrep writes toolhash for prepare.md', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Software Engineer',
      company: 'Test Corp',
      url: 'https://example.com/job/123',
      description: 'Test job.',
    });

    await generatePrep({
      slug,
      campaign: 'default',
    });

    const prepPath = join(appliedDir, slug, 'prepare.md');
    const content = await readFile(prepPath, 'utf8');
    const expectedHash = computeHash(content);
    const storedHash = await readToolhash(prepPath);

    expect(storedHash).toBe(expectedHash);
  });

  it('appendTopic writes toolhash for prepare.md', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Software Engineer',
      company: 'Test Corp',
    });

    // Generate a prep plan first so prepare.md exists
    await generatePrep({
      slug,
      campaign: 'default',
    });

    await appendTopic('default', slug, 'System design review');

    const prepPath = join(appliedDir, slug, 'prepare.md');
    const content = await readFile(prepPath, 'utf8');
    const expectedHash = computeHash(content);
    const storedHash = await readToolhash(prepPath);

    expect(storedHash).toBe(expectedHash);
  });
});

describe('toolhash wiring: retro.ts', () => {
  let workDir: string;
  let appliedDir: string;
  let campaignRoot: string;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoData = process.env['JHO_DATA'];
    workDir = await mkdtemp(join(tmpdir(), 'jho-toolhash-wiring-retro-'));
    process.env['JHO_DATA'] = workDir;
    campaignRoot = join(workDir, 'campaigns', 'default');
    appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });

    // Write profile.md at the campaign root (required by startRetro/appendRetro)
    await writeFile(
      join(campaignRoot, 'profile.md'),
      '# Candidate profile\n\nExperienced engineer.\n',
    );

    // Store the default chatComplete mock and override for retro (needs plain text, not JSON)
    const defaultMock = vi.mocked(chatComplete).getMockImplementation();
    vi.mocked(chatComplete).mockImplementation(async () => ({
      content: '## Learning plan\n\nStudy system design patterns and practise whiteboarding.',
      model: 'test-model',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      finishReason: 'stop',
      durationMs: 100,
    }));

    return () => {
      vi.mocked(chatComplete).mockImplementation(defaultMock ?? vi.fn());
    };
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
    if (originalJhoData) {
      process.env['JHO_DATA'] = originalJhoData;
    } else {
      delete process.env['JHO_DATA'];
    }
  });

  it('startRetro writes toolhash for retro.md', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Software Engineer',
      company: 'Test Corp',
      url: 'https://example.com/job/123',
      description: 'Test job description.',
    });

    await startRetro({
      slug,
      campaign: 'default',
      weakTopics: ['System design'],
    });

    const retroPath = join(appliedDir, slug, 'retro.md');
    const content = await readFile(retroPath, 'utf8');
    const expectedHash = computeHash(content);
    const storedHash = await readToolhash(retroPath);

    expect(storedHash).toBe(expectedHash);
  });

  it('appendRetro writes toolhash for retro.md', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Software Engineer',
      company: 'Test Corp',
      url: 'https://example.com/job/123',
      description: 'Test job description.',
    });

    // Start retro first so retro.md exists
    await startRetro({
      slug,
      campaign: 'default',
      weakTopics: ['System design'],
    });

    // Now append — toolhash sidecar should be updated
    await appendRetro({
      slug,
      campaign: 'default',
      weakTopics: ['Behavioural'],
    });

    const retroPath = join(appliedDir, slug, 'retro.md');
    const content = await readFile(retroPath, 'utf8');
    const expectedHash = computeHash(content);
    const storedHash = await readToolhash(retroPath);

    expect(storedHash).toBe(expectedHash);
  });
});
