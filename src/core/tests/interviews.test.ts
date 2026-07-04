import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { atomicWrite } from '../fs.js';
import { readApplication } from '../applications/applications.js';
import {
  addInterview,
  listInterviews,
  markInterviewStatus,
  appendInterviewNotes,
  parseInterviewsFile,
  InterviewError,
  INTERVIEW_TYPES,
  INTERVIEW_STATUSES,
} from '../interviews/index.js';

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

// Wrap atomicWrite in a spy so per-test mockResolvedValue works for write-failure tests.
vi.mock('../fs.js', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../fs.js')>('../fs.js');
  return {
    ...actual,
    atomicWrite: vi.fn(actual.atomicWrite),
  };
});

// Wrap readApplication so we can inject errors for the catch-all test.
vi.mock('../applications/applications.js', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../applications/applications.js')>(
    '../applications/applications.js',
  );
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

describe('parseInterviewsFile', () => {
  it('parses a single H2 section', () => {
    const content = [
      '<!-- jho:interview-log ... -->',
      '',
      '# Interviews — SE @ Foo',
      '',
      '## 2026-06-10 10:00 — Technical [scheduled]',
      '',
      '- Type: technical',
      '- Duration: 60 min',
      '- Status: scheduled',
      '',
    ].join('\n');

    const entries = parseInterviewsFile(content);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.index).toBe(1);
    expect(entries[0]!.when).toBe('2026-06-10 10:00');
    expect(entries[0]!.title).toBe('Technical');
    expect(entries[0]!.type).toBe('technical');
    expect(entries[0]!.status).toBe('scheduled');
    expect(entries[0]!.duration).toBe(60);
  });

  it('parses multiple sections in order', () => {
    const content = [
      '# Interviews — SE @ Foo',
      '',
      '## 2026-06-10 10:00 — Technical [scheduled]',
      '',
      '- Type: technical',
      '- Duration: 60 min',
      '- Status: scheduled',
      '',
      '## 2026-06-17 14:00 — HR screen [completed]',
      '',
      '- Type: hr',
      '- Duration: 30 min',
      '- Status: completed',
      '',
    ].join('\n');

    const entries = parseInterviewsFile(content);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.index).toBe(1);
    expect(entries[0]!.when).toBe('2026-06-10 10:00');
    expect(entries[0]!.title).toBe('Technical');
    expect(entries[1]!.index).toBe(2);
    expect(entries[1]!.title).toBe('HR screen');
    expect(entries[1]!.type).toBe('hr');
    expect(entries[1]!.status).toBe('completed');
  });

  it('parses optional fields (Interviewers, Location, Topics, Notes)', () => {
    const content = [
      '# Interviews — SE @ Foo',
      '',
      '## 2026-06-10 10:00 — Technical [scheduled]',
      '',
      '- Type: technical',
      '- Duration: 60 min',
      '- Interviewers: A. Smith',
      '- Location: Google Meet',
      '- Status: scheduled',
      '- Topics: distributed systems',
      '- Notes: focus on concurrency',
      '',
    ].join('\n');

    const entries = parseInterviewsFile(content);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.interviewers).toBe('A. Smith');
    expect(entries[0]!.location).toBe('Google Meet');
    expect(entries[0]!.topics).toBe('distributed systems');
    expect(entries[0]!.notes).toBe('focus on concurrency');
  });

  it('returns empty array for content with no H2 sections', () => {
    const content = '# Only header\n\nSome text.\n';
    expect(parseInterviewsFile(content)).toEqual([]);
  });

  it('returns empty array for empty content', () => {
    expect(parseInterviewsFile('')).toEqual([]);
  });

  it('parses heading bracket status separately from Status field', () => {
    const content = [
      '# Interviews — SE @ Foo',
      '',
      '## 2026-06-10 10:00 — Technical [scheduled]',
      '',
      '- Type: technical',
      '- Duration: 60 min',
      '- Status: passed',
      '',
    ].join('\n');

    const entries = parseInterviewsFile(content);
    expect(entries).toHaveLength(1);
    // The bracket status is mapped initially, then overridden by the Status field
    expect(entries[0]!.status).toBe('passed');
  });

  it('includes unknown fields as empty strings', () => {
    const content = [
      '# Interviews — SE @ Foo',
      '',
      '## 2026-06-10 10:00 — Technical [scheduled]',
      '',
      '- Type: technical',
      '- Duration: 60 min',
      '- Status: scheduled',
      '',
    ].join('\n');

    const entries = parseInterviewsFile(content);
    expect(entries[0]!.interviewers).toBe('');
    expect(entries[0]!.location).toBe('');
    expect(entries[0]!.topics).toBe('');
    expect(entries[0]!.notes).toBe('');
  });

  it('skips a malformed H2 heading without bracket', () => {
    const content = [
      '# Interviews — SE @ Foo',
      '',
      '## 2026-06-10 10:00 — Technical',
      '',
      '- Type: technical',
      '- Duration: 60 min',
      '- Status: scheduled',
      '',
    ].join('\n');

    const entries = parseInterviewsFile(content);
    expect(entries).toHaveLength(0);
  });

  it('uses default duration for non-matching value', () => {
    const content = [
      '# Interviews — SE @ Foo',
      '',
      '## 2026-06-10 10:00 — Technical [scheduled]',
      '',
      '- Type: technical',
      '- Duration: N/A',
      '- Status: scheduled',
      '',
    ].join('\n');

    const entries = parseInterviewsFile(content);
    expect(entries[0]!.duration).toBe(60);
  });
});

