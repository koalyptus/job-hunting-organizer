# Evals

Evaluation suite for the job-hunting-organizer. Two categories:

- **Structural evals** (Tier 3): deterministic, no LLM calls. These run in
  CI via `npm test` (the root `vitest.config.ts` includes `evals/`).
- **LLM-based evals** (Tier 1/2): non-deterministic, require the user's
  LLM endpoint. These are **not in CI** — run manually via `npm run eval`.

## Quick start

```sh
npm test                # runs structural evals (and all unit tests)
npm run eval            # runs ONLY the eval suite (structural only for now)
npm run eval -- --judge   # adds LLM-as-judge (planned, uses openevals)
npm run eval -- --update  # regenerates golden files, prints diffs (planned)
```

## Structure

```
evals/
├── README.md                              # this file
├── vitest.config.ts                       # separate vitest config (npm run eval)
└── profile-build/
    ├── target-roles.test.ts               # structural tests for target-roles parsing
    ├── target-roles-cases.ts              # case definitions (name + input + fixture ref)
    └── expected-target-roles/             # golden output fixtures (loaded by tests)
        ├── senior-backend.json
        ├── devops-engineer.json
        ├── multi-role.json
        └── empty.json
```

## Adding a new eval case

1. Create the golden fixture file in `expected-target-roles/`:
   ```json
   [{ "slug": "my-role", "title": "My Role", "priority": "primary", ... }]
   ```
2. Add an entry to `profile-build/target-roles-cases.ts`:
   ```ts
   {
     name: 'descriptive test name',
     input: '## Target roles\n\n### my-role — My Role [primary]\n\n- Level: Senior',
     fixture: 'my-role.json',
   }
   ```
3. Run `npm run eval` to verify it passes.

## Guard-rail tiers

| Tier | What                           | Strictness | Example                               | CI? |
| ---- | ------------------------------ | ---------- | ------------------------------------- | --- |
| 3    | Tool internals (deterministic) | Max        | Target roles parsing, slug generation | yes |
| 1    | Structured extraction          | High       | Profile build, job extract            | no  |
| 2    | Creative generation            | Medium     | Cover letter, Q&A                     | no  |

Phase 3e covers **Tier 3** only (target-roles parsing). Tier 1/2 evals
will use [`openevals`](https://github.com/langchain-ai/openevals)
for LLM-as-judge evaluation when those phases land. They will use the
`--judge` flag and will not be included in CI.
