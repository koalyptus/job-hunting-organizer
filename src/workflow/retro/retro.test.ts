import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createApplication } from '../applications/applications.js';
import * as applicationsModule from '../applications/applications.js';
import { startRetro, appendRetro, showRetro } from './retro.js';
import { RetroError, RetroNotFoundError } from './retro-errors.js';
import * as kbContext from '../campaign/kb-context.js';
import { replaceRegion } from '../../core/parser/markers.js';

const { warnSpy, infoSpy, mockChatComplete } = vi.hoisted(() => ({
  warnSpy: vi.fn(),
  infoSpy: vi.fn(),
  mockChatComplete: vi.fn(),
}));

vi.mock('../../core/llm.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    chatComplete: (...args: unknown[]) => mockChatComplete(...args),
    defaultLlmConfig: vi.fn(() => ({
      baseUrl: 'https://api.test.com/v1',
      apiKey: '***',
      model: 'gpt-4o',
      timeoutMs: 300_000,
    })),
  };
});

vi.mock('../../lib/config/config.js', () => ({
  getConfig: vi.fn(() => ({
    global: {
      version: 1,
      dataRoot: '/tmp',
      llm: { baseUrl: 'https://config.com/v1', apiKey: '***', model: 'gpt-4' },
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

vi.mock('../../workflow/prompts.js', () => ({
  loadPromptTemplate: vi.fn(async () => ({ body: 'sys', temperature: 0.6 })),
}));

vi.mock('../../lib/logger/logger.js', () => ({
  moduleLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: infoSpy,
    warn: warnSpy,
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    })),
  })),
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
}));

describe('retro workflow branches', () => {
  let workDir: string;
  let campaignRoot: string;
  let appliedDir: string;
  let origData: string | undefined;

  beforeEach(async () => {
    mockChatComplete.mockReset();
    warnSpy.mockReset();
    infoSpy.mockReset();
    workDir = await mkdtemp(join(tmpdir(), 'jho-retro-wf-'));
    origData = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = workDir;
    campaignRoot = join(workDir, 'campaigns', 'test-campaign');
    appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
    await writeFile(
      join(campaignRoot, 'profile.md'),
      '# Profile\n## Target roles\n<!-- jho:target-roles -->\n',
    );
  });

  afterEach(async () => {
    if (origData !== undefined) {
      process.env['JHO_DATA'] = origData;
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
      replaceRegion('', 'fetched-jd', 'JD', { createIfMissing: true }),
    );
  }

  it('startRetro throws when weakTopics is empty (L391-392)', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    await writeFile(
      join(appliedDir, slug, 'jd.md'),
      '<!-- jho:start:fetched-jd -->JD<!-- jho:end:fetched-jd -->',
    );
    await expect(startRetro({ slug, campaign: 'test-campaign', weakTopics: [] })).rejects.toThrow(
      RetroError,
    );
  });

  it('startRetro empty weakTopics error path uses kb-context mock cleanly', async () => {
    // Ensures the kb-context branch is exercised without side effects when empty.
    vi.spyOn(kbContext, 'loadKbContextForCampaign').mockResolvedValue('');
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    await writeFile(
      join(appliedDir, slug, 'jd.md'),
      '<!-- jho:start:fetched-jd -->JD<!-- jho:end:fetched-jd -->',
    );
    await expect(startRetro({ slug, campaign: 'test-campaign', weakTopics: [] })).rejects.toThrow(
      RetroError,
    );
  });

  it('showRetro throws RetroNotFoundError when retro.md missing', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    await expect(showRetro('test-campaign', slug)).rejects.toThrow(RetroNotFoundError);
  });

  it('startRetro includes KB context when present (L333-334)', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await setupApp(slug);
    await mkdir(join(campaignRoot, 'knowledge-base'), { recursive: true });
    await writeFile(join(campaignRoot, 'knowledge-base', 'doc.md'), 'KB CONTENT');
    mockChatComplete.mockResolvedValueOnce({
      content: 'plan',
      model: 'm',
      durationMs: 10,
    });
    const result = await startRetro({ slug, campaign: 'test-campaign', weakTopics: ['SQL'] });
    expect(result.content).toBe('plan');
    const messages = mockChatComplete.mock.calls[0]?.[0] as Array<{ content: string }>;
    const userMsg = messages.find((m) => m.content.includes('KB CONTENT'))?.content ?? '';
    expect(userMsg).toContain('KB CONTENT');
  });

  it('appendRetro throws when prior retro has no sections (L533-534)', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await setupApp(slug);
    await writeFile(
      join(appliedDir, slug, 'retro.md'),
      '<!-- jho:retro -->\n# Retro — Eng @ Acme\nNo sections here',
    );
    await expect(
      appendRetro({ slug, campaign: 'test-campaign', weakTopics: ['SQL'] }),
    ).rejects.toThrow(/No retro sections/);
  });

  it('appendRetro preserves noCarryOver behavior (L546-551)', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await setupApp(slug);
    await writeFile(
      join(appliedDir, slug, 'retro.md'),
      '<!-- jho:retro -->\n# Retro — Eng @ Acme\n\n## Retro for interview: 2026-01-01 — Reflection [applied]\n- Date: 2026-01-01\n- Status at the time: applied\n\n### Weak topics\n\n- SQL\n\n### Learning plan\n\nplan\n\n### Other notes\n\nold notes',
    );
    mockChatComplete.mockResolvedValueOnce({
      content: 'new plan',
      model: 'm',
      durationMs: 10,
    });
    await appendRetro({
      slug,
      campaign: 'test-campaign',
      weakTopics: ['New topic'],
      noCarryOver: true,
    });
    const updated = await readFile(join(appliedDir, slug, 'retro.md'), 'utf8');
    const sections = updated.split('## Retro for interview:');
    expect(sections.length).toBeGreaterThanOrEqual(2);
    const newSection = sections[sections.length - 1]!;
    expect(newSection).toContain('New topic');
    expect(newSection).not.toContain('SQL');
    expect(newSection).not.toContain('old notes');
  });

  it('appendRetro maps readApplication failure to RetroError (L558-563)', async () => {
    const slug = '2026-Jun-01-SE-Test-Corp';
    await setupApp(slug);
    await writeFile(
      join(appliedDir, slug, 'retro.md'),
      '<!-- jho:retro -->\n# Retro — Eng @ Acme\n\n## Retro for interview: 2026-01-01 — Reflection [applied]\n- Date: 2026-01-01\n- Status at the time: applied\n\n### Weak topics\n\n- SQL\n\n### Learning plan\n\nplan',
    );
    vi.spyOn(applicationsModule, 'readApplication').mockRejectedValue(new Error('read fail'));
    await expect(
      appendRetro({ slug, campaign: 'test-campaign', weakTopics: ['New'] }),
    ).rejects.toThrow(/Failed to read application/);
  });

  it('appendRetro throws RetroNotFoundError when app missing (L558-560)', async () => {
    const slug = '2026-Jan-01-Nonexistent-Co';
    await mkdir(join(appliedDir, slug), { recursive: true });
    await writeFile(
      join(appliedDir, slug, 'retro.md'),
      '<!-- jho:retro -->\n# Retro — Eng @ Acme\n\n## Retro for interview: 2026-01-01 — Reflection [applied]\n- Date: 2026-01-01\n- Status at the time: applied\n\n### Weak topics\n\n- SQL\n\n### Learning plan\n\nplan',
    );
    await expect(
      appendRetro({ slug, campaign: 'test-campaign', weakTopics: ['topic1'] }),
    ).rejects.toThrow(RetroNotFoundError);
  });

  it('showRetro throws RetroNotFoundError when retro.md missing', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    await expect(showRetro('test-campaign', slug)).rejects.toThrow(RetroNotFoundError);
  });

  it('startRetro empty weakTopics error path uses kb-context mock cleanly', async () => {
    // Ensures the kb-context branch is exercised without side effects when empty.
    vi.spyOn(kbContext, 'loadKbContextForCampaign').mockResolvedValue('');
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    await writeFile(
      join(appliedDir, slug, 'jd.md'),
      '<!-- jho:start:fetched-jd -->JD<!-- jho:end:fetched-jd -->',
    );
    await expect(startRetro({ slug, campaign: 'test-campaign', weakTopics: [] })).rejects.toThrow(
      RetroError,
    );
  });
});
