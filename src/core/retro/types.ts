import type { Logger } from 'pino';

/**
 * A single parsed retro section from `retro.md`. Returned by
 * {@link parseRetroFile} and used internally by the module.
 */
export interface WeakTopic {
  /** Broad topic category (e.g. `"System design"`). */
  readonly topic: string;
  /** Optional specific detail (e.g. `"couldn't discuss consistency models"`). */
  readonly detail: string;
}

/**
 * A single aggregated weak topic showing how many apps mention it.
 */
export interface AggregatedTopic {
  /** The weak topic label (e.g. `"System design — consistency models"`). */
  readonly label: string;
  /** Number of applications that mention this topic. */
  readonly count: number;
  /** Slugs of the applications that mention this topic. */
  readonly apps: string[];
}

/**
 * A single parsed section from `retro.md`. Each section corresponds to
 * one H2 heading.
 */
export interface RetroSection {
  /** 1-based index in document order. */
  index: number;
  /** Datetime string from the H2 heading. */
  when: string;
  /** Interview title from the H2 heading. */
  title: string;
  /** Interview status at the time. */
  status: string;
  /** Date of the retro (ISO date string). */
  date: string;
  /** Interview id (1-based index from interviews.md). */
  interviewId: number;
  /** Status at the time the retro was written. */
  statusAtTime: string;
  /** Parsed weak topics. */
  weakTopics: WeakTopic[];
  /** Other notes (free text). */
  notes: string;
  /** Raw markdown body of the section (after metadata fields). */
  body: string;
}

/**
 * Input for {@link startRetro}. Only `slug` and `campaign` are required;
 * weak topics can be provided or prompted for by the caller.
 */
export interface StartRetroInput {
  readonly slug: string;
  readonly campaign: string;
  /** Weak topics to address in the learning plan. */
  readonly weakTopics: string[];
  /** Additional context or notes about the interview. */
  readonly notes?: string;
  /** 1-based interview id from `interviews.md` to associate this retro with. */
  readonly interviewId?: number;
  /** Custom LLM instructions for this retro. */
  readonly steer?: string;
  /** Status at the time of writing (overrides application/interview status). */
  readonly status?: string;
  /** Optional pino logger. */
  readonly log?: Logger;
}

/**
 * Result of a successful {@link startRetro} call.
 */
export interface StartRetroResult {
  /** The generated learning plan markdown. */
  readonly content: string;
  /** Approximate word count of the generated plan. */
  readonly wordCount: number;
  /** The model identifier that produced the response. */
  readonly model: string;
  /** Wall-clock duration of the LLM request in milliseconds. */
  readonly durationMs: number;
  /** 1-based index of the newly appended retro section. */
  readonly index: number;
}

/**
 * Input for {@link appendRetro}. Adds more weak topics and regenerates
 * the learning plan for the last retro section.
 */
export interface AppendRetroOptions {
  readonly slug: string;
  readonly campaign: string;
  /** New weak topics to add to the existing list. */
  readonly weakTopics: string[];
  /** Additional notes to append. */
  readonly notes?: string;
  /** Custom LLM instructions for this retro. */
  readonly steer?: string;
  /** Status at the time of writing (overrides application/interview status). */
  readonly status?: string;
  /** When true, do not carry the prior section's weak topics/notes into the new section. */
  readonly noCarryOver?: boolean;
  /** Optional pino logger. */
  readonly log?: Logger;
}

/**
 * Options for {@link aggregateRetros}.
 */
export interface AggregateOptions {
  /** Filter by target role slug. */
  readonly role?: string;
  /** When true, include abandoned apps in aggregation (default: false). */
  readonly includeAbandoned?: boolean;
  /** Minimum occurrence count to include in results (default: 1). */
  readonly minOccurrences?: number;
}