describe('addInterview', () => {
  let workDir: string;
  let appliedDir: string;
  const slug = 'test-app';

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-interview-add-'));
    appliedDir = join(workDir, 'applied');
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('creates interviews.md with section marker and header', async () => {
    await addInterview(appliedDir, slug, {
      when: '2026-06-10 10:00',
      type: 'technical',
    });

    const content = await readFile(join(appliedDir, slug, 'interviews.md'), 'utf8');
    expect(content).toContain('<!-- jho:interview-log');
    expect(content).toContain('# Interviews — Software Engineer @ Foo Inc');
    expect(content).toContain('## 2026-06-10 10:00 — Technical [scheduled]');
  });

  it('appends sequential sections with correct index', async () => {
    const result1 = await addInterview(appliedDir, slug, {
      when: '2026-06-10 10:00',
      type: 'technical',
    });
    expect(result1.index).toBe(1);

    const result2 = await addInterview(appliedDir, slug, {
      when: '2026-06-17 14:00',
      type: 'hr',
    });
    expect(result2.index).toBe(2);

    const entries = await listInterviews(appliedDir, slug);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.index).toBe(1);
    expect(entries[1]!.index).toBe(2);
  });

  it('writes all provided field lines', async () => {
    await addInterview(appliedDir, slug, {
      when: '2026-06-10 10:00',
      type: 'technical',
      duration: 90,
      interviewers: 'A. Smith',
      location: 'Google Meet',
      status: 'scheduled',
      topics: 'distributed systems, concurrency',
      notes: 'Prepare system design examples',
    });

    const content = await readFile(join(appliedDir, slug, 'interviews.md'), 'utf8');
    expect(content).toContain('- Type: technical');
    expect(content).toContain('- Duration: 90 min');
    expect(content).toContain('- Interviewers: A. Smith');
    expect(content).toContain('- Location: Google Meet');
    expect(content).toContain('- Status: scheduled');
    expect(content).toContain('- Topics: distributed systems, concurrency');
    expect(content).toContain('- Notes: Prepare system design examples');
  });

  it('omits optional fields when not provided', async () => {
    await addInterview(appliedDir, slug, {
      when: '2026-06-10 10:00',
      type: 'technical',
    });

    const content = await readFile(join(appliedDir, slug, 'interviews.md'), 'utf8');
    expect(content).not.toContain('- Interviewers:');
    expect(content).not.toContain('- Location:');
    expect(content).not.toContain('- Topics:');
    expect(content).not.toContain('- Notes:');
    // Duration is always written
    expect(content).toContain('- Duration:');
  });

  it('uses custom title when provided', async () => {
    await addInterview(appliedDir, slug, {
      when: '2026-06-10 10:00',
      type: 'technical',
      title: 'System design round',
    });

    const content = await readFile(join(appliedDir, slug, 'interviews.md'), 'utf8');
    expect(content).toContain('## 2026-06-10 10:00 — System design round [scheduled]');
  });

  it('uses defaults for type, duration, and status', async () => {
    await addInterview(appliedDir, slug, {
      when: '2026-06-10 10:00',
    });

    const entries = await listInterviews(appliedDir, slug);
    expect(entries[0]!.type).toBe('technical');
    expect(entries[0]!.duration).toBe(60);
    expect(entries[0]!.status).toBe('scheduled');
  });

  it('throws InterviewNotFoundError for missing slug', async () => {
    await expect(
      addInterview(appliedDir, 'nonexistent', { when: '2026-06-10 10:00' }),
    ).rejects.toThrow(InterviewError);
  });

  it('throws InterviewError for empty when', async () => {
    await expect(addInterview(appliedDir, slug, { when: '', type: 'technical' })).rejects.toThrow(
      InterviewError,
    );
  });

  it('throws InterviewError for when with newlines', async () => {
    await expect(
      addInterview(appliedDir, slug, { when: '2026-06-10\n10:00', type: 'technical' }),
    ).rejects.toThrow(InterviewError);
  });

  it('throws InterviewError for invalid type', async () => {
    await expect(
      addInterview(appliedDir, slug, { when: '2026-06-10 10:00', type: 'invalid-type' as never }),
    ).rejects.toThrow(InterviewError);
  });

  it('throws InterviewError for invalid status', async () => {
    await expect(
      addInterview(appliedDir, slug, { when: '2026-06-10 10:00', status: 'invalid' as never }),
    ).rejects.toThrow(InterviewError);
  });

  it('throws InterviewError when readApplication fails with unexpected error', async () => {
    vi.mocked(readApplication).mockRejectedValueOnce(new Error('disk failure'));

    await expect(addInterview(appliedDir, slug, { when: '2026-06-10 10:00' })).rejects.toThrow(
      InterviewError,
    );
  });

  it('throws InterviewError when readApplication throws a non-Error value', async () => {
    vi.mocked(readApplication).mockRejectedValueOnce('corrupt data');

    await expect(addInterview(appliedDir, slug, { when: '2026-06-10 10:00' })).rejects.toThrow(
      InterviewError,
    );
  });

  it('throws InterviewError on write failure', async () => {
    vi.mocked(atomicWrite).mockResolvedValueOnce(false);

    await expect(
      addInterview(appliedDir, slug, { when: '2026-06-10 10:00', type: 'technical' }),
    ).rejects.toThrow(InterviewError);
  });
});

