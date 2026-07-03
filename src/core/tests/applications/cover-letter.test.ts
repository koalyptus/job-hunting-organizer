import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateCoverLetter,
  readCoverLetter,
  CoverLetterError,
  CoverLetterReadError,
} from '../../applications/cover-letter.js';
import * as fsModule from '../../fs.js';

const mockChatComplete = vi.fn();

vi.mock('../../llm.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    chatComplete: (...args: unknown[]) => mockChatComplete(...args),
    defaultLlmConfig: vi.fn(() => ({
      baseUrl: 'https://api.test.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o',
      timeoutMs: 300_000,
    })),
  };
});

vi.mock('../../config.js', () => ({
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

vi.mock('../../prompts.js', () => ({
  loadPromptTemplate: vi.fn(async () => ({
    body: 'You are a cover letter writer.',
    temperature: 0.6,
  })),
}));

vi.mock('../../logger/logger.js', () => ({
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

describe('generateCoverLetter', () => {
  let workDir: string;
  let campaignRoot: string;
  let appliedDir: string;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    mockChatComplete.mockReset();
    workDir = await mkdtemp(join(tmpdir(), 'jho-cover-letter-'));
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

  async function setupApp(slug: string, opts?: { targetRole?: string }) {
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });

    await writeFile(
      join(appDir, 'meta.md'),
      [
        '---',
        `slug: ${slug}`,
        'status: applied',
        'appliedOn: 2026-06-01',
        'title: Software Engineer',
        'company: Test Corp',
        'location: Sydney',
        'site: Seek',
        'link: https://example.com/job/123',
        'salary: ""',
        'tags: [typescript, react]',
        opts?.targetRole !== undefined ? `targetRole: ${opts.targetRole}` : '',
        '---',
        '',
        'User notes here.',
      ]
        .filter((l) => l !== '')
        .join('\n'),
    );

    await writeFile(
      join(appDir, 'jd.md'),
      [
        '<!-- jho:start:fetched-jd -->',
        'We are looking for a senior engineer with TypeScript and React experience.',
        '<!-- jho:end:fetched-jd -->',
        '',
        'My notes about this job.',
      ].join('\n'),
    );

    await writeFile(
      join(campaignRoot, 'profile.md'),
      [
        '# Profile — Test User',
        '',
        '## Summary',
        '',
        'Senior engineer with 5 years of TypeScript experience.',
        '',
        '## Target roles',
        '',
        '<!-- jho:target-roles -->',
        '',
        '### senior-backend-engineer — Senior Backend Engineer [primary]',
        '',
        '- Level: Senior',
        '- Domain: Backend',
        '- Stack: TypeScript, Node.js',
        '- Work style: Remote',
        '- Compensation: 150k AUD',
        '- Notes: Strong backend focus',
        '',
        '<!-- jho:end:target-roles -->',
      ].join('\n'),
    );
  }

  it('generates a cover letter for an existing application', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: 'I am excited to apply for the Software Engineer role at Test Corp.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 300,
    });

    const result = await generateCoverLetter({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
    });

    expect(result.content).toBe(
      'I am excited to apply for the Software Engineer role at Test Corp.',
    );
    expect(result.model).toBe('gpt-4o');
    expect(result.wordCount).toBe(13);
    expect(result.durationMs).toBe(300);

    const coverLetter = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'cover-letter.md'),
      'utf8',
    );
    expect(coverLetter).toContain('I am excited to apply');
    expect(coverLetter).toContain('<!-- jho:start:cover-letter -->');
    expect(coverLetter).toContain('<!-- jho:end:cover-letter -->');
  });

  it('includes target role in the prompt when available', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp', { targetRole: 'senior-backend-engineer' });

    mockChatComplete.mockResolvedValueOnce({
      content: 'Cover letter content here.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    await generateCoverLetter({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
    });

    // chatComplete is called with (messages, llmConfig, options, log)
    const messages = mockChatComplete.mock.calls[0]?.[0] as Array<{
      role: string;
      content: string;
    }>;
    const userMessage = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('## Target role');
    expect(userMessage).toContain('Senior Backend Engineer');
  });

  it('throws CoverLetterError when application not found', async () => {
    await expect(
      generateCoverLetter({
        slug: 'nonexistent',
        campaign: 'test-campaign',
      }),
    ).rejects.toThrow(CoverLetterError);
  });

  it('throws CoverLetterError when profile not found', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, 'meta.md'), '---\nslug: test\nstatus: applied\n---\n');
    await writeFile(join(appDir, 'jd.md'), 'JD content');

    await expect(
      generateCoverLetter({
        slug,
        campaign: 'test-campaign',
      }),
    ).rejects.toThrow(CoverLetterError);
  });

  it('throws CoverLetterError on LLM failure', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockRejectedValueOnce(new Error('LLM timeout'));

    await expect(
      generateCoverLetter({
        slug: '2026-Jun-01-SE-Test-Corp',
        campaign: 'test-campaign',
      }),
    ).rejects.toThrow(CoverLetterError);
  });

  it('preserves user notes below the marker', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    await writeFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'cover-letter.md'),
      [
        '<!-- jho:start:cover-letter -->',
        'Old cover letter content.',
        '<!-- jho:end:cover-letter -->',
        '',
        'My custom notes about the cover letter.',
      ].join('\n'),
    );

    mockChatComplete.mockResolvedValueOnce({
      content: 'New cover letter content.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    await generateCoverLetter({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
    });

    const coverLetter = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'cover-letter.md'),
      'utf8',
    );
    expect(coverLetter).toContain('New cover letter content.');
    expect(coverLetter).toContain('My custom notes about the cover letter.');
  });

  it('throws CoverLetterError when LLM refuses to generate', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: 'I cannot write a cover letter for you.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    await expect(
      generateCoverLetter({
        slug: '2026-Jun-01-SE-Test-Corp',
        campaign: 'test-campaign',
      }),
    ).rejects.toThrow(CoverLetterError);
  });

  it('throws CoverLetterError when JD file is missing', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, 'meta.md'),
      '---\nslug: ' +
        slug +
        '\ntitle: Software Engineer\ncompany: Test Corp\nstatus: applied\n---\n',
    );
    // No jd.md file

    await expect(
      generateCoverLetter({
        slug,
        campaign: 'test-campaign',
      }),
    ).rejects.toThrow(CoverLetterError);
  });

  it('throws CoverLetterError when target role is specified but not found in profile', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp', { targetRole: 'nonexistent-role' });

    mockChatComplete.mockResolvedValueOnce({
      content: 'Cover letter content.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    // Should still work, just with "No target role assigned." in the prompt
    const result = await generateCoverLetter({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
    });

    expect(result.content).toBe('Cover letter content.');

    // Verify the prompt contains "No target role assigned."
    const messages = mockChatComplete.mock.calls[0]?.[0] as Array<{
      role: string;
      content: string;
    }>;
    const userMessage = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('No target role assigned.');
  });

  it('includes profile summary in the prompt', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: 'Cover letter content.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    await generateCoverLetter({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
    });

    const messages = mockChatComplete.mock.calls[0]?.[0] as Array<{
      role: string;
      content: string;
    }>;
    const userMessage = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('## Candidate profile');
    expect(userMessage).toContain('Senior engineer with 5 years of TypeScript experience.');
  });

  it('includes JD content in the prompt', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: 'Cover letter content.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    await generateCoverLetter({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
    });

    const messages = mockChatComplete.mock.calls[0]?.[0] as Array<{
      role: string;
      content: string;
    }>;
    const userMessage = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('## Job description');
    expect(userMessage).toContain(
      'We are looking for a senior engineer with TypeScript and React experience.',
    );
  });

  it('handles cover letter with no existing file', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: 'First cover letter.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    const result = await generateCoverLetter({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
    });

    expect(result.content).toBe('First cover letter.');

    const coverLetter = await readFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'cover-letter.md'),
      'utf8',
    );
    expect(coverLetter).toContain('<!-- jho:start:cover-letter -->');
    expect(coverLetter).toContain('First cover letter.');
    expect(coverLetter).toContain('<!-- jho:end:cover-letter -->');
  });

  it('throws when atomicWrite fails', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await setupApp(slug);

    mockChatComplete.mockResolvedValue({
      content: 'New content.',
      model: 'gpt-4o',
      durationMs: 150,
    });

    const spy = vi.spyOn(fsModule, 'atomicWrite').mockResolvedValue(false);

    await expect(generateCoverLetter({ slug, campaign: 'test-campaign' })).rejects.toThrow(
      'Failed to write cover-letter.md',
    );

    spy.mockRestore();
  });
});

describe('readCoverLetter', () => {
  let workDir: string;
  let campaignRoot: string;
  let appliedDir: string;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-cover-letter-read-'));
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

  it('reads existing cover letter', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, 'cover-letter.md'), 'Dear Hiring Manager,\n\nI am writing...');

    const content = await readCoverLetter('test-campaign', slug);
    expect(content).toBe('Dear Hiring Manager,\n\nI am writing...');
  });

  it('throws CoverLetterReadError when file is missing', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await mkdir(join(appliedDir, slug), { recursive: true });

    await expect(readCoverLetter('test-campaign', slug)).rejects.toThrow(CoverLetterReadError);
  });
});
