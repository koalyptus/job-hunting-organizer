# Evals

Lightweight, manual evaluation suite for the job-hunting-organizer.
**Not in CI** — LLMs are slow and non-deterministic; CI can't run them.

## Quick start

```sh
npm run eval          # structural only, fast (no LLM calls)
npm run eval -- --judge   # adds LLM-as-judge (planned, uses openevals)
npm run eval -- --update  # regenerates golden files, prints diffs (planned)
```

## Structure

```
evals/
├── README.md                              # this file
├── vitest.config.ts                       # separate vitest config
└── profile-build/
    ├── target-roles.test.ts               # structural tests for target-roles parsing
    ├── target-roles-cases.ts              # case definitions
    └── expected-target-roles/             # golden output fixtures
        ├── senior-backend.json
        ├── junior-fullstack.json
        └── multi-role.json
```

## Adding a new eval case

1. Add an entry to `profile-build/target-roles-cases.ts`:
   ```ts
   {
     name: 'descriptive test name',
     input: '## Target roles\n\n### slug — Title [primary]\n\n- Level: Senior',
     expected: [{ slug: 'slug', title: 'Title', priority: 'primary', ... }],
   }
   ```
2. Run `npm run eval` to verify it passes.
3. Add the corresponding golden file to `expected-target-roles/` if needed.

## Guard-rail tiers

| Tier | What                           | Strictness | Example                               |
| ---- | ------------------------------ | ---------- | ------------------------------------- |
| 3    | Tool internals (deterministic) | Max        | Target roles parsing, slug generation |
| 1    | Structured extraction          | High       | Profile build, job extract            |
| 2    | Creative generation            | Medium     | Cover letter, Q&A                     |

Phase 3e covers **Tier 3** only (target-roles parsing). Tier 1/2 evals
will use [`openevals`](https://github.com/langchain-ai/openevals)
for LLM-as-judge evaluation when those phases land.

## Not in CI

Evals require the user's LLM endpoint and are non-deterministic.
Run them manually before prompt changes or when switching providers.
