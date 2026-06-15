# Plan — `job-hunting-organizer`

A local-first CLI + MCP server that helps run a job-hunting campaign: profile from CV + GitHub, tailored cover letters, application Q&A, interview pipeline tracking, and calendar integration. All user data lives outside the repo at `~/.job-hunting-organizer/` (config home, override via `$JHO_CONFIG_HOME`) and `~/job-hunting-organizer-data/` (data root, override via `$JHO_DATA`).

---

## 1. Goal

1. Build a profile from CV + GitHub repos (`init`).
2. Generate tailored cover letters from job-description URLs.
3. Tailor answers to application questions (text or screenshot).
4. Track applications, interview pipelines, and Q&A history.
5. Schedule interviews to calendar (ICS default, Outlook opt-in).

---

## 2. Tech & runtime

|                 |                                                                 |
| --------------- | --------------------------------------------------------------- |
| Runtime         | Node ≥ 20, ESM, TypeScript strict                               |
| Package layout  | Single package, not monorepo (this project)                     |
| CLI             | `commander`                                                     |
| CLI prompts     | `@clack/prompts`                                                |
| TUI spinners    | `ora` (TTY only)                                                |
| Logger          | `pino` + `pino-pretty` + `pino-roll`                            |
| Module tracing  | `debug` (`jho:*` namespace)                                     |
| Schema          | `zod`                                                           |
| MD frontmatter  | `gray-matter`                                                   |
| PDF             | `pdf-parse`                                                     |
| DOCX            | `mammoth`                                                       |
| ICS             | `ics` (or hand-rolled)                                          |
| Microsoft Graph | `@azure/msal-node` + `@microsoft/microsoft-graph-client` (lazy) |
| MCP             | `@modelcontextprotocol/sdk` (stdio transport)                   |
| Lint/format     | eslint + prettier                                               |
| Tests           | vitest (unit, snapshot, integration with msw)                   |
| Build           | `tsup`                                                          |
| Help rendering  | `marked` + `marked-terminal`                                    |

---

## 3. Data locations

There is a small **config home** (holds the global `config.json` and `.locks/`) and a separate **data root** (holds campaigns). Each campaign has its own profile, applied folders, and knowledge base.

```
~/job-hunting-organizer/                                # config home (override with $JHO_CONFIG_HOME)
├── config.json                                         # global: LLM, GitHub, calendar, logging
└── .locks/                                             # proper-lockfile sidecars

~/job-hunting-organizer-data/                           # data root (override with $JHO_DATA)
└── campaigns/
    ├── default/                                        # default campaign
    │   ├── config.json                                 # per-campaign: profile path, applied dir, KB dir
    │   ├── profile.md                                  # generated profile (per-campaign)
    │   ├── cv.<ext>                                    # user's CV (path configurable)
    │   ├── applied/                                    # per-application folders
    │   ├── knowledge-base/local/                       # raw extracted text cache
    │   └── outlook-tokens.json                         # MSAL tokens (mode 0600)
    └── freelance/                                      # second campaign
        └── ...
```

| Path                                                | Purpose                                                | Git? |
| --------------------------------------------------- | ------------------------------------------------------ | ---- |
| `<configHome>/config.json`                          | Global settings (LLM, GitHub, calendar, logging)       | no   |
| `<configHome>/.locks/`                              | proper-lockfile sidecars                               | no   |
| `<dataRoot>/campaigns/<name>/config.json`           | Per-campaign settings (profile path, applied dir, KB)  | no   |
| `<dataRoot>/campaigns/<name>/profile.md`            | Generated profile (per-campaign)                       | no   |
| `<dataRoot>/campaigns/<name>/cv.<ext>`              | User's CV (path configurable)                          | no   |
| `<dataRoot>/campaigns/<name>/applied/`              | Per-application folders                                | no   |
| `<dataRoot>/campaigns/<name>/knowledge-base/local/` | Raw extracted text cache                               | no   |
| `<dataRoot>/campaigns/<name>/outlook-tokens.json`   | MSAL tokens (mode 0600)                                | no   |
| `$JHO_CONFIG_HOME`                                  | Override of config home (no CLI flag for it by design) | n/a  |
| `$JHO_DATA`                                         | Override of data root (no CLI flag for it by design)   | n/a  |

Resolution precedence for the **config home**: **`$JHO_CONFIG_HOME` env var → default `~/.job-hunting-organizer/`**. There is no `--config-home` CLI flag; the env var is the only override.

Resolution precedence for the **data root**: **`$JHO_DATA` env var → default `~/job-hunting-organizer-data/`**. There is no `--data-root` CLI flag; the env var is the only override.

Resolution precedence for the **campaign**: **explicit `--campaign <name>` flag → cwd-inferred from `<dataRoot>/campaigns/<name>/` → `default`**. MCP tool calls always pass an explicit campaign name; CLI uses cwd inference as a convenience.

---

## 4. `applied/` layout — folder per application

```
applied/
├── .gitkeep
├── .counters.json                        # gitignored, slug collision counter
├── .index.json                           # gitignored, derived cache
└── 2026-Jun-03-SE-Nuage-Technology-Group-92448554/
    ├── meta.md            # tool-managed frontmatter + user-owned body
    ├── jd.md              # fetched JD above marker, user notes below
    ├── cover-letter.md    # generated, freely editable
    ├── qa.md              # append-only log
    ├── interviews.md      # append-only log
    ├── notes.md           # user-owned
    ├── meta.md.toolhash
    ├── jd.md.toolhash
    └── ... .toolhash
```

### Slug convention

`{YYYY}-{MMM}-{DD}-{roleAbbr}-{companySlug}[-{jobId}][-{n}]`

- `roleAbbr` = first 2–3 words of title, alphanumeric + hyphens, ≤ 24 chars.
- `companySlug` = lowercase, alphanumeric + hyphens.
- `jobId` = extracted from URL when present. Built-in patterns: Seek trailing numeric, LinkedIn `/view/<id>`, Indeed `jk=`, and a generic 5+-digit trailing number preceded by `/` or `-` (excluding years 1900-2099). Custom patterns can be added via `JHO_URL_PATTERNS` env var.
- `-{n}` = integer suffix on collision; counter persisted in `.counters.json`.
- Recognized as a slug by matching `^\d{4}-[A-Z][a-z]{2}-\d{2}-.+$` (used for cwd inference; see below).

### Slug inference from cwd

Slugs are intentionally unique but visually noisy. To make the CLI ergonomic, every command that takes a `<slug>` also accepts the implicit form: **omit the slug and run from inside the application folder**.

