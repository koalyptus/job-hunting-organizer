import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readApplication, ApplicationNotFoundError } from '../applications/applications.js';
import { atomicWrite, pathExists } from '../fs.js';
import { acquireLock } from '../locks.js';
import { moduleLogger } from '../logger/logger.js';
import type { Logger } from 'pino';
import type {
  InterviewType,
  InterviewStatus,
  InterviewEntry,
  AddInterviewInput,
  MarkInterviewInput,
  AppendNotesInput,
} from './types.js';
import { INTERVIEW_TYPES, INTERVIEW_STATUSES } from './types.js';

const log = moduleLogger(import.meta.url);

const DEFAULT_INTERVIEW_DURATION_MINUTES = 60;

const INTERVIEW_SECTION_MARKER =
  '<!-- jho:interview-log — append-only. `jho interview mark` only updates Status: line. -->';

const H2_PATTERN = /^## (.+)$/;
const HEADING_PATTERN = /^(.+) — (.+?) \[([\w-]+)\]$/;
const FIELD_PATTERN = /^- ([A-Za-z-]+):\s*(.*)$/;
const DURATION_PATTERN = /^(\d+)\s*min/;

const INTERVIEW_TYPE_LABELS: Record<string, string> = {
  hr: 'HR screen',
  technical: 'Technical',
  'system-design': 'System design',
  behavioural: 'Behavioural',
  'take-home': 'Take-home',
  final: 'Final',
  other: 'Other',
};

export class InterviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InterviewError';
  }
}

export class InterviewNotFoundError extends InterviewError {
  constructor(slug: string) {
    super(`application not found: ${slug}`);
    this.name = 'InterviewNotFoundError';
  }
}

/**
 * Parse the H2 heading line `<when> — <title> [<status>]` into its
 * three components.
 */
function parseHeading(heading: string): { when: string; title: string; status: string } | null {
  const m = heading.match(HEADING_PATTERN);
  if (!m) {
    return null;
  }
  return { when: m[1]!, title: m[2]!, status: m[3]! };
}

/**
 * Parse the field line `- Key: Value` into a key-value pair.
 */
function parseField(line: string): { key: string; value: string } | null {
  const m = line.match(FIELD_PATTERN);
  if (!m) {
    return null;
  }
  return { key: m[1]!, value: m[2]! };
}

/**
 * Parse the value of a Duration field (e.g. `"60 min"` → `60`).
 */
function parseDuration(value: string): number | null {
  const m = value.match(DURATION_PATTERN);
  if (!m) {
    return null;
  }
  return parseInt(m[1]!, 10);
}

/**
 * Convert an interview type to its human-readable heading title.
 */
function getTypeLabel(type: string): string {
  return INTERVIEW_TYPE_LABELS[type] ?? type;
}

/**
 * Parse all interview sections from `interviews.md` content.
 * Returns entries in document order.
 */
