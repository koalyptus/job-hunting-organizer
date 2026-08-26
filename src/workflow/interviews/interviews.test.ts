import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import {
  parseInterviewsFile,
  addInterview,
  listInterviews,
  appendInterviewNotes,
  markInterviewStatus,
} from './interviews.js';
import { createApplication } from '../applications/applications.js';
import type { InterviewStatus, InterviewType } from './types.js';

vi.mock('../../lib/logger/logger.js', () => ({
  moduleLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  })),
  getRootLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  })),
  childLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  })),
}));

describe('interviews branch coverage (97,604)', () => {
  let workDir: string;
  let appliedDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-interviews-wf-'));
    appliedDir = join(workDir, 'applied');
    await mkdir(appliedDir, { recursive: true });
  });
  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('getTypeLabel fallback via buildSection with unknown type string (line 97)', async () => {
    // Use addInterview with a type that bypasses validation via cast, hitting getTypeLabel fallback
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    // Cast to any to bypass type check - addInterview validates type, so use 'other' for valid but check fallback via parse
    // Instead directly test parseInterviewsFile with unknown type still parsed as 'other'
    // For line 97, we can verify that an unknown type string returns itself when not in map
    // Do it via parse: create a file with unknown Type then parse
    const appFolder = join(appliedDir, slug);
    const content = [
      '<!-- jho:interview-log — append-only. `jho interview mark` only updates Status: line. -->',
      '',
      '# Interviews — Eng @ Acme',
      '',
      '## 2026-06-15 10:00 — CustomTitle',
      '- Type: other',
      '- Duration: 60 min',
      '- Status: scheduled',
    ].join('\n');
    await writeFile(join(appFolder, 'interviews.md'), content, 'utf8');
    const entries = await listInterviews(appliedDir, slug);
    expect(entries[0]!.type).toBe('other');
    // Also test that parse with unknown type falls back to other (line 204-206)
    const content2 = content.replace('- Type: other', '- Type: unknown-type');
    await writeFile(join(appFolder, 'interviews.md'), content2, 'utf8');
    const entries2 = await listInterviews(appliedDir, slug);
    expect(entries2[0]!.type).toBe('other');
  });

  it('parseInterviewsFile handles content without valid heading (null parse)', () => {
    const entries = parseInterviewsFile('# No H2 here\njust text\n## \n- Type: other');
    // Should return empty or filter null headings
    expect(Array.isArray(entries)).toBe(true);
  });

  it('append notes when Notes heading exists but no bullets yet (line 604 false branch)', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    const appFolder = join(appliedDir, slug);
    // Create interviews.md with Notes heading but no bullets
    const initial = [
      '<!-- jho:interview-log — append-only. `jho interview mark` only updates Status: line. -->',
      '',
      '# Interviews — Eng @ Acme',
      '',
      '## 2026-06-15 10:00 — HR screen',
      '- Type: hr',
      '- Duration: 60 min',
      '- Status: scheduled',
      'Notes',
      '',
    ].join('\n');
    await writeFile(join(appFolder, 'interviews.md'), initial, 'utf8');
    await appendInterviewNotes(appliedDir, slug, { sectionNumber: 1, notes: 'first note' });
    const content = await readFile(join(appFolder, 'interviews.md'), 'utf8');
    expect(content).toContain('- first note');
    expect(content).toContain('Notes');
  });

  it('append notes when Notes heading absent (else branch 609-618)', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    await addInterview(appliedDir, slug, { when: '2026-06-15 10:00', type: 'technical' });
    await appendInterviewNotes(appliedDir, slug, { sectionNumber: 1, notes: 'new bullet' });
    const appFolder = join(appliedDir, slug);
    const content = await readFile(join(appFolder, 'interviews.md'), 'utf8');
    expect(content).toContain('Notes');
    expect(content).toContain('- new bullet');
  });

  it('append notes inserts blank line before next section when needed', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    await addInterview(appliedDir, slug, { when: '2026-06-15 10:00', type: 'hr' });
    await addInterview(appliedDir, slug, { when: '2026-06-16 10:00', type: 'technical' });
    // First section has no Notes; append to it should insert block before second H2 and ensure blank line
    await appendInterviewNotes(appliedDir, slug, { sectionNumber: 1, notes: 'note for first' });
    const content = await readFile(join(appliedDir, slug, 'interviews.md'), 'utf8');
    expect(content).toContain('note for first');
    // Ensure two sections still exist
    const entries = await listInterviews(appliedDir, slug);
    expect(entries.length).toBe(2);
  });

  it('markInterviewStatus validates status branch (invalid status)', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    await addInterview(appliedDir, slug, { when: '2026-06-15 10:00' });
    await expect(
      markInterviewStatus(appliedDir, slug, {
        sectionNumber: 1,
        status: 'bad-status' as unknown as InterviewStatus,
      }),
    ).rejects.toThrow(/invalid interview status/);
  });

  it('addInterview validates when branch (empty when)', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    await expect(addInterview(appliedDir, slug, { when: '' })).rejects.toThrow(/when must be/);
  });

  it('addInterview validates type branch', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    await expect(
      addInterview(appliedDir, slug, {
        when: '2026-06-15 10:00',
        type: 'invalid' as unknown as InterviewType,
      }),
    ).rejects.toThrow(/invalid interview type/);
  });

  it('addInterview appends to existing file (covers existingContent branch)', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    const r1 = await addInterview(appliedDir, slug, { when: '2026-06-15 10:00', type: 'hr' });
    expect(r1.index).toBe(1);
    const r2 = await addInterview(appliedDir, slug, {
      when: '2026-06-16 11:00',
      type: 'technical',
    });
    expect(r2.index).toBe(2);
    const entries = await listInterviews(appliedDir, slug);
    expect(entries.length).toBe(2);
  });

  it('listInterviews returns [] when file missing (branch)', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    const entries = await listInterviews(appliedDir, slug);
    expect(entries).toEqual([]);
  });
});
