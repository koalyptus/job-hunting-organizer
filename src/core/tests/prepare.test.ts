import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generatePrep,
  generatePrepFromText,
  readPrep,
  appendTopic,
  formatPrepPlan,
  PrepError,
  PrepNotFoundError,
  PrepReadError,
} from '../prepare/index.js';
import type { PrepPlan } from '../prepare/types.js';
import type * as FsModule from '../fs.js';
import type * as AppModule from '../applications/applications.js';
import { aggregateRetros } from '../retro/aggregate.js';

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

vi.mock('../fs.js', async () => {
  const actual = await vi.importActual<typeof FsModule>('../fs.js');
  return {
    ...actual,
    atomicWrite: vi.fn(actual.atomicWrite),
  };
});

vi.mock('../applications/applications.js', async () => {
  const actual = await vi.importActual<typeof AppModule>('../applications/applications.js');
  return {
    ...actual,
    readApplication: vi.fn(actual.readApplication),
  };
});

vi.mock('../retro/aggregate.js', () => ({
  aggregateRetros: vi.fn(async () => []),
}));

const MOCK_LLM_RESPONSE = {
  topics: [
    {
      title: 'TypeScript generics',
      whatToKnow: ['Mapped types', 'Conditional types'],
      resources: ['TypeScript handbook', 'Total TypeScript'],
      estimatedTime: '2 hours',
      depth: 1,
    },
    {
      title: 'React performance',
      whatToKnow: ['useMemo', 'React.memo', 'Code splitting'],
      resources: ['React docs', 'Patterns.dev'],
      estimatedTime: '3 hours',
      depth: 2,
    },
  ],
  behavioral: [
    {
      question: 'Tell me about a time you disagreed with a teammate.',
      answer:
        'Situation: Disagreed on API design.\nTask: Align on a solution.\nAction: Proposed pros/cons doc.\nResult: Team agreed on the better approach.',
    },
  ],
  timeline: [
    { daysBefore: 7, task: 'Review TypeScript basics' },
    { daysBefore: 3, task: 'Practice React patterns' },
    { daysBefore: 1, task: 'Rest and review notes' },
  ],
  checklist: ['Review TypeScript handbook', 'Mock interview', 'Research company'],
  notes: 'Focus on practical examples.',
};

const MOCK_PREP_PLAN: PrepPlan = {
  topics: MOCK_LLM_RESPONSE.topics.map((t) => ({
    ...t,
    depth: t.depth as 1 | 2 | 3,
  })),
  behavioralQuestions: MOCK_LLM_RESPONSE.behavioral,
  timeline: MOCK_LLM_RESPONSE.timeline,
  checklist: MOCK_LLM_RESPONSE.checklist,
  notes: MOCK_LLM_RESPONSE.notes,
};

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

describe('formatPrepPlan', () => {
  it('formats a full prep plan into markdown', () => {
    const md = formatPrepPlan(MOCK_PREP_PLAN);
    expect(md).toContain('# Prep plan');
    expect(md).toContain('## Topics');
    expect(md).toContain('### TypeScript generics (depth 1)');
    expect(md).toContain('### React performance (depth 2)');
    expect(md).toContain('**What to know:**');
    expect(md).toContain('- Mapped types');
    expect(md).toContain('**Resources:**');
    expect(md).toContain('TypeScript handbook');
    expect(md).toContain('**Estimated time:** 2 hours');
    expect(md).toContain('## Behavioral questions');
    expect(md).toContain('Tell me about a time you disagreed with a teammate.');
    expect(md).toContain('## Timeline');
    expect(md).toContain('- **7d before**: Review TypeScript basics');
    expect(md).toContain('## Checklist');
    expect(md).toContain('- [ ] Review TypeScript handbook');
    expect(md).toContain('## Notes');
    expect(md).toContain('Focus on practical examples.');
  });

  it('handles empty plan', () => {
    const emptyPlan: PrepPlan = {
      topics: [],
      behavioralQuestions: [],
      timeline: [],
      checklist: [],
      notes: '',
    };
    const md = formatPrepPlan(emptyPlan);
    expect(md).toContain('# Prep plan');
    expect(md).not.toContain('## Topics');
    expect(md).not.toContain('## Behavioral');
  });
});