export function parseInterviewsFile(content: string): InterviewEntry[] {
  const lines = content.split('\n');
  const entries: InterviewEntry[] = [];

  let currentHeading: string | null = null;
  let currentStartIndex = -1;
  let sectionCount = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const headingMatch = line.match(H2_PATTERN);

    if (headingMatch) {
      // Save previous section
      if (currentHeading !== null) {
        const body = lines.slice(currentStartIndex + 1, i);
        const entry = parseSectionToEntry(currentHeading, body, sectionCount);
        if (entry) {
          entries.push(entry);
          sectionCount++;
        }
      }
      currentHeading = headingMatch[1]!;
      currentStartIndex = i;
    }
  }

  // Last section
  if (currentHeading !== null) {
    const body = lines.slice(currentStartIndex + 1);
    const entry = parseSectionToEntry(currentHeading, body, sectionCount);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

/**
 * Build an InterviewEntry from a parsed H2 heading and its body lines.
 */
function parseSectionToEntry(
  heading: string,
  body: string[],
  index: number,
): InterviewEntry | null {
  const parsed = parseHeading(heading);
  if (!parsed) {
    return null;
  }

  const entryFields: {
    when: string;
    title: string;
    type: InterviewType;
    interviewers: string;
    location: string;
    status: InterviewStatus;
    topics: string;
    notes: string;
    duration: number;
  } = {
    when: parsed.when,
    title: parsed.title,
    type: 'other',
    interviewers: '',
    location: '',
    status: 'scheduled',
    topics: '',
    notes: '',
    duration: DEFAULT_INTERVIEW_DURATION_MINUTES,
  };

  // Map status from heading bracket if valid
  if (INTERVIEW_STATUSES.includes(parsed.status as InterviewStatus)) {
    entryFields.status = parsed.status as InterviewStatus;
  }

  for (const line of body) {
    const field = parseField(line);
    if (!field) {
      continue;
    }
    const key = field.key;
    const value = field.value;

    switch (key) {
      case 'Type':
        if (INTERVIEW_TYPES.includes(value as InterviewType)) {
          entryFields.type = value as InterviewType;
        }
        break;
      case 'Duration':
        {
          const parsedDuration = parseDuration(value);
          if (parsedDuration !== null) {
            entryFields.duration = parsedDuration;
          }
        }
        break;
      case 'Interviewers':
        entryFields.interviewers = value;
        break;
      case 'Location':
        entryFields.location = value;
        break;
      case 'Status':
        if (INTERVIEW_STATUSES.includes(value as InterviewStatus)) {
          entryFields.status = value as InterviewStatus;
        }
        break;
      case 'Topics':
        entryFields.topics = value;
        break;
      case 'Notes':
        entryFields.notes = value;
        break;
    }
  }

  return { index, ...entryFields };
}

/**
 * Build the full content of a new `interviews.md` file, including the
 * section marker and header.
 */
function buildNewFileContent(title: string, company: string, section: string): string {
  return [
    INTERVIEW_SECTION_MARKER,
    '',
    `# Interviews — ${title} @ ${company}`,
    '',
    section.trim(),
    '',
  ].join('\n');
}

/**
 * Build the H2 section markdown for an interview entry.
 */
function buildSection(input: AddInterviewInput): string {
  const type = input.type ?? 'other';
  const status = input.status ?? 'scheduled';
  const duration = input.duration ?? DEFAULT_INTERVIEW_DURATION_MINUTES;
  const title = input.title ?? getTypeLabel(type);

  const lines: string[] = [
    `## ${input.when} — ${title} [${status}]`,
    '',
    `- Type: ${type}`,
    `- Duration: ${duration} min`,
  ];

  if (input.interviewers) {
    lines.push(`- Interviewers: ${input.interviewers}`);
  }
  if (input.location) {
    lines.push(`- Location: ${input.location}`);
  }

  lines.push(`- Status: ${status}`);

  if (input.topics) {
    lines.push(`- Topics: ${input.topics}`);
  }
  if (input.notes) {
    lines.push(`- Notes: ${input.notes}`);
  }

  return lines.join('\n');
}

/**
 * Append a new interview entry to `interviews.md`. Reads the application's
 * `meta.md` for the header title/company.
 *
 * @param appliedDir - Absolute path to the campaign's `applied/` directory.
 * @param slug - Application slug.
 * @param input - Interview details.
 * @param externalLog - Optional pino logger.
 * @returns `{ index }` — the 1-based index of the newly appended entry.
 * @throws {InterviewNotFoundError} if the application doesn't exist.
 * @throws {InterviewError} on invalid input or write failure.
 */
export async function addInterview(
  appliedDir: string,
  slug: string,
  input: AddInterviewInput,
  externalLog?: Logger,
): Promise<{ index: number }> {
  const appFolder = join(appliedDir, slug);

  // Read application to get title/company for header
  let app;
  try {
    app = await readApplication(appliedDir, slug);
  } catch (err) {
    if (err instanceof ApplicationNotFoundError) {
      throw new InterviewNotFoundError(slug);
    }
    throw new InterviewError(
      `Failed to read application: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const { title, company } = app.frontmatter;

  // Validate input
  if (!input.when || input.when.includes('\n')) {
    throw new InterviewError('when must be a non-empty string without newlines');
  }
  if (input.type !== undefined && !INTERVIEW_TYPES.includes(input.type)) {
    throw new InterviewError(`invalid interview type: ${input.type}`);
  }
  if (input.status !== undefined && !INTERVIEW_STATUSES.includes(input.status)) {
    throw new InterviewError(`invalid interview status: ${input.status}`);
  }

  const section = buildSection(input);

  return acquireLock(appFolder, async () => {
    const interviewsPath = join(appFolder, 'interviews.md');
    const exists = await pathExists(interviewsPath);
    let newContent: string;
    let index = 1;

    if (!exists) {
      newContent = buildNewFileContent(title, company, section);
    } else {
      const existingContent = await readFile(interviewsPath, 'utf8');
      const existing = parseInterviewsFile(existingContent);
      index = existing.length + 1;
      newContent = existingContent.trimEnd() + '\n\n' + section.trim() + '\n';
    }

    const written = await atomicWrite(interviewsPath, newContent);
    if (!written) {
      throw new InterviewError(`failed to write interviews.md for ${slug}`);
    }

    (externalLog ?? log).info({ slug, interviewIndex: index }, 'interview.added');
    return { index };
  });
}

/**
 * List all interview entries for an application, in document order.
 *
 * @param appliedDir - Absolute path to the campaign's `applied/` directory.
 * @param slug - Application slug.
 * @returns Array of parsed interview entries, or `[]` if none exist.
 */
export async function listInterviews(appliedDir: string, slug: string): Promise<InterviewEntry[]> {
  const interviewsPath = join(appliedDir, slug, 'interviews.md');

  if (!(await pathExists(interviewsPath))) {
    return [];
  }

  const content = await readFile(interviewsPath, 'utf8');

  return parseInterviewsFile(content);
}

/**
 * Find the line index (0-based) of the `- Status:` field within a section
 * given the section's starting line index and the full lines array.
 */
function findStatusLineInSection(lines: string[], sectionStartIndex: number): number | null {
  for (let i = sectionStartIndex + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('## ')) {
      break;
    }
    const m = line.match(FIELD_PATTERN);
    if (m && m[1] === 'Status') {
      return i;
    }
  }
  return null;
}

/**
 * Update the status of a specific interview entry.
 *
 * Only the `- Status:` line is updated; the `[<status>]` in the H2 heading
 * is left unchanged (see PLAN §4).
 *
 * @param appliedDir - Absolute path to the campaign's `applied/` directory.
 * @param slug - Application slug.
 * @param input - The 1-based index and new status.
 * @returns `true` on success.
 * @throws {InterviewError} if the index is out of bounds or status is invalid.
 */
export async function markInterviewStatus(
  appliedDir: string,
  slug: string,
  input: MarkInterviewInput,
  externalLog?: Logger,
): Promise<boolean> {
  if (!INTERVIEW_STATUSES.includes(input.status)) {
    throw new InterviewError(`invalid interview status: ${input.status}`);
  }

  const interviewsPath = join(appliedDir, slug, 'interviews.md');

  return acquireLock(join(appliedDir, slug), async () => {
    let content: string;
    try {
      content = await readFile(interviewsPath, 'utf8');
    } catch {
      throw new InterviewError(`interviews.md not found for ${slug}`);
    }

    const lines = content.split('\n');

    // Find the Nth H2 section (1-based)
    let sectionsFound = 0;
    let sectionStartIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.match(H2_PATTERN)) {
        sectionsFound++;
        if (sectionsFound === input.sectionNumber) {
          sectionStartIndex = i;
          break;
        }
      }
    }

    if (sectionStartIndex === -1) {
      throw new InterviewError(`interview section ${input.sectionNumber} not found for ${slug}`);
    }

    // Find the Status line within this section
    const statusLineIndex = findStatusLineInSection(lines, sectionStartIndex);
    if (statusLineIndex === null) {
      throw new InterviewError(`no Status line found in interview section ${input.sectionNumber}`);
    }

    lines[statusLineIndex] = `- Status: ${input.status}`;

    const newContent = lines.join('\n');
    const written = await atomicWrite(interviewsPath, newContent);
    if (!written) {
      throw new InterviewError(`failed to write interviews.md for ${slug}`);
    }

    (externalLog ?? log).info(
      { slug, sectionNumber: input.sectionNumber, status: input.status },
      'interview.status.updated',
    );
    return true;
  });
}

/**
 * Append text to the `- Notes:` line of an interview section.
 *
 * If no `- Notes:` line exists in the section, one is created.
 *
 * @param appliedDir - Absolute path to the campaign's `applied/` directory.
 * @param slug - Application slug.
 * @param input - The 1-based section number and notes text to append.
 * @returns `true` on success.
 * @throws {InterviewError} if the section number is out of bounds.
 */
export async function appendInterviewNotes(
  appliedDir: string,
  slug: string,
  input: AppendNotesInput,
  externalLog?: Logger,
): Promise<boolean> {
  const interviewsPath = join(appliedDir, slug, 'interviews.md');

  return acquireLock(join(appliedDir, slug), async () => {
    let content: string;
    try {
      content = await readFile(interviewsPath, 'utf8');
    } catch {
      throw new InterviewError(`interviews.md not found for ${slug}`);
    }

    const lines = content.split('\n');

    // Find the Nth H2 section (1-based)
    let sectionsFound = 0;
    let sectionStartIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.match(H2_PATTERN)) {
        sectionsFound++;
        if (sectionsFound === input.sectionNumber) {
          sectionStartIndex = i;
          break;
        }
      }
    }

    if (sectionStartIndex === -1) {
      throw new InterviewError(`interview section ${input.sectionNumber} not found for ${slug}`);
    }

    // Find existing Notes line in this section
    let notesLineIndex = -1;
    let sectionEndIdx = lines.length;

    for (let i = sectionStartIndex + 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.match(H2_PATTERN)) {
        sectionEndIdx = i;
        break;
      }
      const m = line.match(FIELD_PATTERN);
      if (m && m[1] === 'Notes') {
        notesLineIndex = i;
        break;
      }
    }

    if (notesLineIndex !== -1) {
      // Append to existing Notes line
      const existingNotes = lines[notesLineIndex]!.replace(/^- Notes:\s*/, '');
      const TRAILING_PUNCTUATION = ['.', '!', '?', ':', ';', ')'];
      const needsSep =
        existingNotes && !TRAILING_PUNCTUATION.some((p) => existingNotes.endsWith(p));
      const separator = needsSep ? '; ' : ' ';
      lines[notesLineIndex] = `- Notes: ${existingNotes}${separator}${input.notes}`;
    } else {
      // Insert Notes line before section end (or at end of body)
      const insertAt = sectionEndIdx;
      lines.splice(insertAt, 0, `- Notes: ${input.notes}`);
    }

    const newContent = lines.join('\n');
    const written = await atomicWrite(interviewsPath, newContent);
    if (!written) {
      throw new InterviewError(`failed to write interviews.md for ${slug}`);
    }

    (externalLog ?? log).info(
      { slug, sectionNumber: input.sectionNumber },
      'interview.notes.appended',
    );
    return true;
  });
}
