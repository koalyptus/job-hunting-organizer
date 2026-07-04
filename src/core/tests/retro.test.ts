import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readApplication } from '../applications/applications.js';
import type * as FsModule from '../fs.js';
import type * as AppModule from '../applications/applications.js';
import {
  startRetro,
  appendRetro,
  showRetro,
  parseRetroFile,
  aggregateRetros,
  RetroError,
  RetroNotFoundError,
} from '../retro/index.js';
import type { AggregateOptions } from '../retro/types.js';

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

const mockChatComplete = vi.fn();

vi.mock('../llm.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    chatComplete: (...args: unknown[]) => mockChatComplete(...args),
    defaultLlmConfig: vi.fn(() => ({
      baseUrl: 'https://api.test.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      timeoutMs: 300_000,
    })),
  };
});

vi.mock('../config.js', () => ({
  getConfig: vi.fn(() => ({
    global: {
      version: 1,
      dataRoot: '/tmp',
      llm: { baseUrl: 'https://config.com/v1', apiKey: 'sk-config', model: 'gpt-4' },
      github: { user: '', token: '', repos: [] },
      calendar: {
        defaultProvider: 'ics',
        outlook: { tenantId: '', clientId: '', clientSecret: '' },
      },
      logging: { level: 'info', file: '', redactPaths: [] },
    },
  })),
}));

vi.mock('../prompts.js', () => ({
  loadPromptTemplate: vi.fn(async () => ({
    body: 'You are a job-hunting coach.',
    temperature: 0.6,
  })),
}));

// Wrap atomicWrite in a spy for write-failure tests
vi.mock('../fs.js', async () => {
  const actual = await vi.importActual<typeof FsModule>('../fs.js');
  return {
    ...actual,
    atomicWrite: vi.fn(actual.atomicWrite),
  };
});

// Wrap readApplication for error injection
vi.mock('../applications/applications.js', async () => {
  const actual = await vi.importActual<typeof AppModule>('../applications/applications.js');
  return {
    ...actual,
    readApplication: vi.fn(actual.readApplication),
  };
});

function writeMetaMd(
  appDir: string,
  slug: string,
  title = 'Software Engineer',
  company = 'Foo Inc',
) {
  return writeFile(
    join(appDir, 'meta.md'),
    [
      '---',
      `slug: ${slug}`,
      'status: applied',
      'appliedOn: 2026-06-03',
      `title: ${title}`,
      `company: ${company}`,
      'location: Sydney',
      'site: Seek',
      'link: https://example.com/job/123',
      'salary: ""',
      'tags: []',
      '---',
      '',
      'User notes.',
    ].join('\n'),
  );
}

function writeJdMd(appDir: string) {
  return writeFile(
    join(appDir, 'jd.md'),
    [
      '<!-- jho:start:fetched-jd -->',
      'We are looking for a senior engineer with TypeScript and React experience.',
      '<!-- jho:end:fetched-jd -->',
      '',
      'My notes about this job.',
    ].join('\n'),
  );
}

function writeProfileMd(campaignRoot: string) {
  return writeFile(
    join(campaignRoot, 'profile.md'),
    [
      '# Profile — Test User',
      '',
      '## Summary',
      '',
      'Senior engineer with 5 years of TypeScript experience.',
      '',
      '## Skills',
      '',
      'TypeScript, React, Node.js',
    ].join('\n'),
  );
}