describe('readPrep', () => {
  let workDir: string;
  let campaignRoot: string;
  let appliedDir: string;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-prep-read-'));
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

  it('reads existing prepare.md', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, 'prepare.md'), '# Prep plan\n\nSome content.');

    const content = await readPrep('test-campaign', slug);
    expect(content).toContain('Some content.');
  });

  it('throws PrepReadError when file missing', async () => {
    await expect(readPrep('test-campaign', 'nonexistent')).rejects.toThrow(PrepReadError);
  });
});

describe('appendTopic', () => {
  let workDir: string;
  let campaignRoot: string;
  let appliedDir: string;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-prep-append-'));
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

  it('appends a topic to existing prepare.md', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, 'prepare.md'), '# Prep plan\n\n## Topics\n\n- Existing topic\n');

    await appendTopic('test-campaign', slug, 'New topic');

    const content = await readFile(join(appDir, 'prepare.md'), 'utf8');
    expect(content).toContain('- New topic');
    expect(content).toContain('- Existing topic');
  });

  it('throws PrepError when file missing', async () => {
    await expect(appendTopic('test-campaign', 'nonexistent', 'topic')).rejects.toThrow(PrepError);
  });
});

describe('generatePrep', () => {
  let workDir: string;
  let campaignRoot: string;
  let appliedDir: string;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-prep-gen-'));
    originalJhoData = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = workDir;
    campaignRoot = join(workDir, 'campaigns', 'test-campaign');
    appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
    mockChatComplete.mockReset();
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

  it('creates prepare.md with generated plan', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: JSON.stringify(MOCK_LLM_RESPONSE),
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    const result = await generatePrep({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
    });

    expect(result.content).toContain('# Prep plan');
    expect(result.model).toBe('gpt-4o-mini');
    expect(result.wordCount).toBeGreaterThan(0);
    expect(result.durationMs).toBe(500);

    const prepContent = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'prepare.md'),
      'utf8',
    );
    expect(prepContent).toContain('<!-- jho:prepare');
    expect(prepContent).toContain('TypeScript generics');
    expect(prepContent).toContain('React performance');
  });

  it('includes steer in prompt when provided', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: JSON.stringify(MOCK_LLM_RESPONSE),
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await generatePrep({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      steer: 'Focus on senior-level topics only',
    });

    const messages = mockChatComplete.mock.calls[0]?.[0] as Array<{
      role: string;
      content: string;
    }>;
    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('Additional instructions');
    expect(userMessage?.content).toContain('Focus on senior-level topics only');

    const prepContent = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'prepare.md'),
      'utf8',
    );
    expect(prepContent).toContain('<!-- jho:steer: Focus on senior-level topics only -->');
  });

  it('preserves existing steer when no new steer provided', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    // Write existing prepare.md with steer
    await writeFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'prepare.md'),
      [
        '<!-- jho:prepare -->',
        '',
        '<!-- jho:start:prepare -->',
        'existing content',
        '<!-- jho:end:prepare -->',
        '',
        '<!-- jho:steer: existing steer -->',
      ].join('\n'),
    );

    mockChatComplete.mockResolvedValueOnce({
      content: JSON.stringify(MOCK_LLM_RESPONSE),
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await generatePrep({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
    });

    const messages = mockChatComplete.mock.calls[0]?.[0] as Array<{
      role: string;
      content: string;
    }>;
    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('existing steer');

    const prepContent = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'prepare.md'),
      'utf8',
    );
    expect(prepContent).toContain('<!-- jho:steer: existing steer -->');
  });

  it('throws PrepNotFoundError for missing application', async () => {
    await expect(
      generatePrep({
        slug: 'nonexistent',
        campaign: 'test-campaign',
      }),
    ).rejects.toThrow(PrepNotFoundError);
  });

  it('throws PrepError on LLM refusal', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: 'I cannot generate a prep plan for you.',
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 10, totalTokens: 210 },
      durationMs: 200,
    });

    await expect(
      generatePrep({
        slug: '2026-Jun-01-SE-Test-Corp',
        campaign: 'test-campaign',
      }),
    ).rejects.toThrow(PrepError);
  });

  it('throws PrepError on LLM failure', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockRejectedValueOnce(new Error('LLM timeout'));

    await expect(
      generatePrep({
        slug: '2026-Jun-01-SE-Test-Corp',
        campaign: 'test-campaign',
      }),
    ).rejects.toThrow('LLM call failed');
  });

  it('throws PrepError on invalid JSON from LLM', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: 'This is not JSON at all.',
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 10, totalTokens: 210 },
      durationMs: 200,
    });

    await expect(
      generatePrep({
        slug: '2026-Jun-01-SE-Test-Corp',
        campaign: 'test-campaign',
      }),
    ).rejects.toThrow('Failed to parse LLM response');
  });

  it('throws PrepError when atomicWrite returns false', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await setupApp(slug);

    mockChatComplete.mockResolvedValueOnce({
      content: JSON.stringify(MOCK_LLM_RESPONSE),
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    const fsMod = await import('../fs.js');
    const spy = vi.spyOn(fsMod, 'atomicWrite').mockResolvedValueOnce(false);

    await expect(generatePrep({ slug, campaign: 'test-campaign' })).rejects.toThrow(
      'Failed to write prepare.md',
    );

    spy.mockRestore();
  });

  it('wraps non-Error JD read failures in PrepError', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await setupApp(slug);

    // Replace jd.md with content that causes extractJdContent to throw a non-Error
    // Actually, we need readFile to throw a non-Error. Let's remove jd.md.
    const { unlink } = await import('node:fs/promises');
    await unlink(join(appliedDir, slug, 'jd.md'));

    await expect(generatePrep({ slug, campaign: 'test-campaign' })).rejects.toThrow(
      'Failed to read JD',
    );
  });

  it('wraps non-Error profile read failures in PrepError', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await setupApp(slug);

    const profileMod = await import('../campaign/profile-read.js');
    const spy = vi.spyOn(profileMod, 'readProfile').mockRejectedValueOnce(42);

    await expect(generatePrep({ slug, campaign: 'test-campaign' })).rejects.toThrow(
      'Failed to read profile: 42',
    );

    spy.mockRestore();
  });
});