- `core/paths.ts` exposes `findSlugFromCwd(cwd, appliedDir)` which walks up from `cwd` and returns the basename of the first directory whose name matches the slug pattern above and lives under `appliedDir`. Returns `null` if none found.
- `core/slug.ts` exports the `SLUG_PATTERN` regex and a `validateSlug(slug)` helper.
- `core/url.ts` provides `extractJobIdFromUrl(url)` — tries user-supplied patterns from `JHO_URL_PATTERNS` first, then built-in patterns (LinkedIn `/view/<id>`, Indeed `jk=`, Seek trailing numeric, generic trailing 5+ digits excluding years). Returns `null` when no pattern matches.
- **Interactive fallback (future, Phase 5)**: when `jho track <url>` cannot extract a job ID from the URL, the tool interactively prompts the user to supply one manually (an optional input — users can skip it and proceed with no JobId in the slug). This is the CLI-only convenience; MCP `track_application` and `--yes` mode skip the prompt silently.
- Resolution rule in every CLI command:
  1. If a `<slug>` argument is passed explicitly, use it.
  2. Else, call `findSlugFromCwd(process.cwd(), appliedDir)`. If non-null, use it.
  3. Else, exit with `error: missing <slug> argument` and a hint: `hint: pass a slug, or run from inside the application folder (e.g. cd applied/<slug>)`.
- Applies to: `jho show`, `jho cover-letter`, `jho answer`, `jho interview {add,list,mark,notes}`, `jho retro`, `jho retro --interview <n>`, and `jho track <slug>` (updates only — new applications still need a URL or `--paste`).
- Subfolders work too: `cd applied/<slug>/interviews && jho show` resolves correctly (walks up one level).
- MCP tool calls always require an explicit slug; cwd inference is CLI-only.
- Discovered via `jho help slug-format` and the per-command `--help` examples.

### `meta.md` frontmatter

```yaml
slug: 2026-Jun-03-SE-Nuage-Technology-Group-92448554
status: applied | interview | offer | rejected | withdrawn | abandoned | ghosted
appliedOn: 2026-06-03
title: Software Engineer
company: Nuage Technology Group
location: Sydney NSW
site: Seek
link: https://au.seek.com/job/92448554?ref=applied
salary: ''
tags: [typescript, react, backend]
targetRole: senior-backend-engineer # slug from profile's ## Target roles; optional
```

Body: user-owned (untouched by tool).

**Status semantics** (the distinction matters for `jho retro --aggregate` and for self-reflection):

| Status      | Meaning                                                                    | Typical signal in `meta.md` body or `notes.md`             |
| ----------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `applied`   | Application sent, no response yet.                                         | (none)                                                     |
| `interview` | ≥ 1 interview scheduled or completed.                                      | (none)                                                     |
| `offer`     | Offer received; decision pending.                                          | (decision deadline)                                        |
| `rejected`  | They said no (explicit or implicit via rejection email).                   | (rejection reason if known)                                |
| `withdrawn` | **I formally pulled out** — replied to recruiter, sent a withdrawal email. | "told them I'm no longer interested", "accepted elsewhere" |
| `abandoned` | **I just stopped** responding / preparing, without a formal withdrawal.    | (no closing email)                                         |
| `ghosted`   | They went silent after ≥ 1 successful exchange.                            | "no reply after N weeks"                                   |

`withdrawn` and `abandoned` are deliberately separate: the first is a _professional_ closing action, the second is a _self-reflection_ state. `abandoned` apps are the input to the "where do I drop the ball?" question — useful for spotting patterns like "I abandon 30% of apps after the take-home." `jho retro --aggregate` keeps `abandoned` apps out of weak-topic aggregation by default (`--include-abandoned` to include).

### `interviews.md` schema (one H2 per interview)

```markdown
# Interviews — <title> @ <company>

## 2026-06-10 10:00 — HR screen [scheduled]

- Type: hr | technical | system-design | behavioural | take-home | final | other
- Interviewers: A. Smith
- Location: Google Meet
- Status: scheduled | completed | passed | failed | no-show | rescheduled | pending
- Topics: ...
- Notes: ...
```

`add` appends a new H2. `mark <n> --status X` does a regex replace of the `Status:` line of section `n` only.

### `qa.md` schema (append-only)

```markdown
# Q&A — <title> @ <company>

## 2026-06-04 09:21 — "<question>" [text|image:<filename>]

- Source: application form | email | verbal
- Answer:
  > <tailored answer>
```

### `jd.md` schema

```markdown
<!-- jho:start:fetched-jd -->

... tool-managed fetched JD ...

<!-- jho:end:fetched-jd -->

<!-- user notes below this line are preserved on re-track -->
```

### `retro.md` schema (one H2 per failed interview; append-only)

Created by `jho retro <slug>` after a failed interview. Captures the candidate's
self-assessment of weak topics and the LLM-generated learning plan for each.

```markdown
<!-- jho:retro — post-mortem for failed interviews. Tool appends a new H2 per retro; never overwrites prior retros. -->

# Post-mortem — <title> @ <company>

## Retro for interview: 2026-06-17 14:00 — Technical [failed]

- Date: 2026-06-17
- Interview id: 2
- Status at the time: failed

### Weak topics

- System design — couldn't discuss consistency models
- Distributed systems — unsure about consensus algorithms
- Behavioural — struggled with "tell me about a conflict" example

### Other notes

- Interviewer was rushed; ran out of time on the system design portion
- Took the live-coding well, but the followup was ungrounded

### Learning plan

#### Topic: System design — consistency models

- **What to know**: ACID vs BASE, eventual consistency, vector clocks, CRDTs
- **Resources**:
  - "Designing Data-Intensive Applications" (Kleppmann) — ch. 5–7
  - https://martin.kleppmann.com/2015/...
- **Exercises**:
  - Design a chat system; identify consistency boundaries
  - Compare CRDT approaches for collaborative editing
- **Estimated time**: 4–6 hours

#### Topic: Distributed systems — consensus algorithms

- ...

### Checklist

- [ ] Read Kleppmann ch. 5
- [ ] Complete chat system design exercise
- [ ] Re-read retro in 2 weeks

## Retro for interview: 2026-06-24 — Final [failed]

- ...
```

Each H2 section is the unit of a retro: weak topics, notes, plan, checklist.
Prior sections are never read or rewritten by the tool.

### Cross-app aggregation

`jho retro --aggregate` (or MCP `aggregate_retros`) scans all `applied/*/retro.md`
files and surfaces recurring weak topics across applications:

```
$ jho retro --aggregate
Recurring weak topics across 4 retros:

  system design (3x) — Nuage, Atlassian, Canva
  behavioural — "tell me about a conflict" (2x)
  distributed systems — consensus (2x)
  SQL — window functions (1x)

Suggested focus areas (most frequent first):
  1. System design fundamentals
  2. Behavioural — conflict stories
  3. Distributed systems — consensus
```

This makes the LLM-generated plans more useful over time: the user sees
patterns the LLM can't see from a single interview.

**Flags**: `--role <slug>` to scope to a single target role, `--include-abandoned` to also count weak topics from apps that the user `abandoned` (off by default — abandonment is a self-reflection signal, not a learning-from-failure signal; see §4 status semantics).

### `prep.md` schema (one file per application; regenerable, user-editable)