describe('parseRetroFile', () => {
  it('parses a single H2 retro section', () => {
    const content = [
      '<!-- jho:retro ... -->',
      '',
      '# Post-mortem — SE @ Foo',
      '',
      '## Retro for interview: 2026-06-17 14:00 — Interview #1 [failed]',
      '',
      '- Date: 2026-06-17',
      '- Interview id: 1',
      '- Status at the time: failed',
      '',
      '### Weak topics',
      '',
      '- System design — consistency models',
      '- Behavioural — conflict story',
      '',
      '### Learning plan',
      '',
      '#### Topic: System design',
      '',
      '- **What to know**: ACID vs BASE',
      '- **Resources**: DDIA ch.5-7',
      '',
      '### Checklist',
      '',
      '- [ ] Read DDIA ch.5',
      '',
    ].join('\n');

    const sections = parseRetroFile(content);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.index).toBe(1);
    expect(sections[0]!.when).toBe('2026-06-17 14:00');
    expect(sections[0]!.title).toBe('Interview #1');
    expect(sections[0]!.status).toBe('failed');
    expect(sections[0]!.date).toBe('2026-06-17');
    expect(sections[0]!.interviewId).toBe(1);
    expect(sections[0]!.statusAtTime).toBe('failed');
    expect(sections[0]!.weakTopics).toHaveLength(2);
    expect(sections[0]!.weakTopics[0]!.topic).toBe('System design');
    expect(sections[0]!.weakTopics[0]!.detail).toBe('consistency models');
  });

  it('parses Other notes section from retro content', () => {
    const content = [
      '<!-- jho:retro ... -->',
      '',
      '# Post-mortem — SE @ Foo',
      '',
      '## Retro for interview: 2026-06-17 14:00 — Interview #1 [failed]',
      '',
      '- Date: 2026-06-17',
      '- Interview id: 1',
      '- Status at the time: failed',
      '',
      '### Weak topics',
      '',
      '- System design',
      '',
      '### Other notes',
      '',
      'Interviewer was very technical.',
      'Asked deep dive questions on distributed systems.',
      '',
      '### Learning plan',
      '',
      '#### Topic: System design',
      '',
      '- **What to know**: ACID vs BASE',
      '',
      '### Checklist',
      '',
      '- [ ] Read DDIA',
      '',
    ].join('\n');

    const sections = parseRetroFile(content);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.notes).toContain('Interviewer was very technical.');
    expect(sections[0]!.notes).toContain('Asked deep dive questions on distributed systems.');
  });

  it('parses multiple retro sections', () => {
    const content = [
      '# Post-mortem — SE @ Foo',
      '',
      '## Retro for interview: 2026-06-17 14:00 — Interview #1 [failed]',
      '',
      '- Date: 2026-06-17',
      '- Interview id: 1',
      '- Status at the time: failed',
      '',
      '### Weak topics',
      '',
      '- System design',
      '',
      '## Retro for interview: 2026-06-24 10:00 — Final [failed]',
      '',
      '- Date: 2026-06-24',
      '- Interview id: 2',
      '- Status at the time: failed',
      '',
      '### Weak topics',
      '',
      '- Behavioural',
      '',
    ].join('\n');

    const sections = parseRetroFile(content);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.index).toBe(1);
    expect(sections[0]!.when).toBe('2026-06-17 14:00');
    expect(sections[1]!.index).toBe(2);
    expect(sections[1]!.when).toBe('2026-06-24 10:00');
  });

  it('returns empty array for content with no retro H2 sections', () => {
    expect(parseRetroFile('# Only header\n\nSome text.\n')).toEqual([]);
  });

  it('returns empty array for empty content', () => {
    expect(parseRetroFile('')).toEqual([]);
  });

  it('skips malformed H2 headings that do not match retro pattern', () => {
    const content = [
      '# Post-mortem — SE @ Foo',
      '',
      '## Some other heading',
      '',
      '- Date: 2026-06-17',
      '',
    ].join('\n');

    expect(parseRetroFile(content)).toHaveLength(0);
  });

  it('parses weak topics without detail (no "—" separator)', () => {
    const content = [
      '## Retro for interview: 2026-06-17 14:00 — Interview #1 [failed]',
      '',
      '- Date: 2026-06-17',
      '- Status at the time: failed',
      '',
      '### Weak topics',
      '',
      '- System design',
      '- Behavioural',
      '',
    ].join('\n');

    const sections = parseRetroFile(content);
    expect(sections[0]!.weakTopics).toHaveLength(2);
    expect(sections[0]!.weakTopics[0]!.topic).toBe('System design');
    expect(sections[0]!.weakTopics[0]!.detail).toBe('');
    expect(sections[0]!.weakTopics[1]!.topic).toBe('Behavioural');
  });
});

describe('showRetro', () => {
  let workDir: string;
  let campaignRoot: string;
  let appliedDir: string;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-retro-show-'));
    originalJhoData = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = workDir;
    campaignRoot = join(workDir, 'campaigns', 'test-campaign');
    appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
  });

  afterEach(async () => {
    if (originalJhoData !== undefined) {
      process.env['JHO_DATA'] = originalJhoData;
    } else {
      delete process.env['JHO_DATA'];
    }
    await rm(workDir, { recursive: true, force: true });
  });

  it('reads existing retro.md', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, 'retro.md'),
      '# Post-mortem — SE @ Test Corp\n\n## Retro for interview: ...',
    );

    const content = await showRetro('test-campaign', slug);
    expect(content).toContain('Post-mortem — SE @ Test Corp');
  });

  it('throws RetroNotFoundError when retro.md is missing', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await mkdir(join(appliedDir, slug), { recursive: true });

    await expect(showRetro('test-campaign', slug)).rejects.toThrow(RetroNotFoundError);
  });
});

