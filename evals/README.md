# Evals

Evaluation suite for the job-hunting-organizer. Two categories:

- **Structural evals** (Tier 3): deterministic, no LLM calls. These run in
  CI via `npm test` (the root `vitest.config.ts` includes `evals/`).
- **LLM-based evals** (Tier 1/2): non-deterministic, require the user's
  LLM endpoint. These are **not in CI** — run manually via `npm run eval`.

## Quick start

```sh
npm test                # runs unit tests only (evals excluded from CI)
npm run eval            # runs ALL evals (structural + LLM-based)
npm run eval:update     # regenerates golden files (structural evals only)
```

## Structure

```
evals/
├── README.md                              # this file
├── vitest.config.ts                       # separate vitest config (npm run eval)
├── matchers.ts                            # shared vitest matchers (toPassLlmRubric, etc.)
├── graders/                               # versioned rubrics for LLM judges
│   ├── cover-letter-rubric.md
│   └── qa-rubric.md
├── fixtures/                              # shared input data
│   ├── jd.md                              # sample job description
│   └── profile.md                         # sample candidate profile
├── profile-build/                         # Tier 3: structural evals
│   ├── target-roles.test.ts
│   ├── target-roles-cases.ts
│   └── expected-target-roles/
├── cover-letter/                          # Tier 2: LLM-based evals
│   ├── cases.ts
│   └── cover-letter.test.ts
└── application-qa/                        # Tier 2: LLM-based evals
    ├── cases.ts
    └── qa.test.ts
```

## Adding a new eval case

### Structural evals (Tier 3)

1. Create the golden fixture file in `expected-target-roles/`:
   ```json
   [{ "slug": "my-role", "title": "My Role", "priority": "primary", ... }]
   ```
2. Add an entry to `profile-build/target-roles-cases.ts`:
   ```ts
   {
     name: 'descriptive test name',
     description: 'why this case exists',
     tags: ['happy-path'],
     holdout: false,
     input: '## Target roles\n\n### my-role — My Role [primary]\n\n- Level: Senior',
     fixture: 'my-role.json',
   }
   ```
3. Run `npm run eval` to verify it passes.

### LLM-based evals (Tier 2)

1. Add input fixtures to `evals/fixtures/` if needed.
2. Add a case to the relevant `cases.ts` file:
   ```ts
   {
     name: 'descriptive test name',
     description: 'why this case exists',
     tags: ['happy-path'],
     holdout: false,
     promptVersion: 1,
     jd: defaultJd,
     profile: defaultProfile,
     question: 'The application question',
     expectedBehavior: 'answer',
   }
   ```
3. Run `npm run eval -- --grep "qa"` to verify it passes.

## Case metadata

Each case has these fields:

| Field           | Type     | Purpose                                                |
| --------------- | -------- | ------------------------------------------------------ |
| `name`          | string   | Human-readable test name                               |
| `description`   | string   | Why this case exists                                   |
| `tags`          | string[] | For filtering: `happy-path`, `edge-case`, `regression` |
| `holdout`       | boolean  | Reserved for validation — never touched by `--update`  |
| `promptVersion` | number   | Pin to prompt version; warn on mismatch                |

## Golden/holdout split

Cases are split into two sets:

- **Golden** (`holdout: false`): Used during prompt iteration. Updated freely.
- **Holdout** (`holdout: true`): Reserved for final validation. Never updated during development.

The `--update` flag only regenerates golden fixtures, never holdout fixtures.

## LLM-as-judge evals

LLM-based evals use decomposed rubrics with two tiers:

1. **Deterministic checks** (Tier 3): Word count, banned phrases, profile references. Free, fast.
2. **LLM judge** (Tier 2): Rubric-based grading. Runs only if deterministic checks pass.

This tiering reduces cost — the LLM judge is only called when the output passes basic quality gates.

## Guard-rail tiers

| Tier | What                           | Strictness | Example                               | CI? |
| ---- | ------------------------------ | ---------- | ------------------------------------- | --- |
| 3    | Tool internals (deterministic) | Max        | Target roles parsing, slug generation | yes |
| 1    | Structured extraction          | High       | Profile build, job extract            | no  |
| 2    | Creative generation            | Medium     | Cover letter, Q&A                     | no  |

## Judge configuration

The LLM judge uses the user's existing LLM config (from `config.json`). The judge model should differ from the generator model to avoid self-preference bias.

Set `EVAL_JUDGE_PROVIDER` to override the default judge model:

```sh
EVAL_JUDGE_PROVIDER="openai:chat:gpt-4o" npm run eval
```

## Calibration

Before trusting the LLM judge, calibrate against human labels:

1. Create 30–50 test cases with known pass/fail labels
2. Run the eval suite and compare judge results to human labels
3. Target: >90% agreement before using in production
4. Lock the judge model and rubric once calibrated

## Troubleshooting

### LLM evals timing out

Each eval test makes 2+ LLM calls (generation + judging). If your local LLM is slow, increase the timeout in `evals/matchers.ts` (`EVAL_TIMEOUT_MS`, default 10 minutes).

### Evals running in CI

The root `vitest.config.ts` excludes `evals/`. If evals are running in CI,
check that the `include` array in `vitest.config.ts` does not include
`evals/**/*.{test,spec}.ts`.
