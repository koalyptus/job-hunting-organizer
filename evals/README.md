# evals

Lightweight evaluation suite for LLM-backed `jho` behaviors.

- Structural / deterministic evals (Tier 3) run under the normal `vitest` config when included.
- LLM-based evals (Tier 1/2) run via `npm run eval` with `evals/vitest.config.ts`; they are not in CI.
- Rubrics live in `graders/`; fixtures, cases, and one test file per feature are colocated by feature.

This folder is manual QA tooling, not shipped runtime code.

## Adding an eval case

1. Add fixtures under `evals/fixtures/` if the case needs new inputs.
2. Add a case entry in the relevant `cases.ts` file.
3. For structural evals, add or update golden JSON under `expected-*/` as needed.
4. Run `npm run eval` or the targeted eval file to verify.

Case metadata uses `name`, `description`, `tags`, `holdout`, and feature-specific inputs such as `promptVersion`, `jd`, `profile`, `question`, or `expectedBehavior`. Golden fixtures are updated via `npm run eval:update`; holdout fixtures are reserved for validation and are never auto-updated.