describe('startRetro', () => {
  let workDir: string;
  let campaignRoot: string;
  let appliedDir: string;
  let originalJhoData: string | undefined;

  const mockPlanContent = [
    '#### Topic: System design — consistency models',
    '',
    '- **What to know**: ACID vs BASE, eventual consistency',
    '- **Resources**: DDIA ch.5-7',
    '- **Estimated time**: 4-6 hours',
    '',
    '### Checklist',
    '',
    '- [ ] Read DDIA ch.5',
  ].join('\n');

  beforeEach(async () => {
    mockChatComplete.mockReset();
    workDir = await mkdtemp(join(tmpdir(), 'jho-retro-start-'));
    originalJhoData = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = workDir;
    campaignRoot = join(workDir, 'campaigns', 'test-campaign');
    appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
  });

  afterEach(async () => {
    if (originalJhoData !== undefined) {
      process.env['JHO_DATA'] = originalJhoData;
    } else {
      delete process.env['JHO_DATA'];
    }
    await rm(workDir, { recursive: true, force: true });
  });

  async function setupApp(slug: string) {
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);
    await writeJdMd(appDir);
    await writeProfileMd(campaignRoot);
  }

  it('creates retro.md with generated learning plan', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    const result = await startRetro({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      weakTopics: ['System design — consistency models'],
    });

    expect(result.content).toBe(mockPlanContent);
    expect(result.model).toBe('gpt-4o-mini');
    expect(result.wordCount).toBeGreaterThan(0);
    expect(result.durationMs).toBe(500);
    expect(result.index).toBe(1);

    const retroContent = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'retro.md'),
      'utf8',
    );
    expect(retroContent).toContain('<!-- jho:retro');
    expect(retroContent).toContain('# Post-mortem — Software Engineer @ Foo Inc');
    expect(retroContent).toContain('Weak topics');
    expect(retroContent).toContain('System design — consistency models');
    expect(retroContent).toContain(mockPlanContent);
  });

  it('accepts notes and interviewId', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await startRetro({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      weakTopics: ['System design'],
      notes: 'Interviewer was rushed.',
      interviewId: 2,
    });

    const retroContent = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'retro.md'),
      'utf8',
    );
    expect(retroContent).toContain('- Interview id: 2');
    expect(retroContent).toContain('- Date:');
    expect(retroContent).toContain('Other notes');
    expect(retroContent).toContain('Interviewer was rushed.');
  });

  it('appends sequential retro sections with correct index', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValue({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    const result1 = await startRetro({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      weakTopics: ['System design'],
    });
    expect(result1.index).toBe(1);

    const result2 = await startRetro({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      weakTopics: ['Behavioural'],
    });
    expect(result2.index).toBe(2);

    const content = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'retro.md'),
      'utf8',
    );
    const sections = parseRetroFile(content);
    expect(sections).toHaveLength(2);
  });

  it('throws RetroError when weak topics is empty', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    await expect(
      startRetro({
        slug: '2026-Jun-01-SE-Test-Corp',
        campaign: 'test-campaign',
        weakTopics: [],
      }),
    ).rejects.toThrow(RetroError);
  });

  it('throws RetroNotFoundError for missing slug', async () => {
    await expect(
      startRetro({
        slug: 'nonexistent',
        campaign: 'test-campaign',
        weakTopics: ['System design'],
      }),
    ).rejects.toThrow(RetroNotFoundError);
  });

  it('throws RetroError on LLM failure', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockRejectedValueOnce(new Error('LLM timeout'));

    await expect(
      startRetro({
        slug: '2026-Jun-01-SE-Test-Corp',
        campaign: 'test-campaign',
        weakTopics: ['System design'],
      }),
    ).rejects.toThrow(RetroError);
  });

  it('throws RetroError on LLM refusal', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: 'I cannot generate a learning plan.',
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await expect(
      startRetro({
        slug: '2026-Jun-01-SE-Test-Corp',
        campaign: 'test-campaign',
        weakTopics: ['System design'],
      }),
    ).rejects.toThrow(RetroError);
  });

  it('throws RetroError when readApplication fails unexpectedly', async () => {
    vi.mocked(readApplication).mockRejectedValueOnce(new Error('disk failure'));

    await expect(
      startRetro({
        slug: '2026-Jun-01-SE-Test-Corp',
        campaign: 'test-campaign',
        weakTopics: ['System design'],
      }),
    ).rejects.toThrow(RetroError);
  });

  it('throws RetroError on atomicWrite failure', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    // Re-import the mocked atomicWrite for this test
    const { atomicWrite } = await import('../fs.js');
    vi.mocked(atomicWrite).mockResolvedValueOnce(false);

    await expect(
      startRetro({
        slug: '2026-Jun-01-SE-Test-Corp',
        campaign: 'test-campaign',
        weakTopics: ['System design'],
      }),
    ).rejects.toThrow(RetroError);
  });

  it('includes steer in the user message when provided', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await startRetro({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      weakTopics: ['System design'],
      steer: 'Focus on AWS services',
    });

    const messages = mockChatComplete.mock.calls[0]?.[0] as Array<{
      role: string;
      content: string;
    }>;
    const userMessage = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('## Additional instructions');
    expect(userMessage).toContain('Focus on AWS services');
  });

  it('writes steer marker to retro.md when steer is provided', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await startRetro({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      weakTopics: ['System design'],
      steer: 'Focus on AWS services',
    });

    const retroContent = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'retro.md'),
      'utf8',
    );
    expect(retroContent).toContain('<!-- jho:steer: Focus on AWS services -->');
  });

  it('does not write steer marker when no steer is provided', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await startRetro({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      weakTopics: ['System design'],
    });

    const retroContent = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'retro.md'),
      'utf8',
    );
    expect(retroContent).not.toContain('jho:steer:');
  });

  it('loads existing steer from file when no steer is provided', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');
    // Pre-write retro.md with a steer marker and an existing section
    const appDir = join(appliedDir, '2026-Jun-01-SE-Test-Corp');
    const existingRetro = [
      '<!-- jho:retro ... -->',
      '',
      '# Post-mortem — Software Engineer @ Foo Inc',
      '',
      '## Retro for interview: 2026-06-17 14:00 — Interview #1 [failed]',
      '',
      '- Date: 2026-06-17',
      '- Interview id: 1',
      '- Status at the time: failed',
      '',
      '### Weak topics',
      '',
      '- System design',
      '',
      '### Learning plan',
      '',
      'Old plan content.',
      '',
      '<!-- jho:steer: Existing AWS steer -->',
    ].join('\n');
    await writeFile(join(appDir, 'retro.md'), existingRetro);

    mockChatComplete.mockResolvedValueOnce({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await startRetro({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      weakTopics: ['System design'],
      // No steer provided — should load from file
    });

    const messages = mockChatComplete.mock.calls[0]?.[0] as Array<{
      role: string;
      content: string;
    }>;
    const userMessage = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('Existing AWS steer');
  });

  it('CLI steer overrides existing file steer', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');
    const appDir = join(appliedDir, '2026-Jun-01-SE-Test-Corp');
    const existingRetro = [
      '<!-- jho:retro ... -->',
      '',
      '# Post-mortem — Software Engineer @ Foo Inc',
      '',
      '## Retro for interview: 2026-06-17 14:00 — Interview #1 [failed]',
      '',
      '- Date: 2026-06-17',
      '- Interview id: 1',
      '- Status at the time: failed',
      '',
      '### Weak topics',
      '',
      '- System design',
      '',
      '### Learning plan',
      '',
      'Old plan content.',
      '',
      '<!-- jho:steer: Existing AWS steer -->',
    ].join('\n');
    await writeFile(join(appDir, 'retro.md'), existingRetro);

    mockChatComplete.mockResolvedValueOnce({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await startRetro({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      weakTopics: ['System design'],
      steer: 'New steer override',
    });

    const messages = mockChatComplete.mock.calls[0]?.[0] as Array<{
      role: string;
      content: string;
    }>;
    const userMessage = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('New steer override');
    expect(userMessage).not.toContain('Existing AWS steer');

    // File should contain the new steer marker
    const retroContent = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'retro.md'),
      'utf8',
    );
    expect(retroContent).toContain('<!-- jho:steer: New steer override -->');
    expect(retroContent).not.toContain('Existing AWS steer');
  });

  it('throws RetroError when profile is missing', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);
    await writeJdMd(appDir);
    // No profile.md

    await expect(
      startRetro({
        slug,
        campaign: 'test-campaign',
        weakTopics: ['System design'],
      }),
    ).rejects.toThrow(RetroError);
  });

  it('throws RetroError when jd.md is missing', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);
    // No jd.md
    await writeProfileMd(campaignRoot);

    await expect(
      startRetro({
        slug,
        campaign: 'test-campaign',
        weakTopics: ['System design'],
      }),
    ).rejects.toThrow(RetroError);
  });
});

