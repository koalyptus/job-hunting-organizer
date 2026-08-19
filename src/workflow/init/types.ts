import type { Logger } from 'pino';

/**
 * Options for the `jho init` wizard. Passed from the CLI layer to
 * {@link runInit} in `workflow/init/wizard.ts`.
 */
export interface InitOptions {
  /** Campaign name (default: `'default'`). */
  readonly name?: string;
  /** Path to CV file. */
  readonly cv?: string;
  /** LinkedIn profile URL. */
  readonly linkedin?: string;
  /** GitHub username. */
  readonly github?: string;
  /** Path to existing `profile.md` to copy instead of building. */
  readonly profile?: string;
  /** Optional path to a knowledge-base file or folder to ingest at init. */
  readonly kb?: string;
  /** Non-interactive mode: use env vars/defaults, skip all prompts. */
  readonly nonInteractive?: boolean;
  /** Optional pino logger. */
  readonly log?: Logger;
}

/** GitHub credentials captured during the init wizard. */
export interface GithubPrefs {
  /** GitHub username (empty string when skipped). */
  user?: string;
  /** GitHub personal access token (empty string when skipped). */
  token?: string;
}

/** LLM endpoint preferences captured during the init wizard. */
export interface LlmPrefs {
  /** Base URL of the OpenAI-compatible endpoint. */
  baseUrl?: string;
  /** API key (empty string for local LLMs that don't require one). */
  apiKey?: string;
  /** Model identifier. */
  model?: string;
}
