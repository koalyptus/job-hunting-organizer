import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';

const mockChatComplete = vi.fn();

vi.mock('../../../core/llm.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    chatComplete: (...args: unknown[]) => mockChatComplete(...args),
    defaultLlmConfig: vi.fn(() => ({
      baseUrl: 'https://api.test.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o',
      timeoutMs: 300_000,
    })),
  };
});

vi.mock('../../../lib/config/config.js', () => ({
  getConfig: vi.fn(() => ({
    global: {
      version: 1,
      dataRoot: '/tmp',
      llm: { baseUrl: 'https://config.com/v1', apiKey: 'k', model: 'gpt-4' },
      github: { user: '', token: '', repos: [] },
      logging: { level: 'info', file: '', redactPaths: [] },
    },
    campaign: {
      version: 1,
      profilePath: '/tmp/profile.md',
      cvPath: '',
      knowledgeBase: { maxChars: 50000 },
      linkedinUrl: '',
    },
  })),
}));

vi.mock('../../../workflow/prompts.js', () => ({
  loadPromptTemplate: vi.fn(async () => ({ body: 'sys', temperature: 0.6 })),
  loadPromptTemplateWithVoice: vi.fn(async () => ({ body: 'sys', temperature: 0.6 })),
}));

vi.mock('../../../lib/logger/logger.js', () => ({
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

describe('applications branch boost', () => {
  let workDir: string;
  let campaignRoot: string;
  let appliedDir: string;
  let orig: string | undefined;

  beforeEach(async () => {
    mockChatComplete.mockReset();
    workDir = await mkdtemp(join(tmpdir(), 'jho-app-br-'));
    orig = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = workDir;
    campaignRoot = join(workDir, 'campaigns', 'test-campaign');
    appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
  });

  afterEach(async () => {
    if (orig !== undefined) {
      process.env['JHO_DATA'] = orig;
    } else {
      delete process.env['JHO_DATA'];
    }
    await rm(workDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function setupApp(slug: string) {
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
        'link: https://example.com',
        'salary: ""',
        'tags: []',
        '---',
        '',
      ].join('\n'),
    );
    await writeFile(
      join(appDir, 'jd.md'),
      ['<!-- jho:start:fetched-jd -->', 'JD text', '<!-- jho:end:fetched-jd -->'].join('\n'),
    );
    await writeFile(
      join(campaignRoot, 'profile.md'),
      ['# Profile', '## Target roles', '<!-- jho:target-roles -->', ''].join('\n'),
    );
  }

  it('cover-letter non-Error throw on LLM (L186) and noSave branch (L224)', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await setupApp(slug);
    const { generateCoverLetter } = await import('../cover-letter.js');
    // non-Error LLM
    mockChatComplete.mockRejectedValue('string error');
    await expect(generateCoverLetter({ slug, campaign: 'test-campaign' })).rejects.toThrow();
    mockChatComplete.mockReset();
    // noSave
    mockChatComplete.mockResolvedValueOnce({
      content: 'Cover content',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      durationMs: 100,
    });
    const res = await generateCoverLetter({ slug, campaign: 'test-campaign', noSave: true });
    expect(res.content).toBe('Cover content');
  });

  it('application-qa non-Error LLM and noSave branches', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await setupApp(slug);
    const { answerQuestion } = await import('../application-qa.js');
    mockChatComplete.mockRejectedValue('string llm');
    await expect(
      answerQuestion({ slug, campaign: 'test-campaign', question: 'Q?' }),
    ).rejects.toThrow();
    mockChatComplete.mockReset();
    mockChatComplete.mockResolvedValueOnce({
      content: 'Answer content',
      model: 'm',
      durationMs: 10,
    });
    const res = await answerQuestion({
      slug,
      campaign: 'test-campaign',
      question: 'Why?',
      noSave: true,
    });
    expect(res.answer).toBeDefined();
  });

  it('application-qa image mime branches (gif, webp, jpeg)', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await setupApp(slug);
    const { answerQuestion } = await import('../application-qa.js');
    // create dummy image files
    const imgJpeg = join(workDir, 'img.jpg');
    const imgGif = join(workDir, 'img.gif');
    const imgWebp = join(workDir, 'img.webp');
    await writeFile(imgJpeg, Buffer.from('fake'));
    await writeFile(imgGif, Buffer.from('fake'));
    await writeFile(imgWebp, Buffer.from('fake'));
    for (const p of [imgJpeg, imgGif, imgWebp]) {
      mockChatComplete.mockResolvedValueOnce({ content: 'Ans', model: 'm', durationMs: 10 });
      const res = await answerQuestion({
        slug,
        campaign: 'test-campaign',
        question: 'Q?',
        imagePath: p,
        noSave: true,
      });
      expect(res.answer).toBe('Ans');
    }
  });

  it('application-qa image read non-Error (L177 branch)', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await setupApp(slug);
    // Trigger image read error by passing nonexistent file - covers L177 error catch (Error branch)
    const { answerQuestion } = await import('../application-qa.js');
    await expect(
      answerQuestion({
        slug,
        campaign: 'test-campaign',
        question: 'Q?',
        imagePath: '/tmp/nonexistent-fake-123.png',
      }),
    ).rejects.toThrow();
  });

  it('cover-letter refusal branch', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await setupApp(slug);
    const { generateCoverLetter } = await import('../cover-letter.js');
    mockChatComplete.mockResolvedValueOnce({
      content: 'I am sorry, I cannot help with that request.',
      model: 'm',
      durationMs: 10,
    });
    await expect(generateCoverLetter({ slug, campaign: 'test-campaign' })).rejects.toThrow();
  });
});