describe('appendRetro', () => {
  let workDir: string;
  let campaignRoot: string;
  let appliedDir: string;
  let originalJhoData: string | undefined;

  const mockPlanContent = [
    '#### Topic: System design — consistency models',
    '',
    '- **What to know**: ACID vs BASE',
    '- **Resources**: DDIA ch.5-7',
    '',
    '### Checklist',
    '',
    '- [ ] Read DDIA ch.5',
  ].join('\n');

  beforeEach(async () => {
    mockChatComplete.mockReset();
    workDir = await mkdtemp(join(tmpdir(), 'jho-retro-append-'));
    originalJhoData = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = workDir;
    campaignRoot = join(workDir, 'campaigns', 'test-campaign');
    appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
  });

  afterEach(async () => {
    if (originalJhoData !== undefined) {
      process.env['JHO_DATA'] = originalJhoData;
    } else {
      delete process.env['JHO_DATA'];
    }
    await rm(workDir, { recursive: true, force: true });
  });

  async function setupAppWithRetro(slug: string) {
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);
    await writeJdMd(appDir);
    await writeProfileMd(campaignRoot);

    // Create an existing retro.md with one section
    const existingRetro = [
      '<!-- jho:retro ... -->',
      '',
      '# Post-mortem — Software Engineer @ Foo Inc',
      '',
      '## Retro for interview: 2026-06-17 14:00 — Interview #1 [failed]',
      '',
      '- Date: 2026-06-17',
      '- Interview id: 1',
      '- Status at the time: failed',
      '',
      '### Weak topics',
      '',
      '- System design — consistency models',
      '',
      '### Learning plan',
      '',
      'Old plan content.',
      '',
    ].join('\n');
    await writeFile(join(appDir, 'retro.md'), existingRetro);
  }

  it('adds new weak topics and regenerates learning plan', async () => {
    await setupAppWithRetro('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    const result = await appendRetro({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      weakTopics: ['Behavioural — conflict story'],
    });

    expect(result.content).toBe(mockPlanContent);
    expect(result.index).toBe(1); // Still first section

    const retroContent = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'retro.md'),
      'utf8',
    );
    // Original weak topic preserved
    expect(retroContent).toContain('System design — consistency models');
    // New weak topic added
    expect(retroContent).toContain('Behavioural — conflict story');
    // Old plan replaced with new
    expect(retroContent).toContain(mockPlanContent);
    expect(retroContent).not.toContain('Old plan content.');
  });

  it('deduplicates weak topics', async () => {
    await setupAppWithRetro('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await appendRetro({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      weakTopics: ['System design — consistency models'], // Already exists
    });

    const retroContent = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'retro.md'),
      'utf8',
    );
    // Should only appear once in the weak topics list
    const weakSection = retroContent.split('### Learning plan')[0]!;
    const matches = weakSection.match(/System design — consistency models/g);
    expect(matches).toHaveLength(1);
  });

  it('handles trailing non-retro H2 in append', async () => {
    const appDir = join(appliedDir, '2026-Jun-01-SE-Test-Corp');
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, '2026-Jun-01-SE-Test-Corp');
    await writeJdMd(appDir);
    await writeProfileMd(campaignRoot);

    // Retro file with a non-retro H2 after the last retro section
    const existingRetro = [
      '<!-- jho:retro ... -->',
      '',
      '# Post-mortem — Software Engineer @ Foo Inc',
      '',
      '## Retro for interview: 2026-06-17 14:00 — Interview #1 [failed]',
      '',
      '- Date: 2026-06-17',
      '- Status at the time: failed',
      '',
      '### Weak topics',
      '',
      '- System design',
      '',
      '### Learning plan',
      '',
      'Old plan.',
      '',
      '## Some other heading',
      '',
      'Misc content.',
      '',
    ].join('\n');
    await writeFile(join(appDir, 'retro.md'), existingRetro);

    mockChatComplete.mockResolvedValueOnce({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await appendRetro({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      weakTopics: ['Behavioural'],
    });

    // The retro section should have been updated; trailing H2 should still be present
    const retroContent = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'retro.md'),
      'utf8',
    );
    expect(retroContent).toContain('## Some other heading');
    expect(retroContent).toContain('Misc content.');
  });

  it('throws RetroError when no retro exists', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);

    await expect(
      appendRetro({
        slug,
        campaign: 'test-campaign',
        weakTopics: ['System design'],
      }),
    ).rejects.toThrow(RetroError);
  });

  it('throws RetroError when weak topics is empty', async () => {
    await expect(
      appendRetro({
        slug: '2026-Jun-01-SE-Test-Corp',
        campaign: 'test-campaign',
        weakTopics: [],
      }),
    ).rejects.toThrow(RetroError);
  });

  it('appends notes to existing retro', async () => {
    await setupAppWithRetro('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await appendRetro({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      weakTopics: ['Behavioural'],
      notes: 'Additional observation.',
    });

    const retroContent = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'retro.md'),
      'utf8',
    );
    expect(retroContent).toContain('Additional observation.');
  });

  it('preserves existing notes when appending without new notes', async () => {
    const appDir = join(appliedDir, '2026-Jun-01-SE-Test-Corp');
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, '2026-Jun-01-SE-Test-Corp');
    await writeJdMd(appDir);
    await writeProfileMd(campaignRoot);

    // Create retro with existing notes section
    const existingRetro = [
      '<!-- jho:retro ... -->',
      '',
      '# Post-mortem — Software Engineer @ Foo Inc',
      '',
      '## Retro for interview: 2026-06-17 14:00 — Interview #1 [failed]',
      '',
      '- Date: 2026-06-17',
      '- Interview id: 1',
      '- Status at the time: failed',
      '',
      '### Weak topics',
      '',
      '- System design',
      '',
      '### Other notes',
      '',
      'Pre-existing note content.',
      '',
      '### Learning plan',
      '',
      'Old plan.',
      '',
    ].join('\n');
    await writeFile(join(appDir, 'retro.md'), existingRetro);

    mockChatComplete.mockResolvedValueOnce({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await appendRetro({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      weakTopics: ['Behavioural'],
      // No notes argument — should preserve existing notes from file
    });

    const retroContent = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'retro.md'),
      'utf8',
    );
    expect(retroContent).toContain('Pre-existing note content.');
  });

  it('preserves weak topic details after append cycle', async () => {
    await setupAppWithRetro('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await appendRetro({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      weakTopics: ['Behavioural'],
    });

    const retroContent = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'retro.md'),
      'utf8',
    );
    // Original weak topic with detail should be preserved
    expect(retroContent).toContain('- System design — consistency models');
  });

  it('includes steer in user message when provided', async () => {
    await setupAppWithRetro('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await appendRetro({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      weakTopics: ['Behavioural'],
      steer: 'Prioritise AWS topics',
    });

    const messages = mockChatComplete.mock.calls[0]?.[0] as Array<{
      role: string;
      content: string;
    }>;
    const userMessage = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('Prioritise AWS topics');
  });

  it('writes steer marker to retro.md when steer is provided on append', async () => {
    await setupAppWithRetro('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await appendRetro({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      weakTopics: ['Behavioural'],
      steer: 'Prioritise AWS topics',
    });

    const retroContent = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'retro.md'),
      'utf8',
    );
    expect(retroContent).toContain('<!-- jho:steer: Prioritise AWS topics -->');
  });

  it('loads existing steer from file when no steer provided on append', async () => {
    const appDir = join(appliedDir, '2026-Jun-01-SE-Test-Corp');
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, '2026-Jun-01-SE-Test-Corp');
    await writeJdMd(appDir);
    await writeProfileMd(campaignRoot);

    // Pre-write retro.md with steer marker
    const existingRetro = [
      '<!-- jho:retro ... -->',
      '',
      '# Post-mortem — Software Engineer @ Foo Inc',
      '',
      '## Retro for interview: 2026-06-17 14:00 — Interview #1 [failed]',
      '',
      '- Date: 2026-06-17',
      '- Interview id: 1',
      '- Status at the time: failed',
      '',
      '### Weak topics',
      '',
      '- System design',
      '',
      '### Learning plan',
      '',
      'Old plan.',
      '',
      '<!-- jho:steer: Stored steer from initial retro -->',
    ].join('\n');
    await writeFile(join(appDir, 'retro.md'), existingRetro);

    mockChatComplete.mockResolvedValueOnce({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await appendRetro({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      weakTopics: ['Behavioural'],
      // No steer provided — should load from file
    });

    const messages = mockChatComplete.mock.calls[0]?.[0] as Array<{
      role: string;
      content: string;
    }>;
    const userMessage = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('Stored steer from initial retro');
  });

  it('CLI steer overrides existing file steer on append', async () => {
    const appDir = join(appliedDir, '2026-Jun-01-SE-Test-Corp');
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, '2026-Jun-01-SE-Test-Corp');
    await writeJdMd(appDir);
    await writeProfileMd(campaignRoot);

    const existingRetro = [
      '<!-- jho:retro ... -->',
      '',
      '# Post-mortem — Software Engineer @ Foo Inc',
      '',
      '## Retro for interview: 2026-06-17 14:00 — Interview #1 [failed]',
      '',
      '- Date: 2026-06-17',
      '- Interview id: 1',
      '- Status at the time: failed',
      '',
      '### Weak topics',
      '',
      '- System design',
      '',
      '### Learning plan',
      '',
      'Old plan.',
      '',
      '<!-- jho:steer: Existing steer -->',
    ].join('\n');
    await writeFile(join(appDir, 'retro.md'), existingRetro);

    mockChatComplete.mockResolvedValueOnce({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await appendRetro({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      weakTopics: ['Behavioural'],
      steer: 'Override steer',
    });

    const messages = mockChatComplete.mock.calls[0]?.[0] as Array<{
      role: string;
      content: string;
    }>;
    const userMessage = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('Override steer');
    expect(userMessage).not.toContain('Existing steer');

    // File should contain the new steer marker
    const retroContent = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'retro.md'),
      'utf8',
    );
    expect(retroContent).toContain('<!-- jho:steer: Override steer -->');
    expect(retroContent).not.toContain('Existing steer');
  });

  it('throws RetroError on atomicWrite failure in append', async () => {
    await setupAppWithRetro('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: mockPlanContent,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    const { atomicWrite } = await import('../fs.js');
    vi.mocked(atomicWrite).mockResolvedValueOnce(false);

    await expect(
      appendRetro({
        slug: '2026-Jun-01-SE-Test-Corp',
        campaign: 'test-campaign',
        weakTopics: ['Behavioural'],
      }),
    ).rejects.toThrow(RetroError);
  });
});