Created by `jho prepare <slug>` from the JD plus the user's profile and target role. The pre-interview counterpart to `retro.md`: instead of learning from failure, it primes the user with what to brush up on _before_ walking in. Regenerated on `jho prepare <slug> --update`; user-added free-form edits are preserved unless the user accepts an overwrite prompt (same `.toolhash` sidecar mechanism as `cover-letter.md`).

```markdown
<!-- jho:prep — pre-interview prep plan. Tool regenerates on --update; user body preserved on edit. -->

# Prep plan — <title> @ <company>

- Generated: 2026-06-08
- Days available: 7
- Target role: senior-backend-engineer

## Tech stack detected

TypeScript, React, Node.js, AWS (Lambda, SQS, DynamoDB), PostgreSQL, Terraform

## Topics to brush up

### Event-driven architectures on AWS — depth 2 (study, ~3h)

Why: JD emphasises "high-throughput event-driven backends" and lists Lambda, SQS, DynamoDB.
What to know: SQS fan-out, Lambda idempotency, DLQ patterns, visibility timeouts, partial-batch responses.
Resources:

- https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
- https://docs.aws.amazon.com/lambda/latest/operatorguide/retries-on-errors.html
  Exercises: design a Lambda + SQS pipeline that handles poison messages gracefully.

### TypeScript: discriminated unions + branded types — depth 1 (refresh, ~30m)

Why: you used these in the payments project; refresher before a TS-heavy screen.
Resources: https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions

### Distributed systems: exactly-once delivery — depth 3 (deep dive, ~1d)

Why: JD says "experience with exactly-once semantics". Weak spot per your Atlassian retro.
Resources: Kleppmann ch. 5, 8, 9; the AWS builders-library article above.
Exercises: implement a small deduping consumer in TypeScript.

### React 19 server components — depth 2 (study, ~2h)

Why: JD lists "modern React" and the company's blog posts reference RSC.
Resources: https://react.dev/reference/rsc/server-components

### Behavioural: "tell me about a conflict" — depth 1 (refresh, ~30m)

Why: common for the role's behavioural round.
Re-read: your Canva conflict story; tighten to 90 seconds.

## Behavioural questions likely

- "Tell me about a time you disagreed with a PM." → your Canva story (R7)
- "How do you handle on-call burnout?" → your Atlassian runbook story (R3)
- "Why this company?" → see `profile.md` `## Target roles` for `senior-backend-engineer` and your notes on the company

## Strengths to highlight (from your profile)

- 5y TypeScript / 3y Node at scale (relevant to their platform)
- Open-source: chat system in Go (relevant to their messaging product)

## Concerns to address (gaps between JD and profile)

- No production Kubernetes experience → expect "how would you learn K8s fast?" (be honest; pivot to your Terraform / IaC experience)
- JD asks for GraphQL, profile shows REST only → expect a system-design probe; brush up on schema design, not just queries

## Suggested timeline (7 days)

- Day 1–2: event-driven AWS patterns (depth 2)
- Day 3: TypeScript refresher + your payments notes (depth 1)
- Day 4–5: distributed-systems deep dive (depth 3)
- Day 6: React 19 (depth 2) + behavioural story rehearsal (depth 1)
- Day 7: walk through the company's engineering blog + Glassdoor reviews; final review of `meta.md` and `jd.md`

## Reference materials

- https://martinfowler.com/articles/serverless.html
- https://aws.amazon.com/builders-library/
- "Designing Data-Intensive Applications" (Kleppmann) — ch. 5, 8, 9
- https://www.typescriptlang.org/docs/handbook/2/narrowing.html
- https://react.dev/reference/rsc/server-components
```

**Ad-hoc mode**: `jho prepare <url>` and `jho prepare --text "..."` skip writing `prep.md` and just print the formatted plan to stdout. Useful for jobs you haven't tracked yet, or quick "what should I read up on?" passes.

**Manual topics**: `jho prepare <slug> --add "Read the engineering blog"` appends a user-added H3 (or bullet under a "User-added" section) with a marker so the tool can preserve it on `--update`.

**LLM prompt**: `prompts/prep.md`

- Inputs: JD text, profile, target role, days, known-weak topics (optional; seeded from `retro.md` of this app + aggregate weak topics — see "Cross-referencing prep and retro" below).
- Output: zod-validated structured plan (techStack, topics, behavioral, strengths, concerns, timeline, materials).
- Tier 2 guard rails: tech stack must be a subset of JD terms; depth levels must be distributed (not all 3); materials must be real URLs (validated by a HEAD request during eval, not in production — for speed).

**Eval**: `evals/prep/cases.ts` + `expected-prep/<jd-slug>/expected.json`

- Checks: depth distribution (≥ 1 of each), materials are real URLs, timeline sums to ±20% of `days`, strengths/ concerns correctly reference profile, behavioural questions map to real profile stories.

**Cross-referencing prep and retro (v1 read-only)**: the prep prompt can be seeded with the user's known-weak topics from `retro.md` of the same app and from `jho retro --aggregate` output (when run for the same target role). v1 does not write back from retro to prep; the user runs `jho prepare --update` explicitly.

---

## 5. `profile.md` schema

```markdown
# Profile — <Name>

## Contact

- Email, phone, location, LinkedIn, GitHub, website

## Summary

<2–3 sentence pitch>

## Skills

### Languages / Frameworks / Tools / Cloud / Methodologies

## Experience

### <Role> @ <Company> (<start> – <end>)

- Bullets, action-led, quantified

## Education

## Notable projects

### <name> (github.com/...)

- one-liner · tech · impact

## Preferences

- work style, work rights, notice period

## Target roles

The structured list of roles the user is actively pursuing. Generated by the LLM at
`jho init` from the CV + GitHub data, then refined by the user. This section is
the single source of truth for what the user is "looking for" — every other tool
references it.

<!-- jho:target-roles — tool suggests; you decide. Edit freely. -->

### senior-backend-engineer — Senior Backend Engineer [primary]

- Level: Senior (IC4)
- Domain: Backend, distributed systems
- Stack: TypeScript, Node.js, PostgreSQL, AWS, Kubernetes
- Work style: Remote or hybrid (Sydney timezone)
- Compensation: 160k AUD
- Notes: my strongest area; open to platform/infra adjacent roles

### staff-engineer — Staff Engineer [stretch]

- Level: Staff (IC5)
- Domain: Platform, infrastructure
- Stack: same as above + Go
- Work style: Remote or hybrid
- Compensation: 200k AUD
- Notes: aspirational; would need to demonstrate cross-team impact

### engineering-manager — Engineering Manager [secondary]