describe('listInterviews', () => {
  let workDir: string;
  let appliedDir: string;
  const slug = 'test-app';

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-interview-list-'));
    appliedDir = join(workDir, 'applied');
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('returns all entries in document order', async () => {
    await addInterview(appliedDir, slug, { when: '2026-06-10 10:00', type: 'technical' });
    await addInterview(appliedDir, slug, { when: '2026-06-17 14:00', type: 'hr' });
    await addInterview(appliedDir, slug, { when: '2026-06-24 09:00', type: 'final' });

    const entries = await listInterviews(appliedDir, slug);
    expect(entries).toHaveLength(3);
    expect(entries[0]!.when).toBe('2026-06-10 10:00');
    expect(entries[0]!.type).toBe('technical');
    expect(entries[1]!.when).toBe('2026-06-17 14:00');
    expect(entries[1]!.type).toBe('hr');
    expect(entries[2]!.when).toBe('2026-06-24 09:00');
    expect(entries[2]!.type).toBe('final');
  });

  it('returns empty array when file does not exist', async () => {
    const entries = await listInterviews(appliedDir, slug);
    expect(entries).toEqual([]);
  });
});

describe('markInterviewStatus', () => {
  let workDir: string;
  let appliedDir: string;
  const slug = 'test-app';

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-interview-mark-'));
    appliedDir = join(workDir, 'applied');
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);
    await addInterview(appliedDir, slug, { when: '2026-06-10 10:00', type: 'technical' });
    await addInterview(appliedDir, slug, { when: '2026-06-17 14:00', type: 'hr' });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('updates the Status line for the specified section', async () => {
    await markInterviewStatus(appliedDir, slug, { sectionNumber: 1, status: 'passed' });

    const entries = await listInterviews(appliedDir, slug);
    expect(entries[0]!.status).toBe('passed');
    expect(entries[1]!.status).toBe('scheduled');
  });

  it('does not update the H2 heading bracket status', async () => {
    await markInterviewStatus(appliedDir, slug, { sectionNumber: 1, status: 'passed' });

    const content = await readFile(join(appliedDir, slug, 'interviews.md'), 'utf8');
    // Heading still shows the original [scheduled], only the Status line changed
    expect(content).toContain('## 2026-06-10 10:00 — Technical [scheduled]');
    expect(content).toContain('- Status: passed');
  });

  it('throws InterviewError for out-of-bounds section number', async () => {
    await expect(
      markInterviewStatus(appliedDir, slug, { sectionNumber: 99, status: 'passed' }),
    ).rejects.toThrow(InterviewError);
  });

  it('throws InterviewError for invalid status', async () => {
    await expect(
      markInterviewStatus(appliedDir, slug, { sectionNumber: 1, status: 'invalid' as never }),
    ).rejects.toThrow(InterviewError);
  });

  it('throws InterviewError when interviews.md does not exist', async () => {
    const noInterviewsSlug = 'no-interviews';
    const noInterviewsDir = join(appliedDir, noInterviewsSlug);
    await mkdir(noInterviewsDir, { recursive: true });
    await writeMetaMd(noInterviewsDir, noInterviewsSlug);

    await expect(
      markInterviewStatus(appliedDir, noInterviewsSlug, { sectionNumber: 1, status: 'passed' }),
    ).rejects.toThrow(InterviewError);
  });

  it('throws InterviewError when section has no Status line', async () => {
    const content = [
      '<!-- jho:interview-log ... -->',
      '',
      '# Interviews — SE @ Foo',
      '',
      '## 2026-06-10 10:00 — Technical [scheduled]',
      '',
      '- Type: technical',
      '- Duration: 60 min',
      '',
    ].join('\n');
    await writeFile(join(appliedDir, slug, 'interviews.md'), content);

    await expect(
      markInterviewStatus(appliedDir, slug, { sectionNumber: 1, status: 'passed' }),
    ).rejects.toThrow(InterviewError);
  });

  it('throws InterviewError when Status line comes after next H2 heading', async () => {
    const content = [
      '<!-- jho:interview-log ... -->',
      '',
      '# Interviews — SE @ Foo',
      '',
      '## 2026-06-10 10:00 — Technical [scheduled]',
      '',
      '- Type: technical',
      '- Duration: 60 min',
      '',
      '## 2026-06-17 14:00 — HR [scheduled]',
      '',
      '- Type: hr',
      '- Duration: 30 min',
      '- Status: scheduled',
      '',
    ].join('\n');
    await writeFile(join(appliedDir, slug, 'interviews.md'), content);

    await expect(
      markInterviewStatus(appliedDir, slug, { sectionNumber: 1, status: 'passed' }),
    ).rejects.toThrow(InterviewError);
  });

  it('throws InterviewError on write failure', async () => {
    vi.mocked(atomicWrite).mockResolvedValueOnce(false);

    await expect(
      markInterviewStatus(appliedDir, slug, { sectionNumber: 1, status: 'passed' }),
    ).rejects.toThrow(InterviewError);
  });
});

