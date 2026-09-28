# evals

Lightweight evaluation suite for LLM-backed `jho` behaviors.

- Structural / deterministic evals (Tier 3) run under the normal `vitest` config when included.
- LLM-based evals (Tier 1/2) run via `npm run eval` with `evals/vitest.config.ts`; they are not in CI.
- Rubrics live in `graders/`; fixtures, cases, and one test file per feature are colocated by feature.

This folder is manual QA tooling, not shipped runtime code.
