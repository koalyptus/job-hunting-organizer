import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { answerQuestion, readQa, AnswerError, QaReadError } from '../application-qa.js';
import { EM_DASH } from '../../../core/humanize.js';
import * as fsModule from '../../../core/fs.js';
import { JHO_DATA } from '../../../workflow/init/constants.js';

const mockChatComplete = vi.fn();

vi.mock('../../../core/llm.js', async (importOriginal) => {
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

vi.mock('../../../core/config/config.js', () => ({
  getConfig: vi.fn(() => ({
    global: {
      version: 1,
      dataRoot: '/tmp',
      llm: { baseUrl: 'https://config.com/v1', apiKey: 'test', model: 'gpt-4' },
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

vi.mock('../../../core/prompts.js', () => ({
  loadPromptTemplate: vi.fn(async () => ({
    body: 'You are a Q&A assistant.',
    temperature: 0.6,
  })),
  loadPromptTemplateWithVoice: vi.fn(async () => ({
    body: 'You are a Q&A assistant.',
    temperature: 0.6,
  })),
}));

vi.mock('../../../core/logger/logger.js', () => ({
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

describe('answerQuestion', () => {
  let workDir: string;
  let campaignRoot: string;
  let appliedDir: string;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    mockChatComplete.mockReset();
    workDir = await mkdtemp(join(tmpdir(), 'jho-qa-'));
    originalJhoData = process.env[JHO_DATA];
    process.env[JHO_DATA] = workDir;
    campaignRoot = join(workDir, 'campaigns', 'test-campaign');
    appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
  });

  afterEach(async () => {
    if (originalJhoData !== undefined) {
      process.env[JHO_DATA] = originalJhoData;
    } else {
      delete process.env[JHO_DATA];
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
        'link: https://example.com/job/123',
        'salary: ""',
        'tags: [typescript, react]',
        '---',
        '',
        'User notes here.',
      ].join('\n'),
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
      ].join('\n'),
    );
  }

  it('answers a text question for an existing application', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: 'I have extensive experience with TypeScript and React.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 250,
    });

    const result = await answerQuestion({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      question: 'Tell me about your TypeScript experience.',
    });

    expect(result.answer).toBe('I have extensive experience with TypeScript and React.');
    expect(result.model).toBe('gpt-4o');
    expect(result.wordCount).toBe(8);
    expect(result.durationMs).toBe(250);

    // Verify qa.md was created
    const qaContent = await readFile(join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'qa.md'), 'utf8');
    expect(qaContent).toContain('# Q&A — Software Engineer @ Test Corp');
    expect(qaContent).toContain('Tell me about your TypeScript experience.');
    expect(qaContent).toContain('I have extensive experience with TypeScript and React.');
    expect(qaContent).toContain('- Source: application form');
    expect(qaContent).toContain('[text]');
  });

  it('applies the mechanical humanize pass to the LLM output', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    // A run of 3+ em-dashes → the post-processor rewrites it to commas.
    mockChatComplete.mockResolvedValueOnce({
      content: `I have strong TypeScript skills${EM_DASH.repeat(3)}and I built React apps${EM_DASH.repeat(3)}for the modern web${EM_DASH.repeat(3)}at scale.`,
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 250,
    });

    const result = await answerQuestion({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      question: 'Tell me about your TypeScript experience.',
    });

    expect(result.answer).toBe(
      'I have strong TypeScript skills, and I built React apps, for the modern web, at scale.',
    );

    const qaContent = await readFile(join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'qa.md'), 'utf8');
    expect(qaContent).toContain(
      'I have strong TypeScript skills, and I built React apps, for the modern web, at scale.',
    );
    // The answer block (after "Answer:") must not contain the raw em-dash.
    const answerBlock = qaContent.split('- Answer:')[1] ?? '';
    expect(answerBlock).not.toContain(EM_DASH);
  });

  it('appends to existing qa.md', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    // Create existing qa.md
    await writeFile(
      join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'qa.md'),
      [
        '# Q&A — Software Engineer @ Test Corp',
        '',
        '## 2026-06-01 10:00:00 — "Previous question" [text]',
        '',
        '- Source: email',
        '- Answer:',
        '  > Previous answer here.',
        '',
      ].join('\n'),
    );

    mockChatComplete.mockResolvedValueOnce({
      content: 'New answer here.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    await answerQuestion({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      question: 'New question?',
    });

    const qaContent = await readFile(join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'qa.md'), 'utf8');
    // Original content preserved
    expect(qaContent).toContain('Previous question');
    expect(qaContent).toContain('Previous answer here.');
    // New content appended
    expect(qaContent).toContain('New question?');
    expect(qaContent).toContain('New answer here.');
  });

  it('includes image tag in header when image provided', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    // Create a dummy image file
    const imagePath = join(workDir, 'screenshot.png');
    await writeFile(imagePath, Buffer.from('fake-image-data'));

    mockChatComplete.mockResolvedValueOnce({
      content: 'The UI shows a login form.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    await answerQuestion({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      question: 'What is this UI?',
      imagePath,
    });

    const qaContent = await readFile(join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'qa.md'), 'utf8');
    expect(qaContent).toContain('[image:screenshot.png]');
    expect(qaContent).toContain('- Source: screenshot');
  });

  it('throws AnswerError when application not found', async () => {
    await expect(
      answerQuestion({
        slug: 'nonexistent',
        campaign: 'test-campaign',
        question: 'Test?',
      }),
    ).rejects.toThrow(AnswerError);
  });

  it('throws AnswerError when profile not found', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, 'meta.md'), '---\nslug: test\nstatus: applied\n---\n');
    await writeFile(join(appDir, 'jd.md'), 'JD content');

    await expect(
      answerQuestion({
        slug,
        campaign: 'test-campaign',
        question: 'Test?',
      }),
    ).rejects.toThrow(AnswerError);
  });

  it('throws AnswerError on LLM failure', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockRejectedValueOnce(new Error('LLM timeout'));

    await expect(
      answerQuestion({
        slug: '2026-Jun-01-SE-Test-Corp',
        campaign: 'test-campaign',
        question: 'Test?',
      }),
    ).rejects.toThrow(AnswerError);
  });

  it('throws AnswerError on image read failure', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    await expect(
      answerQuestion({
        slug: '2026-Jun-01-SE-Test-Corp',
        campaign: 'test-campaign',
        question: 'Test?',
        imagePath: '/nonexistent/image.png',
      }),
    ).rejects.toThrow(AnswerError);
  });

  it('throws AnswerError when LLM refuses to answer', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: 'I cannot answer that question.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    await expect(
      answerQuestion({
        slug: '2026-Jun-01-SE-Test-Corp',
        campaign: 'test-campaign',
        question: 'Test?',
      }),
    ).rejects.toThrow(AnswerError);
  });

  it('detects various refusal patterns', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    const refusalPatterns = [
      'I cannot help with that.',
      "I'm just an AI assistant.",
      'As a language model, I cannot.',
      'As an AI assistant, I cannot.',
    ];

    for (const pattern of refusalPatterns) {
      mockChatComplete.mockResolvedValueOnce({
        content: pattern,
        model: 'gpt-4o',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        durationMs: 200,
      });

      await expect(
        answerQuestion({
          slug: '2026-Jun-01-SE-Test-Corp',
          campaign: 'test-campaign',
          question: 'Test?',
        }),
      ).rejects.toThrow(AnswerError);
    }
  });

  it('handles multiline answers correctly', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    const multilineAnswer = 'First line.\nSecond line.\nThird line.';
    mockChatComplete.mockResolvedValueOnce({
      content: multilineAnswer,
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    const result = await answerQuestion({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      question: 'Test?',
    });

    expect(result.answer).toBe(multilineAnswer);

    const qaContent = await readFile(join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'qa.md'), 'utf8');
    expect(qaContent).toContain('First line.');
    expect(qaContent).toContain('Second line.');
    expect(qaContent).toContain('Third line.');
    expect(qaContent).not.toContain('  > ');
  });

  it('stores the answer as plain text, not a blockquote', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: 'First paragraph.\n\nSecond paragraph.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    await answerQuestion({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      question: 'Test?',
    });

    const qaContent = await readFile(join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'qa.md'), 'utf8');
    // Plain answer body directly after "- Answer:" + blank line — no ">" anywhere.
    expect(qaContent).toContain('- Answer:\n\nFirst paragraph.');
    expect(qaContent).toContain('\n\nSecond paragraph.');
    expect(qaContent).not.toMatch(/^\s{0,3}>/m);
  });

  it('handles different image mime types', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    const imageTypes = [
      { ext: 'jpg', mime: 'image/jpeg' },
      { ext: 'jpeg', mime: 'image/jpeg' },
      { ext: 'gif', mime: 'image/gif' },
      { ext: 'webp', mime: 'image/webp' },
      { ext: 'png', mime: 'image/png' },
    ];

    for (const { ext, mime } of imageTypes) {
      const imagePath = join(workDir, `screenshot.${ext}`);
      await writeFile(imagePath, Buffer.from('fake-image-data'));

      mockChatComplete.mockResolvedValueOnce({
        content: `Image type: ${ext}`,
        model: 'gpt-4o',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        durationMs: 200,
      });

      await answerQuestion({
        slug: '2026-Jun-01-SE-Test-Corp',
        campaign: 'test-campaign',
        question: `What is in this ${ext}?`,
        imagePath,
      });

      // Verify the LLM was called with the correct mime type
      const callArgs = mockChatComplete.mock.calls[mockChatComplete.mock.calls.length - 1];
      expect(callArgs).toBeDefined();
      const messages = callArgs![0] as Array<{ role: string; content: unknown }>;
      const userMsg = messages.find((m) => m.role === 'user');
      if (userMsg && Array.isArray(userMsg.content)) {
        const imagePart = userMsg.content.find((p: { type: string }) => p.type === 'image_url') as
          | { image_url: { url: string } }
          | undefined;
        expect(imagePart?.image_url.url).toContain(mime);
      }
    }
  });

  it('throws AnswerError when JD file is missing', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });

    await writeFile(
      join(appDir, 'meta.md'),
      '---\nslug: ' +
        slug +
        '\ntitle: Software Engineer\ncompany: Test Corp\nstatus: applied\n---\n',
    );
    // No jd.md

    await expect(
      answerQuestion({
        slug,
        campaign: 'test-campaign',
        question: 'Test?',
      }),
    ).rejects.toThrow(AnswerError);
  });

  it('throws AnswerError when atomicWrite fails for qa.md', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: 'This is my answer.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    vi.spyOn(fsModule, 'atomicWrite').mockResolvedValueOnce(false);

    await expect(
      answerQuestion({
        slug: '2026-Jun-01-SE-Test-Corp',
        campaign: 'test-campaign',
        question: 'Test?',
      }),
    ).rejects.toThrow(AnswerError);
  });

  it('includes knowledge base context in the LLM message when KB docs exist', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    // Create a knowledge-base doc so loadKbContextForCampaign returns non-empty
    await mkdir(join(campaignRoot, 'knowledge-base'), { recursive: true });
    await writeFile(
      join(campaignRoot, 'knowledge-base', 'notes.md'),
      '# Project Notes\n\nThis is important background knowledge.',
    );

    mockChatComplete.mockResolvedValueOnce({
      content: 'I have extensive experience with TypeScript and React.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    await answerQuestion({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      question: 'Test?',
    });

    // Verify the LLM was called with KB content in the message
    const callArgs = mockChatComplete.mock.calls[0];
    expect(callArgs).toBeDefined();
    const messages = callArgs![0] as Array<{ role: string; content: unknown }>;
    const userMsg = messages.find((m) => m.role === 'user');
    expect(userMsg).toBeDefined();
    if (userMsg && Array.isArray(userMsg.content)) {
      const textPart = userMsg.content.find((p: { type: string }) => p.type === 'text');
      expect(textPart?.text).toContain('## Knowledge base:');
      expect(textPart?.text).toContain('Project Notes');
    } else if (userMsg && typeof userMsg.content === 'string') {
      expect(userMsg.content).toContain('## Knowledge base:');
      expect(userMsg.content).toContain('Project Notes');
    }
  });

  it('includes steer in the user message when provided', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: 'Answer with steer.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    await answerQuestion({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      question: 'Tell me about your experience.',
      steer: 'Focus on TypeScript projects only',
    });

    const messages = mockChatComplete.mock.calls[0]?.[0] as Array<{
      role: string;
      content: string;
    }>;
    const userMessage = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('## Additional instructions');
    expect(userMessage).toContain('Focus on TypeScript projects only');
  });

  it('writes steer line to qa.md entry when steer is provided', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: 'Answer with steer.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    await answerQuestion({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      question: 'Tell me about your experience.',
      steer: 'Emphasize React skills',
    });

    const qaContent = await readFile(join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'qa.md'), 'utf8');
    expect(qaContent).toContain('- Steer: Emphasize React skills');
  });

  it('does not write steer line when no steer is provided', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: 'Answer without steer.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    await answerQuestion({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      question: 'Tell me about your experience.',
    });

    const qaContent = await readFile(join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'qa.md'), 'utf8');
    expect(qaContent).not.toContain('- Steer:');
  });

  it('does not include Additional instructions section when no steer is provided', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    mockChatComplete.mockResolvedValueOnce({
      content: 'Answer without steer.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    await answerQuestion({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      question: 'Tell me about your experience.',
    });

    const messages = mockChatComplete.mock.calls[0]?.[0] as Array<{
      role: string;
      content: string;
    }>;
    const userMessage = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).not.toContain('## Additional instructions');
  });

  it('each answer stores its own steer independently', async () => {
    await setupApp('2026-Jun-01-SE-Test-Corp');

    // First answer with steer
    mockChatComplete.mockResolvedValueOnce({
      content: 'First answer.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    await answerQuestion({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      question: 'First question?',
      steer: 'First steer',
    });

    // Second answer with different steer
    mockChatComplete.mockResolvedValueOnce({
      content: 'Second answer.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });

    await answerQuestion({
      slug: '2026-Jun-01-SE-Test-Corp',
      campaign: 'test-campaign',
      question: 'Second question?',
      steer: 'Second steer',
    });

    const qaContent = await readFile(join(appliedDir, '2026-Jun-01-SE-Test-Corp', 'qa.md'), 'utf8');
    expect(qaContent).toContain('- Steer: First steer');
    expect(qaContent).toContain('- Steer: Second steer');
  });
});

describe('readQa', () => {
  let workDir: string;
  let campaignRoot: string;
  let appliedDir: string;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-qa-read-'));
    originalJhoData = process.env[JHO_DATA];
    process.env[JHO_DATA] = workDir;
    campaignRoot = join(workDir, 'campaigns', 'test-campaign');
    appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
  });

  afterEach(async () => {
    if (originalJhoData !== undefined) {
      process.env[JHO_DATA] = originalJhoData;
    } else {
      delete process.env[JHO_DATA];
    }
    await rm(workDir, { recursive: true, force: true });
  });

  it('reads existing Q&A file', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, 'qa.md'),
      '# Q&A — Software Engineer @ Test Corp\n\n## Question\n\nAnswer here.',
    );

    const content = await readQa('test-campaign', slug);
    expect(content).toContain('# Q&A — Software Engineer @ Test Corp');
    expect(content).toContain('Answer here.');
  });

  it('throws QaReadError when file is missing', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await mkdir(join(appliedDir, slug), { recursive: true });

    await expect(readQa('test-campaign', slug)).rejects.toThrow(QaReadError);
  });
});