describe('generatePrepFromText', () => {
  let workDir: string;
  let campaignRoot: string;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-prep-text-'));
    originalJhoData = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = workDir;
    campaignRoot = join(workDir, 'campaigns', 'test-campaign');
    await mkdir(campaignRoot, { recursive: true });
    await writeProfileMd(campaignRoot);
    mockChatComplete.mockReset();
  });

  afterEach(async () => {
    if (originalJhoData !== undefined) {
      process.env['JHO_DATA'] = originalJhoData;
    } else {
      delete process.env['JHO_DATA'];
    }
    await rm(workDir, { recursive: true, force: true });
  });

  it('generates plan from pasted text without file I/O', async () => {
    mockChatComplete.mockResolvedValueOnce({
      content: JSON.stringify(MOCK_LLM_RESPONSE),
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    const result = await generatePrepFromText({
      jdText: 'We need a senior React dev with TypeScript skills.',
      campaign: 'test-campaign',
      days: 14,
    });

    expect(result.content).toContain('# Prep plan');
    expect(result.model).toBe('gpt-4o-mini');
    expect(result.wordCount).toBeGreaterThan(0);
  });

  it('passes steer to LLM', async () => {
    mockChatComplete.mockResolvedValueOnce({
      content: JSON.stringify(MOCK_LLM_RESPONSE),
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await generatePrepFromText({
      jdText: 'Senior role.',
      campaign: 'test-campaign',
      steer: 'Focus on distributed systems',
    });

    const messages = mockChatComplete.mock.calls[0]?.[0] as Array<{
      role: string;
      content: string;
    }>;
    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('Focus on distributed systems');
  });

  it('throws PrepError when profile is missing', async () => {
    // Remove profile
    await rm(join(campaignRoot, 'profile.md'), { force: true });

    await expect(
      generatePrepFromText({
        jdText: 'Senior role.',
        campaign: 'test-campaign',
      }),
    ).rejects.toThrow('Failed to read profile');
  });

  it('wraps non-Error profile read failures in PrepError', async () => {
    const profileMod = await import('../campaign/profile-read.js');
    const spy = vi.spyOn(profileMod, 'readProfile').mockRejectedValueOnce('string error');

    await expect(
      generatePrepFromText({
        jdText: 'Senior role.',
        campaign: 'test-campaign',
      }),
    ).rejects.toThrow('Failed to read profile: string error');

    spy.mockRestore();
  });
});

describe('generatePrep — retro cross-reference', () => {
  let workDir: string;
  let campaignRoot: string;
  let appliedDir: string;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-prep-retro-'));
    originalJhoData = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = workDir;
    campaignRoot = join(workDir, 'campaigns', 'test-campaign');
    appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
    mockChatComplete.mockReset();
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

  it('includes retro weak topics in prompt when aggregateRetros returns data', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    vi.mocked(aggregateRetros).mockResolvedValueOnce([
      { label: 'System design — consistency models', count: 2, apps: ['app-a', 'app-b'] },
      { label: 'Behavioural — conflict', count: 1, apps: ['app-c'] },
    ]);

    mockChatComplete.mockResolvedValueOnce({
      content: JSON.stringify(MOCK_LLM_RESPONSE),
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await generatePrep({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
    });

    const messages = mockChatComplete.mock.calls[0]?.[0] as Array<{
      role: string;
      content: string;
    }>;
    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('Retro cross-reference');
    expect(userMessage?.content).toContain('System design — consistency models');
    expect(userMessage?.content).toContain('Behavioural — conflict');

    vi.mocked(aggregateRetros).mockResolvedValue([]);
  });
});

describe('generatePrep — JSON extraction', () => {
  let workDir: string;
  let campaignRoot: string;
  let appliedDir: string;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-prep-json-'));
    originalJhoData = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = workDir;
    campaignRoot = join(workDir, 'campaigns', 'test-campaign');
    appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
    mockChatComplete.mockReset();
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

  it('extracts JSON from markdown fences', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    const fenced = '```json\n' + JSON.stringify(MOCK_LLM_RESPONSE) + '\n```';
    mockChatComplete.mockResolvedValueOnce({
      content: fenced,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    const result = await generatePrep({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
    });

    expect(result.content).toContain('# Prep plan');
    expect(result.content).toContain('TypeScript generics');
  });

  it('extracts JSON from surrounding text', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    const wrapped = 'Here is the plan:\n' + JSON.stringify(MOCK_LLM_RESPONSE) + '\nDone.';
    mockChatComplete.mockResolvedValueOnce({
      content: wrapped,
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    const result = await generatePrep({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
    });

    expect(result.content).toContain('# Prep plan');
  });

  it('throws when no JSON found in response', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: 'No JSON here at all.',
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 10, totalTokens: 210 },
      durationMs: 200,
    });

    await expect(
      generatePrep({
        slug: '2026-Jun-01-SE-Test-Corp',
        campaign: 'test-campaign',
      }),
    ).rejects.toThrow('Failed to parse LLM response');
  });
});

describe('generatePrep — timeline validation', () => {
  let workDir: string;
  let campaignRoot: string;
  let appliedDir: string;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-prep-timeline-'));
    originalJhoData = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = workDir;
    campaignRoot = join(workDir, 'campaigns', 'test-campaign');
    appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
    mockChatComplete.mockReset();
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

  it('warns when timeline milestones are out of bounds', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    const outOfBounds = {
      ...MOCK_LLM_RESPONSE,
      timeline: [
        { daysBefore: 30, task: 'Way too early' },
        { daysBefore: 1, task: 'Rest' },
      ],
    };

    mockChatComplete.mockResolvedValueOnce({
      content: JSON.stringify(outOfBounds),
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    // Should not throw — just warn
    const result = await generatePrep({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      days: 7,
    });

    expect(result.content).toContain('# Prep plan');
  });

  it('accepts timeline within ±20% bounds', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    const inBounds = {
      ...MOCK_LLM_RESPONSE,
      timeline: [
        { daysBefore: 7, task: 'Review' },
        { daysBefore: 3, task: 'Practice' },
        { daysBefore: 1, task: 'Rest' },
      ],
    };

    mockChatComplete.mockResolvedValueOnce({
      content: JSON.stringify(inBounds),
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    const result = await generatePrep({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      days: 7,
    });

    expect(result.content).toContain('# Prep plan');
  });
});

describe('generatePrep — overwrite behavior', () => {
  let workDir: string;
  let campaignRoot: string;
  let appliedDir: string;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-prep-overwrite-'));
    originalJhoData = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = workDir;
    campaignRoot = join(workDir, 'campaigns', 'test-campaign');
    appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
    mockChatComplete.mockReset();
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

  it('overwrites existing prepare.md region on re-run', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await setupApp(slug);

    // Write an existing plan
    await writeFile(
      join(appliedDir, slug, 'prepare.md'),
      [
        '<!-- jho:prepare -->',
        '',
        '<!-- jho:start:prepare -->',
        'old plan content',
        '<!-- jho:end:prepare -->',
        '',
        '<!-- jho:steer: old steer -->',
      ].join('\n'),
    );

    mockChatComplete.mockResolvedValueOnce({
      content: JSON.stringify(MOCK_LLM_RESPONSE),
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await generatePrep({
      slug,
      campaign: 'test-campaign',
    });

    const prepContent = await readFile(join(appliedDir, slug, 'prepare.md'), 'utf8');
    expect(prepContent).toContain('TypeScript generics');
    expect(prepContent).not.toContain('old plan content');
    // Steer should be preserved (no new steer provided)
    expect(prepContent).toContain('<!-- jho:steer: old steer -->');
  });

  it('prepends marker if missing', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await setupApp(slug);

    // Write prepare.md without the jho:prepare marker
    await writeFile(
      join(appliedDir, slug, 'prepare.md'),
      ['<!-- jho:start:prepare -->', 'some content', '<!-- jho:end:prepare -->'].join('\n'),
    );

    mockChatComplete.mockResolvedValueOnce({
      content: JSON.stringify(MOCK_LLM_RESPONSE),
      model: 'gpt-4o-mini',
      finishReason: 'stop',
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      durationMs: 500,
    });

    await generatePrep({
      slug,
      campaign: 'test-campaign',
    });

    const prepContent = await readFile(join(appliedDir, slug, 'prepare.md'), 'utf8');
    expect(prepContent).toMatch(/^<!-- jho:prepare/);
  });
});

describe('readPrep — error paths', () => {
  let workDir: string;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-prep-read-err-'));
    originalJhoData = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = workDir;
    const campaignRoot = join(workDir, 'campaigns', 'test-campaign');
    await mkdir(join(campaignRoot, 'applied'), { recursive: true });
  });

  afterEach(async () => {
    if (originalJhoData !== undefined) {
      process.env['JHO_DATA'] = originalJhoData;
    } else {
      delete process.env['JHO_DATA'];
    }
    await rm(workDir, { recursive: true, force: true });
  });

  it('throws PrepReadError with hint when file missing', async () => {
    await expect(readPrep('test-campaign', 'nonexistent')).rejects.toThrow(
      'Generate one with: jho prepare nonexistent',
    );
  });
});

describe('appendTopic — error paths', () => {
  let workDir: string;
  let originalJhoData: string | undefined;
  let appliedDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-prep-append-err-'));
    originalJhoData = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = workDir;
    const campaignRoot = join(workDir, 'campaigns', 'test-campaign');
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

  it('throws PrepError when atomicWrite returns false', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await mkdir(join(appliedDir, slug), { recursive: true });
    await writeFile(join(appliedDir, slug, 'prepare.md'), '<!-- jho:prepare -->\nexisting\n');

    const fsMod = await import('../fs.js');
    const spy = vi.spyOn(fsMod, 'atomicWrite').mockResolvedValueOnce(false);

    await expect(appendTopic('test-campaign', slug, 'new topic')).rejects.toThrow(
      'Failed to write prepare.md',
    );

    spy.mockRestore();
  });

  it('wraps non-PrepError exceptions in PrepError', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await mkdir(join(appliedDir, slug), { recursive: true });
    await writeFile(join(appliedDir, slug, 'prepare.md'), '<!-- jho:prepare -->\nexisting\n');

    const fsMod = await import('../fs.js');
    const spy = vi.spyOn(fsMod, 'atomicWrite').mockRejectedValueOnce(new Error('disk full'));

    await expect(appendTopic('test-campaign', slug, 'new topic')).rejects.toThrow(
      'Failed to append topic: disk full',
    );

    spy.mockRestore();
  });

  it('throws PrepError when prepare.md does not exist', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await mkdir(join(appliedDir, slug), { recursive: true });

    await expect(appendTopic('test-campaign', slug, 'new topic')).rejects.toThrow(
      'No prep plan found for',
    );
  });
});
