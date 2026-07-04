export const INTERVIEW_TYPES = [
  'hr',
  'technical',
  'system-design',
  'behavioural',
  'take-home',
  'final',
  'other',
] as const;

export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const INTERVIEW_STATUSES = [
  'scheduled',
  'completed',
  'passed',
  'failed',
  'no-show',
  'rescheduled',
  'pending',
] as const;

export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

/**
 * Input for {@link addInterview}. Only `when` is required; all other
 * fields have sensible defaults or are omitted when empty.
 */
export interface AddInterviewInput {
  /** Interview datetime (e.g. `"2026-06-15 10:00"`). */
  when: string;
  /** Interview type. Default: `"technical"`. */
  type?: InterviewType;
  /** Duration in minutes. Default: `60`. */
  duration?: number;
  /** Interviewer name(s). */
  interviewers?: string;
  /** Location or meeting link. */
  location?: string;
  /** Initial status. Default: `"scheduled"`. */
  status?: InterviewStatus;
  /** Free-text notes. */
  notes?: string;
  /** Comma-separated topic keywords. */
  topics?: string;
  /** Custom H2 heading title. Defaults to humanized type. */
  title?: string;
}

/**
 * A single parsed interview entry from `interviews.md`.
 * Returned by {@link listInterviews}.
 */
export interface InterviewEntry {
  /** 1-based index in document order. */
  index: number;
  /** Datetime string from the H2 heading. */
  when: string;
  /** Display title from the H2 heading. */
  title: string;
  /** Structured interview type. */
  type: InterviewType;
  /** Interviewer name(s). */
  interviewers: string;
  /** Location or meeting link. */
  location: string;
  /** Current lifecycle status. */
  status: InterviewStatus;
  /** Topic keywords. */
  topics: string;
  /** Free-text notes. */
  notes: string;
  /** Duration in minutes. */
  duration: number;
}

/**
 * Input for {@link markInterviewStatus}.
 */
export interface MarkInterviewInput {
  /** 1-based section number. */
  sectionNumber: number;
  /** New status value. */
  status: InterviewStatus;
}

/**
 * Input for {@link appendInterviewNotes}.
 */
export interface AppendNotesInput {
  /** 1-based section number. */
  sectionNumber: number;
  /** Notes text to append. */
  notes: string;
}