- Level: M3
- Domain: People management, delivery
- Stack: (agnostic)
- Work style: Hybrid preferred
- Compensation: 180k AUD
- Notes: would be a step sideways; only pursue if hands-on IC roles dry up
```

**Field rules** (H3 per role, slug in the heading):

- `Level` — freeform (e.g. `Senior`, `Staff`, `Principal`, `IC5`, `M3`, `Director`).
- `Domain` — comma-separated keywords (e.g. `Backend`, `Platform`, `Data`).
- `Stack` — comma-separated tech keywords; empty if agnostic.
- `Work style` — one of `Remote`, `Hybrid`, `On-site`, or a freeform note.
- `Compensation` — a number + currency; the user-defined lower bound.
- `Notes` — free text.
- **Priority** (the `[primary | secondary | stretch]` tag in the H3 heading):
  - `primary` — main focus, actively applying
  - `secondary` — open to, applying when seen
  - `stretch` — aspirational, only if the JD is a strong match

The H3 heading always starts with the **slug** (lowercase, alphanumeric + hyphens),
used in `meta.md` frontmatter as `targetRole: <slug>`. The slug is the stable
identifier; the title is display-only.

**How other tools use this**:

- `jho track <url>` — LLM extracts the JD, then suggests a `targetRole` slug
  based on title/level/domain match. User confirms or overrides.
- `jho cover-letter <slug>` — picks which role's experience to emphasize based
  on `meta.md`'s `targetRole`.
- `jho list --role <slug>` — filters applications by target role.
- `jho retro --aggregate --role <slug>` — only aggregates retros for that role.
- `jho profile rebuild` — regenerates the suggested list, prompts before
  overwriting user edits.

## Source

- CV: <path>
- GitHub: <handle>
- Built: <iso>

````

---

## 6. `config.json` schema — two-level, disjoint keys

There are two config files, with **disjoint key sets by design**:

- A **global** one at `<configHome>/config.json` (shared across every campaign): LLM endpoint, GitHub identity, calendar provider, logging defaults, and the location of the data root.
- A **per-campaign** one at `<dataRoot>/campaigns/<name>/config.json` (varies per campaign): where this campaign's `profile.md`, CV, `applied/`, and knowledge base live.

The two layers are *additive*, not an override cascade. `jho config` shows the global file; `jho campaign config` shows the campaign file. The CLI exposes a flat-merged view internally (global then campaign) for callers that want both, but the user-facing commands stay one-source-per-command — there is no merged `jho config show` view, on purpose.

### Global config (`<configHome>/config.json`)

```json
{
  "version": 1,
  "dataRoot": "/home/<user>/job-hunting-organizer-data",
  "llm": { "baseUrl": "http://localhost:11434/v1", "apiKey": "ollama", "model": "llama3.1" },
  "github": { "user": "maxgu", "token": "", "repos": [] },
  "calendar": {
    "defaultProvider": "ics",
    "outlook": { "tenantId": "", "clientId": "", "clientSecret": "" }
  },
  "logging": { "level": "info", "file": "", "redactPaths": [] }
}
```

### Per-campaign config (`<dataRoot>/campaigns/<name>/config.json`)

```json
{
  "version": 1,
  "profile": { "path": "/home/<user>/job-hunting-organizer-data/campaigns/freelance/profile.md" },
  "cv":      { "path": "/home/<user>/job-hunting-organizer-data/campaigns/freelance/cv.pdf" },
  "linkedin": { "url": "https://linkedin.com/in/example" },
  "applied": { "dir": "/home/<user>/job-hunting-organizer-data/campaigns/freelance/applied" },
  "knowledgeBase": {
    "dir": "/home/<user>/job-hunting-organizer-data/campaigns/freelance/knowledge-base"
  }
}
```

`jho config show [--reveal]` shows the global file; `jho campaign config show [--reveal]` shows the campaign file. Output is the redacted body on stdout only — the source path is available separately via `jho config path` / `jho campaign config path`. This means `jho config | jq` works without a flag.

---

## 7. File ownership model

### Markers (visible at the top of every tool-managed file)

```markdown
<!-- jho:meta — frontmatter is tool-managed; body is yours. -->
<!-- jho:start:fetched-jd --> / <!-- jho:end:fetched-jd -->
<!-- jho:cover-letter — generated; edit freely before sending. -->
<!-- jho:qa-log — append-only. Prior entries never read or rewritten. -->
<!-- jho:interview-log — append-only. `jho interview mark` only updates Status: line. -->
<!-- jho:retro — post-mortem for failed interviews. Tool appends a new H2 per retro; never overwrites prior retros. -->
<!-- jho:notes — yours. Tool never touches this file. -->
```

### Per-file behavior

| File                  | Tool writes                                                                       | You can edit               | Tool behavior on your edit                                 |
| --------------------- | --------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------- |
| `meta.md` frontmatter | yes (rebuild from JD + state)                                                     | yes                        | round-tripped, custom fields preserved                     |
| `meta.md` body        | never                                                                             | yes                        | preserved verbatim                                         |
| `jd.md`               | above `jho:start:fetched-jd`                                                      | below `jho:end:fetched-jd` | preserved on re-track                                      |
| `cover-letter.md`     | on regenerate                                                                     | freely                     | prompts on next regenerate                                 |
| `qa.md`               | appends only                                                                      | freely                     | prior entries untouched                                    |
| `interviews.md`       | appends, `Status:` line updates                                                   | freely (except `Status:`)  | mark status via `jho interview mark`                       |
| `retro.md`            | appends new H2 sections; updates `Status:` of a section if interview is re-marked | freely (checklists, notes) | prior retros untouched                                     |
| `prep.md`             | regenerates whole file on `--update`; appends user-added topics on `--add`        | freely                     | prompts on overwrite; user edits preserved unless accepted |
| `notes.md`            | never                                                                             | freely                     | never touched                                              |
| `.index.json`         | on read / staleness                                                               | no (internal)              | cache, regenerated                                         |
| `.counters.json`      | on slug collision                                                                 | no (internal)              | cache, regenerated                                         |

### Conflict detection

Each tool-managed file has a `.toolhash` sidecar with the SHA-256 the tool last wrote. If the file's current hash differs, the tool refuses silent overwrite, shows a diff, asks for confirmation.

### Discovery surfaces

- In-file markers (always visible)
- `jho ownership` — quick-reference table
- `jho ownership --markdown` — same table as markdown for docs
- `jho doctor` — proactive diagnostic
- `jho show <slug>` — per-application ownership footer
- README `## File ownership` section
- AGENTS.md (for AI agents)

### Recovery

`jho repair <slug>` rebuilds frontmatter from sibling files; `jho repair --all` rebuilds indexes, counters, walks all folders.

### Concurrency / file locks (forward-looking)

The tool is designed for single-user, single-process use today, but the CLI, MCP server, and a future local web client will all read and write the same files. To prevent races on multi-step operations (read → LLM → write), `core/locks.ts` (Phase 2) provides:

- `acquireLock(target, fn)` — wraps `proper-lockfile` with sensible defaults (5 retries, 50–500ms backoff, stale-lock detection).
- Lock granularity: the **application folder** (`applied/<slug>/`) for any operation that touches more than one file in that app. The **profile** file for profile rebuild. The **campaign root** for global operations (init, repair --all).
- Every write in `core/fs.ts` calls `acquireLock` implicitly. The `.toolhash` sidecar mechanism still handles _user_-induced conflicts; the lock handles _process_-induced races.
- Cross-platform: `proper-lockfile` works on Linux, macOS, and Windows. No shell-out.
- Cheaper to add this in Phase 2 than to retrofit when the web client lands (see §20).