describe('appendInterviewNotes', () => {
  let workDir: string;
  let appliedDir: string;
  const slug = 'test-app';

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-interview-notes-'));
    appliedDir = join(workDir, 'applied');
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);
    await addInterview(appliedDir, slug, {
      when: '2026-06-10 10:00',
      type: 'technical',
      notes: 'Initial prep done.',
    });
    await addInterview(appliedDir, slug, { when: '2026-06-17 14:00', type: 'hr' });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('appends to the existing Notes line', async () => {
    await appendInterviewNotes(appliedDir, slug, {
      sectionNumber: 1,
      notes: 'Review system design patterns',
    });

    const entries = await listInterviews(appliedDir, slug);
    expect(entries[0]!.notes).toMatch(/Initial prep done\./);
    expect(entries[0]!.notes).toMatch(/Review system design patterns/);
  });

  it('creates a Notes line when missing', async () => {
    await appendInterviewNotes(appliedDir, slug, {
      sectionNumber: 2,
      notes: 'Prepare behavioural stories',
    });

    const entries = await listInterviews(appliedDir, slug);
    expect(entries[1]!.notes).toContain('Prepare behavioural stories');
  });

  it('does not affect other sections', async () => {
    await appendInterviewNotes(appliedDir, slug, {
      sectionNumber: 1,
      notes: 'More notes for section 1',
    });

    const entries = await listInterviews(appliedDir, slug);
    expect(entries[0]!.notes).toContain('More notes for section 1');
    expect(entries[1]!.notes).toBe('');
  });

  it('throws InterviewError for out-of-bounds index', async () => {
    await expect(
      appendInterviewNotes(appliedDir, slug, { sectionNumber: 99, notes: 'oops' }),
    ).rejects.toThrow(InterviewError);
  });

  it('throws InterviewError when interviews.md does not exist', async () => {
    const noInterviewsSlug = 'no-notes';
    const noInterviewsDir = join(appliedDir, noInterviewsSlug);
    await mkdir(noInterviewsDir, { recursive: true });
    await writeMetaMd(noInterviewsDir, noInterviewsSlug);

    await expect(
      appendInterviewNotes(appliedDir, noInterviewsSlug, { sectionNumber: 1, notes: 'oops' }),
    ).rejects.toThrow(InterviewError);
  });

  it('throws InterviewError on write failure', async () => {
    vi.mocked(atomicWrite).mockResolvedValueOnce(false);

    await expect(
      appendInterviewNotes(appliedDir, slug, { sectionNumber: 1, notes: 'more notes' }),
    ).rejects.toThrow(InterviewError);
  });

  it('appends with single space separator when existing notes end with semicolon', async () => {
    // Manually set notes ending with semicolon
    const content = await readFile(join(appliedDir, slug, 'interviews.md'), 'utf8');
    const patched = content.replace('- Notes: Initial prep done.', '- Notes: Initial prep done;');
    await writeFile(join(appliedDir, slug, 'interviews.md'), patched);

    await appendInterviewNotes(appliedDir, slug, { sectionNumber: 1, notes: 'Review patterns' });

    const entries = await listInterviews(appliedDir, slug);
    expect(entries[0]!.notes).toContain('Initial prep done;');
    expect(entries[0]!.notes).toContain('Review patterns');
    // Should NOT have double separator
    expect(entries[0]!.notes).not.toMatch(/;\s*;/);
  });

  it('appends with semicolon-space separator when existing notes have no trailing punctuation', async () => {
    // Manually strip trailing punctuation from notes
    const content = await readFile(join(appliedDir, slug, 'interviews.md'), 'utf8');
    const patched = content.replace('- Notes: Initial prep done.', '- Notes: Initial prep done');
    await writeFile(join(appliedDir, slug, 'interviews.md'), patched);

    await appendInterviewNotes(appliedDir, slug, { sectionNumber: 1, notes: 'Review patterns' });

    const entries = await listInterviews(appliedDir, slug);
    expect(entries[0]!.notes).toMatch(/Initial prep done; Review patterns/);
  });
});