describe('aggregateRetros', () => {
  let workDir: string;
  let appliedDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-retro-agg-'));
    appliedDir = join(workDir, 'applied');
    await mkdir(appliedDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  async function createApp(
    slug: string,
    targetRole: string,
    status: string,
    retroWeakTopics: string[][],
  ) {
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug, slug, 'Test Corp');

    // Override target role and status
    const metaContent = [
      '---',
      `slug: ${slug}`,
      `status: ${status}`,
      'appliedOn: 2026-06-01',
      `title: ${slug}`,
      'company: Test Corp',
      'location: Sydney',
      'site: Seek',
      'link: https://example.com/job/123',
      'salary: ""',
      'tags: []',
      `targetRole: ${targetRole}`,
      '---',
      '',
      'User notes.',
    ].join('\n');
    await writeFile(join(appDir, 'meta.md'), metaContent);

    // Write retro.md with sections per round
    const sectionLines: string[] = [
      '<!-- jho:retro ... -->',
      '',
      `# Post-mortem — ${slug} @ Test Corp`,
      '',
    ];

    for (let i = 0; i < retroWeakTopics.length; i++) {
      const topics = retroWeakTopics[i]!;
      sectionLines.push(
        `## Retro for interview: 2026-06-${10 + i} 10:00 — Interview #${i + 1} [failed]`,
        '',
        '- Date: 2026-06-17',
        '- Status at the time: failed',
        '',
        '### Weak topics',
        '',
        ...topics.map((t) => `- ${t}`),
        '',
      );
    }

    await writeFile(join(appDir, 'retro.md'), sectionLines.join('\n'));
  }

  it('aggregates weak topics across apps', async () => {
    await createApp('2026-Jun-01-SE-Apple', 'senior-engineer', 'rejected', [
      ['System design — consistency models'],
    ]);
    await createApp('2026-Jun-02-SE-Google', 'senior-engineer', 'rejected', [
      ['System design — consistency models'],
      ['Behavioural — conflict story'],
    ]);
    await createApp('2026-Jun-03-SE-Meta', 'staff-engineer', 'rejected', [
      ['Distributed systems — consensus'],
    ]);

    const results = await aggregateRetros(appliedDir);

    expect(results).toHaveLength(3);
    expect(results[0]!.label).toBe('System design — consistency models');
    expect(results[0]!.count).toBe(2);
    expect(results[0]!.apps).toContain('2026-Jun-01-SE-Apple');
    expect(results[0]!.apps).toContain('2026-Jun-02-SE-Google');
    expect(results[1]!.count).toBe(1);
    expect(results[2]!.count).toBe(1);
  });

  it('filters by target role', async () => {
    await createApp('2026-Jun-01-SE-Apple', 'senior-engineer', 'rejected', [['System design']]);
    await createApp('2026-Jun-02-SE-Google', 'staff-engineer', 'rejected', [['System design']]);

    const opts: AggregateOptions = { role: 'senior-engineer' };
    const results = await aggregateRetros(appliedDir, opts);

    expect(results).toHaveLength(1);
    expect(results[0]!.count).toBe(1);
    expect(results[0]!.apps).toEqual(['2026-Jun-01-SE-Apple']);
  });

  it('excludes abandoned apps by default', async () => {
    await createApp('2026-Jun-01-SE-Apple', 'senior-engineer', 'rejected', [['System design']]);
    await createApp('2026-Jun-02-SE-Google', 'senior-engineer', 'abandoned', [['System design']]);

    const results = await aggregateRetros(appliedDir);
    expect(results[0]!.count).toBe(1);
    expect(results[0]!.apps).toEqual(['2026-Jun-01-SE-Apple']);
  });

  it('includes abandoned apps with includeAbandoned flag', async () => {
    await createApp('2026-Jun-01-SE-Apple', 'senior-engineer', 'rejected', [['System design']]);
    await createApp('2026-Jun-02-SE-Google', 'senior-engineer', 'abandoned', [['System design']]);

    const opts: AggregateOptions = { includeAbandoned: true };
    const results = await aggregateRetros(appliedDir, opts);
    expect(results[0]!.count).toBe(2);
  });

  it('filters by minimum occurrences', async () => {
    await createApp('2026-Jun-01-SE-Apple', 'senior-engineer', 'rejected', [['System design']]);
    await createApp('2026-Jun-02-SE-Google', 'senior-engineer', 'rejected', [
      ['Distributed systems'],
    ]);

    const opts: AggregateOptions = { minOccurrences: 2 };
    const results = await aggregateRetros(appliedDir, opts);
    expect(results).toHaveLength(0);
  });

  it('returns empty array when no retro.md files exist', async () => {
    const slug = '2026-Jun-01-SE-Test';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);

    const results = await aggregateRetros(appliedDir);
    expect(results).toEqual([]);
  });

  it('handles apps with no retro.md gracefully', async () => {
    await createApp('2026-Jun-01-SE-Apple', 'senior-engineer', 'rejected', [['System design']]);
    // App with no retro.md
    const slug = '2026-Jun-02-SE-Google';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug, slug, 'Google');

    const results = await aggregateRetros(appliedDir);
    expect(results).toHaveLength(1);
    expect(results[0]!.count).toBe(1);
  });

  it('returns results sorted by frequency descending', async () => {
    await createApp('2026-Jun-01-SE-Apple', 'senior-engineer', 'rejected', [
      ['Topic A'],
      ['Topic B'],
    ]);
    await createApp('2026-Jun-02-SE-Google', 'senior-engineer', 'rejected', [
      ['Topic A'],
      ['Topic C'],
    ]);
    await createApp('2026-Jun-03-SE-Meta', 'senior-engineer', 'rejected', [['Topic B']]);

    const results = await aggregateRetros(appliedDir);
    expect(results[0]!.label).toBe('Topic A');
    expect(results[0]!.count).toBe(2);
    expect(results[1]!.label).toBe('Topic B');
    expect(results[1]!.count).toBe(2);
  });

  it('handles unreadable retro.md gracefully (logs warning)', async () => {
    await createApp('2026-Jun-01-SE-Apple', 'senior-engineer', 'rejected', [['System design']]);

    // Replace retro.md with a directory so readFile throws EISDIR
    const retroDir = join(appliedDir, '2026-Jun-01-SE-Apple', 'retro.md');
    await rm(retroDir, { recursive: true, force: true });
    await mkdir(retroDir, { recursive: true });

    const results = await aggregateRetros(appliedDir);
    // Should not throw — just skip the unreadable retro
    expect(results).toHaveLength(0);
  });
});