### The one rule

> **If a comment at the top says `jho:...`, the boundary is right there. If not, the file is yours.**

---

## 8. CLI surface

```
jho                          # top-level overview
jho --version

jho init [<name>] [--cv <path>] [--github <user>] [--linkedin <url>] [--profile <path>] [--yes]
  # Wizard prompts: campaign name (defaults to "default") → LinkedIn URL (optional) → CV path →
  #   GitHub user (+token) → LLM baseUrl/key/model → calendar provider → runs profile build →
  #   reviews generated ## Target roles → writes global + campaign config.json + profile.md
jho config [show|path|edit] [--reveal]
jho campaign config [show|path|edit] [--reveal]
jho rename-campaign <new> [--from <old>]
  # Rename a campaign folder: <global>/campaigns/<old>/ → <global>/campaigns/<new>/.
  # Implicit form: from inside the campaign folder, `jho rename-campaign <new>` infers <old> via --from omission.
  # Validates <new>: rejects empty, '/', '\\', '..', '.', leading '-', any whitespace.
  # Refuses if cwd is inside the campaign being renamed (no self-foot-gun).
  # Takes a proper-lockfile lock on the campaign root for the duration.
  # Atomic `fs.rename` on the same filesystem.
  # Logs: old → new, duration, correlation id.
  # Bare `mv` on the `campaigns/<name>/` folder also works — this command adds
  # validation, a lock, and an audit log. (See decisions log.)

jho profile show | rebuild [--cv <path>] [--github <user>]

jho track <url> [flags]
jho track <slug> [flags]
jho track --paste
jho track --stdin
  flags: --status s --salary r --tag t,t --note text
         --target-role <slug>          # set the target role slug (from profile ## Target roles)
         --yes --verbose --quiet
  # Interactive: when the URL contains no extractable job ID, prompts the user
  #   to supply one manually (optional — skip to proceed without). Skipped in
  #   --yes, --paste, --stdin modes.

jho list [--status s] [--tag t] [--role <slug>] [--json]
jho show [<slug>]         # slug is optional; inferred from cwd if omitted

jho cover-letter [<slug>|url] [--save] [--paste] [--out <path>]
                                  # slug optional (cwd inference); url always explicit
jho answer  [<slug>] "<question>" | --image <path> | --stdin
                                  # slug optional (cwd inference)

jho interview [<slug>] add    --when "..." --type technical --duration 60
                              [--interviewer "..."] [--location "..."]
                              [--provider ics|outlook] [--title "..."]
jho interview [<slug>] list
jho interview [<slug>] mark <n> --status passed|failed|no-show
jho interview [<slug>] notes <n> --append "..."

jho prepare  [<slug>]           # show prep plan (generate if none; slug inferred from cwd)
jho prepare  <slug> --update    # regenerate from current JD + profile
jho prepare  <slug> --add "..." # append a manual topic to prep.md
jho prepare  <url>              # ad-hoc: extract JD, print prep plan, don't save
jho prepare  --text "..."       # ad-hoc: pasted JD, print prep plan, don't save
                                # flags: --days <n> (default 7), --json

jho retro    [<slug>]              # interactive: ask for weak topics, generate learning plan
                                  # slug optional (cwd inference)
jho retro    [<slug>] --show       # print retro for an app
jho retro    [<slug>] --interview <n>  # associate retro with a specific interview
jho retro    [<slug>] --append     # add to an existing retro (more weak topics)
jho retro    --aggregate [--role <slug>] [--include-abandoned]
                                  # recurring weak topics, optionally filtered

jho ownership [--markdown]
jho doctor [<slug>] [--all]
jho repair [<slug>] [--all]

jho stats  [--role <slug>] [--since <date>] [--json]
  # snapshot of the campaign: counts by status, target role, site;
  # funnel + this-month delta; optional LLM-tinged notes (off by default)

jho help [<cmd>|<topic>]

jho mcp                     # start MCP server

Global: --verbose | -v, --quiet | -q, --yes | -y, --no-color, --log-file <path>
```

### `jho stats` — campaign snapshot

Derives a snapshot from the same `meta.md` frontmatter and `applied/.index.json` cache that `jho list` reads. No new on-disk state, no LLM by default. Useful for a quick "where am I?" check, or as the input to a retro at the end of a month.

```
$ jho stats
Campaign: /home/maxgu/job-hunting-organizer   (47 applications, since 2026-01-12)

By status:
    applied      12
    interview     8
    offer         2
    rejected     14
    withdrawn     5
    abandoned     4
    ghosted       2

By target role:
    senior-backend-engineer   18   (38%)
    staff-engineer             9   (19%)
    engineering-manager        5   (11%)
    (unassigned)              15   (32%)

By site:
    seek       28
    linkedin   12
    indeed      7

Funnel (lifetime):
  applied (47) → interview (28, 60%) → offer (4, 9%) → accepted (2, 4%)

This month (June 2026):
  +6 applications  ·  -3 rejections  ·  +1 offer  ·  -1 withdrawn
```

- `core/stats.ts` — pure read of `applied/.index.json` (Phase 5) and `meta.md` frontmatter. Computes counts, funnel, recency. No LLM.
- `accepted` count is the only fuzzy part of the funnel: the enum has no `accepted` status (a successful `offer` is recorded as `offer` with a note in the body). v1 counts `accepted` as the number of `offer` apps that have an `accepted:` line in `meta.md` body OR a `meta.md` body line matching `/accepted|joining/i` in the last 30 days. If neither, the row is omitted rather than guessed.
- Flags: `--role <slug>` (reuses the same filter as `jho list`), `--since <date>` (ISO date or relative: `7d`, `30d`, `90d` — for "this month" deltas), `--json` (machine-readable).
- `--include-notes` (off by default): triggers one small LLM call to extract "top 3 abandonment reasons" from `meta.md` body and `notes.md` of `abandoned` apps. Useful for retros; opt-in because it costs tokens.
- Funnel percentages are derived from current state (no historical snapshots in v1) — they reflect "of all apps in this campaign, where they ended up" rather than "conversion rate through each stage." Documented as such in `--help`.

### Slug argument (CLI only)

Every command that accepts a `<slug>` also accepts the **implicit form**: omit the slug and run from inside the application folder. The slug is inferred from the cwd by matching the folder basename against `^\d{4}-[A-Z][a-z]{2}-\d{2}-.+$` and walking up to the first match under `appliedDir`. See "Slug inference from cwd" above for the full rule. This is a CLI-only convenience; MCP tool calls always pass an explicit slug.

### `--help` design

- Layered: `<cmd> --help` for command, `jho help <cmd>` for pipeable markdown, `jho help <topic>` for conceptual guides, `jho --help` for top-level overview.
- Hand-written synopsis, description, flags, 3–5 realistic examples, see-also references.
- Topics sourced from `docs/help/*.md`. TTY-paged via `less`; otherwise full output.
- Colored via `picocolors`; respects `NO_COLOR` and non-TTY.
- Snapshot-tested to prevent drift.

