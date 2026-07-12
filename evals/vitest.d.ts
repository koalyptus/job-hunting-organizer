import 'vitest';

interface CustomMatchers<R = unknown> {
  /**
   * Check that the output passes an LLM-as-judge rubric.
   */
  toPassLlmRubric(rubric: string): R;

  /**
   * Check that the word count is between min and max (inclusive).
   */
  toHaveWordCountBetween(min: number, max: number): R;

  /**
   * Check that the output does not contain any of the banned phrases.
   */
  toNotContainPhrases(phrases: readonly string[]): R;

  /**
   * Check that the output contains at least n of the profile items.
   */
  toContainAtLeastNProfileItems(profileItems: readonly string[], n: number): R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = unknown> extends CustomMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
