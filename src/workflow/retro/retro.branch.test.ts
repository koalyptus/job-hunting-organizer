/* eslint-disable @typescript-eslint/consistent-type-imports */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { createApplication } from '../applications/applications.js';
import * as kbContextRetro from '../../workflow/campaign/kb-context.js';
import * as appModuleRetro from '../applications/applications.js';
import { startRetro, appendRetro } from './retro.js';

vi.mock('../../core/llm.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/llm.js')>();
  return {
    ...actual,
    chatComplete: vi.fn().mockResolvedValue({ content: 'plan', model: 'm', durationMs: 10 }),
    defaultLlmConfig: vi.fn(() => ({ baseUrl: 'http://x', apiKey: 'k', model: 'm' })),
  };
});
vi.mock('../prompts.js', () => ({
  loadPromptTemplate: vi.fn().mockResolvedValue({ body: 'system', temperature: 0.6 }),
}));

describe('retro branch coverage (333-334,533-534,558-563)', () => {
  let tmpRoot: string;
  let campaignRoot: string;
  let appliedDir: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'jho-retro-branch-'));
    process.env['JHO_CONFIG_HOME'] = join(tmpRoot, '.jho');
    process.env['JHO_DATA'] = join(tmpRoot, 'data');
    campaignRoot = join(tmpRoot, 'data', 'campaigns', 'default');
    appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
    await mkdir(join(tmpRoot, '.jho'), { recursive: true });
    await writeFile(
      join(tmpRoot, '.jho', 'config.json'),
      JSON.stringify({ llm: { provider: 'ollama', model: 'test' } }),
      'utf8',
    );
    await writeFile(join(campaignRoot, 'config.json'), JSON.stringify({}), 'utf8');
    await writeFile(join(campaignRoot, 'profile.md'), '# Profile\n');
  });

  afterEach(async () => {
    delete process.env['JHO_CONFIG_HOME'];
    delete process.env['JHO_DATA'];
    await rm(tmpRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('generateLearningPlan includes kb when present (333-334)', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
      url: 'https://example.com',
    });
    await writeFile(
      join(appliedDir, slug, 'jd.md'),
      '<!-- jho:start:fetched-jd -->JD<!-- jho:end:fetched-jd -->',
    );
    
    vi.spyOn(kbContextRetro, 'loadKbContextForCampaign').mockResolvedValue('KB CONTENT');
    
    const result = await startRetro({ slug, campaign: 'default', weakTopics: ['SQL'], notes: '' });
    expect(result.content).toBe('plan');
  });

  it('appendRetro throws when priorSections empty (533-534)', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    await writeFile(
      join(appliedDir, slug, 'retro.md'),
      '<!-- jho:retro -->\n# Retro — Eng @ Acme\nNo sections here',
    );
    
    await expect(appendRetro({ slug, campaign: 'default', weakTopics: ['SQL'] })).rejects.toThrow(
      /No retro sections/,
    );
  });

  it('appendRetro handles readApplication throw as RetroError (558-563)', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    await writeFile(
      join(appliedDir, slug, 'retro.md'),
      '<!-- jho:retro -->\n# Retro — Eng @ Acme\n\n## Retro for interview: 2026-01-01 — Reflection [applied]\n- Date: 2026-01-01\n- Status at the time: applied\n\n### Weak topics\n\n- SQL\n\n### Learning plan\n\nplan',
    );
    
    vi.spyOn(appModuleRetro, 'readApplication').mockRejectedValue(new Error('read fail'));
    
    await expect(appendRetro({ slug, campaign: 'default', weakTopics: ['New'] })).rejects.toThrow(
      /Failed to read application/,
    );
  });
});