### `jho help` topics

```
docs/help/
├── file-ownership.md
├── interviews.md
├── calendar.md
├── slug-format.md
├── profile.md
├── application-lifecycle.md
├── troubleshooting.md
└── mcp.md
```

---

## 9. MCP server surface

### Tools

```
init                       { cvPath, githubUser, repos?, name?, email? }
extract_jd                 { url? | text? }
cover_letter               { slug? | url? | text?, save? }
answer_question            { slug?, question, imageBase64?, mimeType? }
track_application          { url? | text?, status?, salary?, tag?, note?, targetRole? }
list_applications          { status?, tag?, role? }
show_application           { slug }
add_interview              { slug, when, type, duration, interviewer?, location?, provider? }
list_interviews            { slug? }                    # omit slug = all upcoming
mark_interview             { slug, interviewId, status }
schedule_interview         { slug, when, type, duration, ... }   # alias of add_interview
post_mortem                { slug, interviewId?, weaknesses: string[], notes?: string }
show_retro                 { slug }
append_retro               { slug, weaknesses: string[], notes?: string }
aggregate_retros           { minOccurrences?: number, role?, includeAbandoned? }   # default 2, includeAbandoned default false
prepare                    { slug? | url? | text?, days?: number, update?: boolean, add?: string }
                            # one of slug/url/text is required; returns formatted plan
                            # update=true regenerates prep.md; add appends a manual topic
read_profile
update_profile             { frontmatterPatch?, bodyAppend? }
get_root
update_config              { partialConfig }            # zod-validated
ownership
doctor                     { slug?, all? }
repair                     { slug?, all? }
get_stats                  { role?, since?, includeNotes? }   # same shape as `jho stats`
```

### Resources

```
profile://current
applied://list
applied://<slug>
applied://<slug>/interviews
applied://<slug>/retro
applied://<slug>/prep
```

### Prompts

```
cover-letter-template
application-qa-template
```

### Server details

- Transport: **stdio** (default). Sock/stream variants are out of scope for v1.
- JSON-RPC request id reused as correlation id.
- Logs: JSON to **stderr only**. Never to stdout.
- Entry: `bin/jho-mcp` shebang. `npx jho-mcp` works after install.

### `package.json` `mcp` block

```json
"mcp": {
  "transport": "stdio",
  "command": "jho-mcp",
  "tools": ["init", "extract_jd", "cover_letter", "answer_question", ...]
}
```

---

## 10. Calendar providers

### Interface

```ts
interface CalendarProvider {
  id: 'ics' | 'outlook';
  createEvent(input: {
    title: string;
    start: Date;
    durationMin: number;
    location?: string;
    description?: string;
    attendees?: string[];
  }): Promise<{ provider: string; id?: string; icsPath?: string; htmlLink?: string }>;
}
```

### Implementations

- **`IcsProvider`** (default, no setup) — writes `<applied>/<slug>/interview-<n>.ics`.
- **`OutlookGraphProvider`** (opt-in) — MSAL device-code flow, tokens cached at `outlook-tokens.json` (mode 0600), `POST /me/events`.
- Future: `GoogleProvider`, `CalDAVProvider` — same interface, one file each.

---

## 11. Logging strategy

### Three rules

1. **stderr only.** Stdout = command output (`jho list --json | jq`).
2. **No user content in logs.** No CV/JD/cover-letter/Q&A content. Log metadata (slugs, model, tokens, duration).
3. **MCP = JSON, CLI = pretty.** Same logger, different transport.

### Levels

`error` / `warn` / `info` / `debug` (silent for tests).

### Control

- `JHO_LOG_LEVEL=debug|info|warn|error|silent`
- `JHO_LOG_FILE=<path>` (optional, `pino-roll` rotation 10MB × 5)
- `--verbose`/`-v` → debug; `--quiet`/`-q` → warn
- `DEBUG=jho:*` (debug package) — independent verbose channel

### Correlation

Short id (e.g. `jho-9f3a`) attached to every log line. For MCP, reuses JSON-RPC request id.

### LLM logging

```
{ level: 'info', correlationId, msg: 'llm.complete',
  model, promptTokens, completionTokens, durationMs }
```

Never the prompt/response. At debug, optional first 200 chars of system prompt (template, not user data).

### Redaction paths (defaults)

```
['cv.content', 'cv.text', 'jd.content', 'jd.text',
 'coverLetter.body', 'qa.answer', 'llm.messages[*].content',
 'config.llm.apiKey', 'config.github.token',
 'config.calendar.outlook.clientSecret',
 'argv.cv', 'argv.image']
```

### Spinners

`ora` on stderr; auto-disabled when stderr is not a TTY. Replaced by a single info line on completion.

### Library choice

**`pino` + `pino-pretty` + `pino-roll` + `debug` + `ora`.** Not winston/consola/Bunyan.

---

## 12. Evals & guard rails (tiered)

### Tier 1 — Structured extraction (high strictness)

`profile-build`, `job-extract`.

- `response_format: { type: 'json_object' }`.
- zod schema validation; **up to 2 retries** with corrective message.
- Temperature 0.1; seed where supported.
- Factual grounding: every name/company/skill in output must substring-match the input.
- Length cap on `jd` (≤ 20,000 chars).

### Tier 2 — Creative generation (medium strictness)

`cover-letter`, `application-qa`.

- Free-form text wrapped in `--- BEGIN/END ---` markers.
- Temperature 0.6.
- Refusal detection: assert no `"I cannot"`, `"I'm just an AI"`, `"as a language model"`, `"as an AI assistant"`. Retry on match.
- Length bounds (cover letter 200–600 words, Q&A 50–400 words).
- Soft profile-grounding: at least 2 profile items referenced; warn-only.

### Tier 3 — Tool internals (max strictness)

Non-LLM. 100% deterministic.

- Slug: `fast-check` property tests, 10,000 random inputs, no collisions.
- Frontmatter: write → read → write byte-identical.
- File writes: atomic (tmp + rename).
- Index/counters JSON: sorted keys, 2-space indent, trailing newline.
- Config serialization: sorted keys, secrets redacted.
- Path resolution: Windows + Linux + macOS, symlinks, `$JHO_CONFIG_HOME` and `$JHO_DATA` overrides, relative paths.

### Eval suite

```
evals/
├── README.md
├── runner.ts
├── fixtures/
│   ├── cv/, jd/, github/
├── profile-build/{cases.ts, expected/, target-roles-cases.ts, expected-target-roles/}
├── job-extract/{cases.ts, expected/}
├── cover-letter/{cases.ts, rubric.md}
├── application-qa/{cases.ts, rubric.md}
├── learning-plan/{cases.ts, rubric.md}
└── prep/{cases.ts, expected/<jd-slug>/expected.json, rubric.md}
```

