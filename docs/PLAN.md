# Plan — `job-hunting-organizer`

A local-first CLI + MCP server that helps run a job-hunting campaign: profile from CV + GitHub, tailored cover letters, application Q&A, interview pipeline tracking, and calendar integration. All user data lives outside the repo at `~/job-hunting-organizer/` (overridable via `$JHO_ROOT`).

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

| Path                                            | Purpose                                        | Git? |
| ----------------------------------------------- | ---------------------------------------------- | ---- |
| `~/job-hunting-organizer/config.json`           | Global settings (paths, LLM, GitHub, calendar) | no   |
| `~/job-hunting-organizer/profile.md`            | Generated profile                              | no   |
| `~/job-hunting-organizer/cv.<ext>`              | User's CV (path configurable)                  | no   |
| `~/job-hunting-organizer/applied/`              | Per-application folders                        | no   |
| `~/job-hunting-organizer/knowledge-base/local/` | Raw extracted text cache (cv, github, jobs)    | no   |
| `~/job-hunting-organizer/outlook-tokens.json`   | MSAL tokens (mode 0600)                        | no   |
| `$JHO_ROOT`                                     | Override of campaign root                      | n/a  |

Resolution precedence: **CLI flag → env var → `config.json` → default `~/job-hunting-organizer/`**.

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
- `jobId` = extracted from URL when present (Seek trailing numeric; LinkedIn `/view/<id>`; Indeed `jk=`).
- `-{n}` = integer suffix on collision; counter persisted in `.counters.json`.

### `meta.md` frontmatter

```yaml
slug: 2026-Jun-03-SE-Nuage-Technology-Group-92448554
status: applied | interview | offer | rejected | withdrawn | ghosted
appliedOn: 2026-06-03
title: Software Engineer
company: Nuage Technology Group
location: Sydney NSW
site: Seek
link: https://au.seek.com/job/92448554?ref=applied
salary: ''
tags: [typescript, react, backend]
```

Body: user-owned (untouched by tool).

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

- target roles, work style, comp floor, work rights, notice period

## Source

- CV: <path>
- GitHub: <handle>
- Built: <iso>
```

---

## 6. `config.json` schema

```json
{
  "version": 1,
  "root": "/home/<user>/job-hunting-organizer",
  "llm": { "baseUrl": "http://localhost:11434/v1", "apiKey": "ollama", "model": "llama3.1" },
  "profile": { "path": "/home/<user>/job-hunting-organizer/profile.md" },
  "cv": { "path": "/home/<user>/job-hunting-organizer/cv.pdf" },
  "github": { "user": "maxgu", "token": "", "repos": [] },
  "applied": { "dir": "/home/<user>/job-hunting-organizer/applied" },
  "knowledgeBase": { "dir": "/home/<user>/job-hunting-organizer/knowledge-base" },
  "calendar": {
    "defaultProvider": "ics",
    "outlook": { "tenantId": "", "clientId": "", "clientSecret": "" }
  },
  "logging": { "level": "info", "file": "", "redactPaths": [] }
}
```

`jho config show` redacts secrets. `jho config show --reveal` shows all (with confirmation).

---

## 7. File ownership model

### Markers (visible at the top of every tool-managed file)

```markdown
<!-- jho:meta — frontmatter is tool-managed; body is yours. -->
<!-- jho:start:fetched-jd --> / <!-- jho:end:fetched-jd -->
<!-- jho:cover-letter — generated; edit freely before sending. -->
<!-- jho:qa-log — append-only. Prior entries never read or rewritten. -->
<!-- jho:interview-log — append-only. `jho interview mark` only updates Status: line. -->
<!-- jho:notes — yours. Tool never touches this file. -->
```

### Per-file behavior

| File                  | Tool writes                     | You can edit               | Tool behavior on your edit             |
| --------------------- | ------------------------------- | -------------------------- | -------------------------------------- |
| `meta.md` frontmatter | yes (rebuild from JD + state)   | yes                        | round-tripped, custom fields preserved |
| `meta.md` body        | never                           | yes                        | preserved verbatim                     |
| `jd.md`               | above `jho:start:fetched-jd`    | below `jho:end:fetched-jd` | preserved on re-track                  |
| `cover-letter.md`     | on regenerate                   | freely                     | prompts on next regenerate             |
| `qa.md`               | appends only                    | freely                     | prior entries untouched                |
| `interviews.md`       | appends, `Status:` line updates | freely (except `Status:`)  | mark status via `jho interview mark`   |
| `notes.md`            | never                           | freely                     | never touched                          |
| `.index.json`         | on read / staleness             | no (internal)              | cache, regenerated                     |
| `.counters.json`      | on slug collision               | no (internal)              | cache, regenerated                     |

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

### The one rule

> **If a comment at the top says `jho:...`, the boundary is right there. If not, the file is yours.**

---

## 8. CLI surface

```
jho                          # top-level overview
jho --version

jho init [--root <path>] [--cv <path>] [--github <user>] [--yes]
jho config [show|path|edit] [--reveal]
jho root

jho profile show | rebuild [--cv <path>] [--github <user>]

jho track <url> [flags]
jho track <slug> [flags]
jho track --paste
jho track --stdin
  flags: --status s --salary r --tag t,t --note text --yes --verbose --quiet

jho list [--status s] [--tag t] [--json]
jho show <slug>

jho cover-letter <slug|url> [--save] [--paste] [--out <path>]
jho answer  <slug> "<question>" | --image <path> | --stdin

