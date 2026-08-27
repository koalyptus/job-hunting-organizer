import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { repairApp, repairAll } from './repair.js';
import { createApplication } from '../applications/applications.js';
import { computeHash, writeToolhash } from '../../lib/toolhash.js';

const mockLog = vi.hoisted(() => ({
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
}));
vi.mock('../../lib/logger/logger.js', () => ({
  moduleLogger: vi.fn(() => mockLog),
  getRootLogger: vi.fn(() => mockLog),
  childLogger: vi.fn(() => mockLog),
}));

describe('repair branch coverage 38-139,225-226', () => {
  let workDir: string;
  let appliedDir: string;
  let campaignRoot: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-repair-wf-'));
    campaignRoot = workDir;
    appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('throws RepairError when application folder missing (line 38-52)', async () => {
    await expect(repairApp(appliedDir, '2026-Jun-01-SE-Missing')).rejects.toThrow(
      /application folder not found/,
    );
  });

  it('skips toolhash when updateToolhash false (branch 60)', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    const result = await repairApp(appliedDir, slug, {
      updateToolhash: false,
      syncInterviewStatus: false,
    });
    expect(result.actions).toEqual([]);
  });

  it('skips status sync when syncInterviewStatus false', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    await writeFile(
      join(appliedDir, slug, 'interviews.md'),
      '<!-- marker -->\n# Interviews\n\n## 2026-06-15 — HR\n- Status: scheduled\n',
      'utf8',
    );
    const result = await repairApp(appliedDir, slug, { syncInterviewStatus: false });
    expect(result.actions.find((a) => a.action === 'status_promoted')).toBeUndefined();
  });

  it('migrates legacy sidecar (migrated branch 77-82)', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    const metaPath = join(appliedDir, slug, 'meta.md');
    const content = await readFile(metaPath, 'utf8');
    const hash = computeHash(content);
    const legacyPath = `${metaPath}.toolhash`;
    await writeFile(legacyPath, hash, 'utf8');
    const result = await repairApp(appliedDir, slug);
    expect(
      result.actions.some(
        (a) => a.action === 'toolhash_migrated' || a.action === 'toolhash_updated',
      ),
    ).toBe(true);
  });

  it('cleans redundant legacy sidecar (cleaned branch 83-88)', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    const metaPath = join(appliedDir, slug, 'meta.md');
    const content = await readFile(metaPath, 'utf8');
    const hash = computeHash(content);
    await writeToolhash(metaPath, hash);
    await writeFile(`${metaPath}.toolhash`, hash, 'utf8');
    const result = await repairApp(appliedDir, slug);
    expect(result.actions.some((a) => a.action === 'toolhash_cleaned')).toBe(true);
  });

  it('updates toolhash sidecar (toolhash_updated branch 91-97)', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    const result = await repairApp(appliedDir, slug, { syncInterviewStatus: false });
    expect(result.actions.some((a) => a.action === 'toolhash_updated')).toBe(true);
  });

  it('promotes applied -> interview when interviews.md has entries', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
      status: 'applied',
    });
    await writeFile(
      join(appliedDir, slug, 'interviews.md'),
      '# Interviews\n\n## 2026-06-15 — HR\n- Type: hr\n- Status: scheduled\n',
      'utf8',
    );
    const result = await repairApp(appliedDir, slug);
    expect(result.actions.some((a) => a.action === 'status_promoted')).toBe(true);
  });

  it('does not promote when status already interview (no regression)', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
      status: 'interview',
    });
    await writeFile(
      join(appliedDir, slug, 'interviews.md'),
      '# Interviews\n\n## 2026-06-15 — HR\n- Status: scheduled\n',
      'utf8',
    );
    const result = await repairApp(appliedDir, slug);
    expect(result.actions.find((a) => a.action === 'status_promoted')).toBeUndefined();
  });

  it('repairAll creates missing applied dir (line 161)', async () => {
    const { existsSync } = await import('node:fs');
    await rm(appliedDir, { recursive: true, force: true });
    expect(existsSync(appliedDir)).toBe(false);
    const result = await repairAll(campaignRoot);
    expect(existsSync(appliedDir)).toBe(true);
    expect(result.actions.some((a) => a.action === 'applied_dir_created')).toBe(true);
    expect(result.isIndexRebuilt).toBe(true);
  });

  it('repairAll rebuilds counters when suffix present (needsUpdate true)', async () => {
    await createApplication({ appliedDir, title: 'Eng', company: 'Acme', appliedOn: '2026-06-01' });
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(appliedDir);
    const firstSlug = entries.find((e) => e.startsWith('2026-Jun-01'))!;
    const base = firstSlug.replace(/-\d+$/, '');
    await mkdir(join(appliedDir, `${base}-1`), { recursive: true });
    await writeFile(
      join(appliedDir, `${base}-1`, 'meta.md'),
      `---\nslug: "${base}-1"\nstatus: "applied"\nappliedOn: "2026-06-01"\n---\n`,
      'utf8',
    );
    const result = await repairAll(campaignRoot);
    expect(result.actions.some((a) => a.action === 'counters_rebuilt')).toBe(true);
  });

  it('repairAll rebuilds index and returns isIndexRebuilt true', async () => {
    await createApplication({ appliedDir, title: 'Eng', company: 'Acme', appliedOn: '2026-06-01' });
    const result = await repairAll(campaignRoot);
    expect(result.isIndexRebuilt).toBe(true);
    expect(result.actions.find((a) => a.action === 'index_rebuilt')).toBeTruthy();
  });
});
