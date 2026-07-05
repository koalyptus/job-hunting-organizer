import type { Logger } from 'pino';

/**
 * Depth level for a prep topic: 1 = high-level overview, 2 = intermediate,
 * 3 = deep dive.
 */
export type PrepDepth = 1 | 2 | 3;

/**
 * A single topic in the prep plan.
 */
export interface PrepTopic {
  /** Short topic label (e.g. `"React hooks"`). */
  readonly title: string;
  /** 2–5 bullet points of what to know. */
  readonly whatToKnow: readonly string[];
  /** 2–4 resources (book chapters, articles, docs, exercises). */
  readonly resources: readonly string[];
  /** Realistic time estimate (e.g. `"2–3 hours"`). */
  readonly estimatedTime: string;
  /** Depth level: 1 (overview), 2 (intermediate), 3 (deep dive). */
  readonly depth: PrepDepth;
}

/**
 * A behavioural question with STAR-formatted answer.
 */
export interface PrepBehavioralQuestion {
  /** The behavioural question. */
  readonly question: string;
  /** STAR-formatted answer (Situation, Task, Action, Result). */
  readonly answer: string;
}

/**
 * Parsed prep plan returned by {@link parsePrepFile}.
 */
export interface PrepPlan {
  /** All prep topics. */
  readonly topics: PrepTopic[];
  /** Behavioural questions (STAR). */
  readonly behavioralQuestions: PrepBehavioralQuestion[];
  /** Interview timeline milestones. */
  readonly timeline: PrepTimelineMilestone[];
  /** Checklist items. */
  readonly checklist: string[];
  /** Freeform notes. */
  readonly notes: string;
}

/**
 * A single milestone on the interview prep timeline.
 */
export interface PrepTimelineMilestone {
  /** Days before interview. */
  readonly daysBefore: number;
  /** Task description. */
  readonly task: string;
}

/**
 * Options for {@link generatePrep}.
 */
export interface GeneratePrepOptions {
  /** Application slug. */
  readonly slug: string;
  /** Campaign name. */
  readonly campaign: string;
  /** Number of days until the interview (default: 7). */
  readonly days?: number;
  /** Custom LLM instructions. When provided, overwrites existing steer. */
  readonly steer?: string;
  /** Optional pino logger. */
  readonly log?: Logger;
}

/**
 * Options for {@link generatePrepFromText} — ad-hoc mode.
 */
export interface GeneratePrepFromTextOptions {
  /** Raw JD text. */
  readonly jdText: string;
  /** Campaign name (for profile reading). */
  readonly campaign: string;
  /** Number of days until the interview (default: 7). */
  readonly days?: number;
  /** Custom LLM instructions. */
  readonly steer?: string;
  /** Optional pino logger. */
  readonly log?: Logger;
}

/**
 * Result of a successful {@link generatePrep} call.
 */
export interface GeneratePrepResult {
  /** The generated prep plan markdown. */
  readonly content: string;
  /** Approximate word count. */
  readonly wordCount: number;
  /** The model identifier that produced the response. */
  readonly model: string;
  /** Wall-clock duration of the LLM request in milliseconds. */
  readonly durationMs: number;
}
