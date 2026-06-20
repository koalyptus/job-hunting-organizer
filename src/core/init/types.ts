/**
 * Options for the `jho init` wizard. Passed from the CLI layer to
 * {@link runInit} in `core/init.ts`.
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
  /** Non-interactive mode: use env vars/defaults, skip all prompts. */
  readonly yes?: boolean;
}