describe('round-trip: add → list → mark → list → notes → list', () => {
  let workDir: string;
  let appliedDir: string;
  const slug = 'roundtrip-app';

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-interview-rt-'));
    appliedDir = join(workDir, 'applied');
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('composes all operations correctly', async () => {
    // Add two interviews
    await addInterview(appliedDir, slug, {
      when: '2026-06-10 10:00',
      type: 'technical',
      notes: 'Initial notes',
    });
    await addInterview(appliedDir, slug, { when: '2026-06-17 14:00', type: 'hr' });

    let entries = await listInterviews(appliedDir, slug);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.status).toBe('scheduled');
    expect(entries[1]!.status).toBe('scheduled');

    // Mark first as passed
    await markInterviewStatus(appliedDir, slug, { sectionNumber: 1, status: 'passed' });

    entries = await listInterviews(appliedDir, slug);
    expect(entries[0]!.status).toBe('passed');
    expect(entries[1]!.status).toBe('scheduled');

    // Append notes to second
    await appendInterviewNotes(appliedDir, slug, { sectionNumber: 2, notes: 'Prepare stories' });

    entries = await listInterviews(appliedDir, slug);
    expect(entries[0]!.notes).toContain('Initial notes');
    expect(entries[1]!.notes).toContain('Prepare stories');

    // Verify file is well-formed and parsable
    const content = await readFile(join(appliedDir, slug, 'interviews.md'), 'utf8');
    const reparsed = parseInterviewsFile(content);
    expect(reparsed).toHaveLength(2);
    expect(reparsed[0]!.status).toBe('passed');
    expect(reparsed[1]!.status).toBe('scheduled');
  });
});

describe('INTERVIEW_TYPES and INTERVIEW_STATUSES', () => {
  it('exports valid interview types', () => {
    expect(INTERVIEW_TYPES).toContain('technical');
    expect(INTERVIEW_TYPES).toContain('hr');
    expect(INTERVIEW_TYPES).toContain('system-design');
    expect(INTERVIEW_TYPES).toContain('behavioural');
    expect(INTERVIEW_TYPES).toContain('take-home');
    expect(INTERVIEW_TYPES).toContain('final');
    expect(INTERVIEW_TYPES).toContain('other');
  });

  it('exports valid interview statuses', () => {
    expect(INTERVIEW_STATUSES).toContain('scheduled');
    expect(INTERVIEW_STATUSES).toContain('completed');
    expect(INTERVIEW_STATUSES).toContain('passed');
    expect(INTERVIEW_STATUSES).toContain('failed');
    expect(INTERVIEW_STATUSES).toContain('no-show');
    expect(INTERVIEW_STATUSES).toContain('rescheduled');
    expect(INTERVIEW_STATUSES).toContain('pending');
  });
});