jho interview <slug> add    --when "..." --type technical --duration 60
                              [--interviewer "..."] [--location "..."]
                              [--provider ics|outlook] [--title "..."]
jho interview <slug> list
jho interview <slug> mark <n> --status passed|failed|no-show
jho interview <slug> notes <n> --append "..."

jho ownership [--markdown]
jho doctor [<slug>] [--all]
jho repair [<slug>] [--all]
jho help [<cmd>|<topic>]

jho mcp                     # start MCP server

Global: --verbose | -v, --quiet | -q, --yes | -y, --no-color, --log-file <path>
```

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
track_application          { url? | text?, status?, salary?, tag?, note? }
list_applications          { status?, tag? }
show_application           { slug }
add_interview              { slug, when, type, duration, interviewer?, location?, provider? }
list_interviews            { slug? }                    # omit slug = all upcoming
mark_interview             { slug, interviewId, status }
schedule_interview         { slug, when, type, duration, ... }   # alias of add_interview
read_profile
update_profile             { frontmatterPatch?, bodyAppend? }
get_root
update_config              { partialConfig }            # zod-validated
ownership
doctor                     { slug?, all? }
repair                     { slug?, all? }
```

### Resources

```
profile://current
applied://list
applied://<slug>
applied://<slug>/interviews
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
- Path resolution: Windows + Linux + macOS, symlinks, `$JHO_ROOT` override, relative paths.

### Eval suite

```
evals/
├── README.md
├── runner.ts
├── fixtures/
│   ├── cv/, jd/, github/
├── profile-build/{cases.ts, expected/}
├── job-extract/{cases.ts, expected/}
├── cover-letter/{cases.ts, rubric.md}
└── application-qa/{cases.ts, rubric.md}
```

- `npm run eval` — structural only, fast.
- `npm run eval -- --judge` — adds LLM-as-judge (separate from generation model).
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

| #   | Phase                       | Deliverable                                               | Commit message                                                          |
| --- | --------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| 0   | Planning artifacts          | `docs/PLAN.md`, `docs/ROADMAP.md`                         | `docs: initial plan and roadmap`                                        |
| 1   | Skeleton & toolchain        | `npm run build` passes; `jho --version` works             | `chore: project skeleton with toolchain and CI`                         |
| 2   | Core infra (no LLM, no net) | `jho root`, `jho config show`, `jho ownership` work       | `feat(core): paths, config, logger, slug, frontmatter, markers`         |
| 3   | LLM client & profile        | `buildProfile({ cvPath, githubUser })` returns profile.md | `feat(profile): CV parsing, GitHub fetch, LLM-backed profile builder`   |
| 4   | CLI scaffolding & init      | `jho init` is the full onboarding experience              | `feat(cli): command surface with full --help, init wizard`              |
| 5   | JD extraction & track       | `jho track <url>` records; `jho list` shows               | `feat(jobs+tracker): URL fetch, JD extract, application creation, list` |
| 6   | Cover letter & Q&A          | `jho cover-letter`, `jho answer` work                     | `feat(generation): cover letter and application Q&A`                    |
| 7   | Tracker depth               | interviews, doctor, repair, ownership, show               | `feat(tracker): interviews, doctor, repair, ownership table`            |
| 8   | MCP server                  | `npx jho-mcp` works in Claude/Cursor; glama-ready         | `feat(mcp): full server with tools, resources, prompts, examples`       |
| 9   | Calendar                    | ICS default; Outlook opt-in                               | `feat(calendar): ICS and Microsoft Graph providers`                     |
| 10  | Polish & public             | README final, glama submitted, tagged release             | `docs: README, help topics, examples, glama-ready`                      |

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

- Multi-user / multi-campaign mode.
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

---

## 19. Decisions log

| Question                                           | Decision                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Monorepo or single package?                        | Single package.                                                                              |
| LLM provider?                                      | Generic OpenAI-compatible via env/config.                                                    |
| JD fetch?                                          | Generic fetch + LLM extract; `--paste`/stdin fallback.                                       |
| Calendar?                                          | Pluggable; ICS default, Outlook opt-in.                                                      |
| `applied/responses/`?                              | Dropped.                                                                                     |
| `applied/` layout?                                 | Folder per application.                                                                      |
| Slug convention?                                   | `YYYY-MMM-DD-roleAbbr-companySlug[-jobId][-n]`.                                              |
| CV / profile location?                             | Outside repo, default `~/job-hunting-organizer/`.                                            |
| `applied/.index.json` in git?                      | No — gitignored derived cache.                                                               |
| `applied/.counters.json`?                          | No — gitignored derived cache.                                                               |
| Legacy `2026-Jun-03-SE-Nuage-Technology-Group.md`? | Untouched, gitignored, not read by tool.                                                     |
| Repo data dirs?                                    | Removed (only legacy MD remains).                                                            |
| Global config?                                     | At campaign root: `~/job-hunting-organizer/config.json`.                                     |
| File ownership model?                              | In-file markers + `.toolhash` sidecars + `jho ownership` + `jho doctor` + `jho show` footer. |
| Logging?                                           | `pino` to stderr; redaction built-in; correlation ids.                                       |
| `--help` quality?                                  | Hand-written, ≥ 3 examples per command, layered (cmd/topic).                                 |
| Evals?                                             | Lightweight, manual, not in CI; tiered guard rails.                                          |
| glama?                                             | `glama.json` from phase 1; full readiness by phase 8.                                        |
| Phasing?                                           | 10 phases, manual commits at phase boundaries.                                               |