- `npm run eval` — structural only, fast.
- `npm run eval -- --judge` — adds LLM-as-judge (separate from generation model). Uses [`openevals`](https://github.com/langchain-ai/openevals) (LangChain) for LLM-as-judge evaluation — provides Vitest custom matchers, built-in prompts (correctness, hallucination, relevance), and structured output evaluation. Structural evals (Tier 3) remain vitest-native with no additional dependencies.
- `npm run eval -- --update` — regenerates golden files, prints diffs.
- **Not in CI** (slow, non-deterministic, requires user's LLM).

### Prompt versioning

Each `prompts/*.md` has frontmatter `version`, `recommendedModel`, `recommendedTemperature`, `changelog`. Evals are pinned to a prompt version; mismatch → warning.

### Skipped (intentionally)

- Full LLM-output determinism
- Vector similarity / LLM-judge-only quality scoring
- Online eval collection from real usage
- A/B testing infra
- Heavy eval framework (Braintrust, LangSmith) — would track user data

---

## 13. glama readiness

### `glama.json` (always present)

```json
{
  "$schema": "https://glama.ai/mcp/schemas/server.json",
  "maintainers": ["<github-username>"]
}
```

### Required for good listing

- `LICENSE` (MIT placeholder, swappable).
- `package.json` with `name`, `description`, `keywords`, `bin`, `mcp` block, `license`.
- README with an "MCP Server" section near the top: install, tools, configuration, **privacy**.
- Examples: `examples/mcp-clients/{claude-desktop,cursor,continue}.json`.

### Privacy posture (in README)

> **Your data stays local.** `job-hunting-organizer-mcp` reads your CV from a path you configure, fetches job descriptions from URLs you provide, and calls the LLM endpoint _you_ configure. Nothing is sent to the tool author or to any third party. With a local model (Ollama, OpenCode, LM Studio) the LLM call stays on your machine. The server has zero telemetry, zero analytics, and zero outbound calls except those you explicitly configure.

### Optional (deferrable)

- GitHub Actions CI (boosts maintenance grade).
- Versioned releases / tags (boosts maintenance grade).
- `glama/` folder with assets.
- Field reservation for future `mcp` schema fields.

### Build cost

~30 minutes of effort distributed across phase 1 and phase 8. No rework later.

---

## 14. README outline

1. What this is (1 paragraph).
2. Privacy posture (callout, near the top).
3. Quickstart (`jho init` walkthrough, ~10 steps).
4. File ownership (table + common mistakes).
5. Workflows (apply → cover letter → Q&A → interview loop → offer/reject).
6. CLI reference (every command with examples).
7. MCP reference (tool list, install for Claude/Cursor, screenshots optional).
8. Configuration (`config.json` fields, env precedence, redaction).
9. Calendar providers (ICS default; Outlook setup).
10. Privacy & data model (where data lives, what is and isn't committed).
11. Evals (how to run, when to run).
12. Contributing (deferred until public).
13. License.

---

## 15. AGENTS.md outline

1. Project structure.
2. CLI commands.
3. MCP tools (full list with arguments).
4. File ownership model.
5. Logging conventions.
6. Eval philosophy.
7. Privacy posture.
8. Build/test commands.

---

## 16. Phase plan (each ends in a manual commit by the user)

| #   | Phase                       | Deliverable                                                                               | Commit message                                                                       |
| --- | --------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 0   | Planning artifacts          | `docs/PLAN.md`, `docs/ROADMAP.md`                                                         | `docs: initial plan and roadmap`                                                     |
| 1   | Skeleton & toolchain        | `npm run build` passes; `jho --version` works                                             | `chore: project skeleton with toolchain and CI`                                      |
| 2   | Core infra (no LLM, no net) | `jho config show`, `jho campaign config show`, `jho ownership` work                       | `feat(core): paths, config, logger, slug, frontmatter, markers`                      |
| 3   | LLM client & profile        | `buildProfile({ cvPath, githubUser })` returns profile.md (incl. `## Target roles`)       | `feat(profile): CV parsing, GitHub fetch, LLM-backed profile builder`                |
| 4   | CLI scaffolding & init      | `jho init` is the full onboarding experience                                              | `feat(cli): command surface with full --help, init wizard`                           |
| 5   | JD extraction & track       | `jho track <url>` records (suggests `targetRole` from profile); `jho list --role` filters | `feat(jobs+tracker): URL fetch, JD extract, application creation, list, target-role` |
| 6   | Cover letter & Q&A          | `jho cover-letter`, `jho answer` work                                                     | `feat(generation): cover letter and application Q&A`                                 |
| 7   | Tracker depth               | interviews, doctor, repair, ownership, show                                               | `feat(tracker): interviews, doctor, repair, ownership table`                         |
| 8   | MCP server                  | `npx jho-mcp` works in Claude/Cursor; glama-ready                                         | `feat(mcp): full server with tools, resources, prompts, examples`                    |
| 9   | Calendar                    | ICS default; Outlook opt-in                                                               | `feat(calendar): ICS and Microsoft Graph providers`                                  |
| 10  | Polish & public             | README final, glama submitted, tagged release                                             | `docs: README, help topics, examples, glama-ready`                                   |

Each phase is self-contained, buildable, testable. Earlier phases are smaller; phase 8 is the heaviest.

---

## 17. Open assumptions

- License: MIT (placeholder, swappable).
- Tests: vitest; light coverage in v1, snapshot-heavy.
- No commits by tool — every commit is by the user.
- Outlook: MSAL **device-code** flow (no browser redirect).
- MCP transport: **stdio only** in v1.
- All paths in `config.json` are absolute.
- Single package, not monorepo.
- `applied/.index.json` and `applied/.counters.json` are gitignored caches.
- Legacy `applied/2026-Jun-03-SE-Nuage-Technology-Group.md` is gitignored and untouched; `jho list` does not include it.

---

## 18. Explicitly out of scope (v1)

- Multi-user mode.
- File watchers (inotify).
- Multi-machine sync.
- Browser extension.
- Web UI / TUI dashboard.
- ATS integrations (Greenhouse, Lever, Workday).
- Resume PDF generation.
- Email parsing for inbound responses.
- Multi-language UI.
- Concurrent edit detection beyond `.toolhash`.
- Telemetry of any kind.

> **Multiple campaigns** is in scope (v1): two-level directory structure with config home + data root + `campaigns/<name>/` subfolders, `--campaign <name>` flag with cwd inference. See §3.

---

## 19. Decisions log

| Question                                           | Decision                                                                                                                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Monorepo or single package?                        | Single package.                                                                                                                                                                                                                            |
| LLM provider?                                      | Generic OpenAI-compatible via env/config.                                                                                                                                                                                                  |
| JD fetch?                                          | Generic fetch + LLM extract; `--paste`/stdin fallback.                                                                                                                                                                                     |
| Calendar?                                          | Pluggable; ICS default, Outlook opt-in.                                                                                                                                                                                                    |
| `applied/responses/`?                              | Dropped.                                                                                                                                                                                                                                   |
| `applied/` layout?                                 | Folder per application.                                                                                                                                                                                                                    |
| Slug convention?                                   | `YYYY-MMM-DD-roleAbbr-companySlug[-jobId][-n]`.                                                                                                                                                                                            |
| CV / profile location?                             | Outside repo, per campaign: `<dataRoot>/campaigns/<name>/cv.<ext>`.                                                                                                                                                                        |
| `applied/.index.json` in git?                      | No — gitignored derived cache.                                                                                                                                                                                                             |
| `applied/.counters.json`?                          | No — gitignored derived cache.                                                                                                                                                                                                             |
| Legacy `2026-Jun-03-SE-Nuage-Technology-Group.md`? | Untouched, gitignored, not read by tool.                                                                                                                                                                                                   |
| Repo data dirs?                                    | Removed (only legacy MD remains).                                                                                                                                                                                                          |
| Data layout?                                       | Two-level: config home (`~/.job-hunting-organizer/`) for global `config.json` and `.locks/`, and data root (`~/job-hunting-organizer-data/`) for `campaigns/<name>/`. Both are relocated only by their respective env vars (no CLI flags). |
| Config layout?                                     | Two-level: global config at `<configHome>/config.json` + per-campaign config at `<dataRoot>/campaigns/<name>/config.json`. Disjoint key sets — global carries LLM / GitHub / calendar / logging, campaign carries profile / CV / applied / knowledge-base. `jho config` and `jho campaign config` are separate commands; no merged `show` view, no `--global` flag. |
| Profile location?                                  | Per campaign: `<dataRoot>/campaigns/<name>/profile.md`.                                                                                                                                                                                    |
| Global-root CLI flag?                              | No — `$JHO_CONFIG_HOME` and `$JHO_DATA` env vars only (matches git, VS Code, ssh config location).                                                                                                                                         |
| Campaign selection?                                | Explicit `--campaign <name>` flag, or cwd-inferred from inside `<dataRoot>/campaigns/<name>/`. Default: `default`.                                                                                                                         |
| Rename a campaign?                                 | `jho rename-campaign <new> [--from <old>]`. Validates name, takes a lock, atomic `fs.rename`, logs the move. Bare `mv` on `campaigns/<name>/` is also supported as an escape hatch.                                                          |
| `webServer` config block?                          | Removed. Was a placeholder for a future web client; can be added back when `jho web` lands.                                                                                                                                                |
| File ownership model?                              | In-file markers + `.toolhash` sidecars + `jho ownership` + `jho doctor` + `jho show` footer.                                                                                                                                               |
| Logging?                                           | `pino` to stderr; redaction built-in; correlation ids.                                                                                                                                                                                     |
| `--help` quality?                                  | Hand-written, ≥ 3 examples per command, layered (cmd/topic).                                                                                                                                                                               |
| Evals?                                             | Lightweight, manual, not in CI; tiered guard rails.                                                                                                                                                                                        |
| glama?                                             | `glama.json` from phase 1; full readiness by phase 8.                                                                                                                                                                                      |
| Phasing?                                           | 10 phases, manual commits at phase boundaries.                                                                                                                                                                                             |
| Init wizard prompts?                               | `@clack/prompts` with `clack.group()` for sequential flow. All fields pre-filled from existing config on re-init. LLM provider/model lists not maintained — raw text fields for flexibility. Target roles table shown even in `--yes` mode for transparency. Global config always written (shallow merge preserves untouched fields). |
| Init wizard graceful degradation?                  | CV, GitHub, and LLM are all optional in interactive mode. If CV + LLM provided → auto-build profile. If `--profile <path>` → copy existing profile. Otherwise → create skeleton `profile.md` with placeholder structure and `<!-- jho:target-roles -->` marker. User can edit manually or re-run with CV/LLM later. |
| Calendar skip?                                      | Calendar provider prompt includes "None" option → sets `defaultProvider: 'none'` in config. Not permanent — user can re-run `jho init` or edit config to enable later. Calendar commands check provider and show helpful message if `'none'`. |

---

## 20. Web client readiness (forward-looking)

This section captures why the current design is already web-client-friendly and which small items we add now so a future `jho web` (or equivalent) is cheap to build. No code is written for the web client in v1; this is for future reference.

### Why the design is already web-ready

- **Filesystem as the source of truth.** No DB, no proprietary state. A web client reads and writes the exact same markdown + JSON files as the CLI and MCP server.
- **`core/*` is the shared layer.** CLI, MCP, and any future web client all call the same `core/paths`, `core/config`, `core/fs`, `core/locks`, `core/slug`, `core/frontmatter`, `core/markers`, the LLM module, calendar providers, etc. A web server is just another consumer of the same core.
- **Pluggable everywhere that matters.** Generic OpenAI-compatible LLM client, pluggable calendar providers, file-ownership markers that work for any process touching the files.
- **Markdown everywhere.** A web UI renders `profile.md`, `cover-letter.md`, `retro.md`, etc. with any markdown lib — no data migration needed.
- **Single-user, local-first posture.** The natural v1 web client is `jho web` → `http://127.0.0.1:7331` with no auth, reading the same campaign root as the CLI. No new privacy story to invent.

### Forward-looking items (cheaper now, big payoff later)

These are the only items worth doing in v1 for web-client readiness. One of them is baked in; three are deferred. The fifth item originally proposed (a `webServer` placeholder in `config.json`) was removed — the schema is now minimal, and a web server can add its own port/host config when it lands.

| #   | Item                                                                                             | When      | Status                                           |
| --- | ------------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------ |
| 1   | `core/locks.ts` — `acquireLock` via `proper-lockfile`                                            | Phase 2   | **baked in** (see §7 "Concurrency / file locks") |
| 2   | `core/watcher.ts` — chokidar-based file-watcher with `file-changed` / `toolhash-mismatch` events | Phase 11+ | deferred                                         |
| 3   | HTTP+SSE transport for the MCP server                                                            | Phase 11+ | deferred                                         |
| 4   | `core/jobs.ts` — async job runner for long LLM ops with progress                                 | Phase 11+ | deferred                                         |

### What the design does NOT block

- **Multi-user / auth**: out of scope for the web client too. Local-first stays.
- **Cloud / hosted web**: explicitly out of scope (privacy posture; see §18). The web client is a local daemon bound to `127.0.0.1` by default; binding to a non-loopback address is a deliberate user override with the usual security warnings.
- **A different data store** (SQLite, etc.): the markdown + JSON layout is the contract; the storage backend is an implementation detail of `core/fs` and `core/paths`. A future web client can adopt a SQLite cache for fast listing without changing the on-disk format.
- **Tauri / Electron / browser-only SPAs**: all viable — they would just import `core/*` (Node) or call a small HTTP shim over it.

### Open questions for Phase 11+ (do not decide now)

- Web client framework (Hono + server-rendered? Vite SPA + tiny Node API? Tauri?)
- Real-time updates: SSE vs. WebSocket vs. polling
- Auth model for non-loopback binding (out of scope for v1 web client, but the question will resurface)
- Mobile-friendly layout: defer until web is used daily

This section is a forward-pointer, not a commitment. Treat it as "if/when we build a web client, these are the only items the current design is missing, and two of them are already in the v1 plan."
````
