# AGENTS

This document is for AI agents (Claude, Cursor, etc.) using the `job-hunting-organizer` MCP server or contributing to the tool itself. It complements the user-facing [README](README.md) and the [plan](docs/PLAN.md).

## Project at a glance

- **Type**: local-first CLI + MCP server
- **Language**: TypeScript (strict, ESM, Node ≥ 20)
- **Package layout**: single package (not monorepo)
- **LLM**: generic OpenAI-compatible client (Ollama, OpenCode, LM Studio, OpenAI, etc.)
- **Data location**: two external directories under the user's home; never inside the repo. The **config home** (`~/.job-hunting-organizer/`, override with `$JHO_CONFIG_HOME`) holds the global `config.json` and `.locks/`. The **data root** (`~/job-hunting-organizer-data/`, override with `$JHO_DATA`) holds `campaigns/<name>/` and all user-authored working data. See [Data layout](#data-layout-two-level-config-home--data-root).
- **Campaign selection**: per-command `--campaign <name>`, or cwd-inferred when run from inside `<dataRoot>/campaigns/<name>/`. MCP tool calls always pass an explicit campaign name.

## Data layout (two-level: config home + data root)

The tool stores its state under **two** directories under the user's home: a small **config home** for the global `config.json` and lock sidecars, and a separate **data root** that holds all per-campaign working data. The two live side by side and serve clearly different roles — config is small, write-rarely, and may have stricter permissions; data is large, write-often, and may sit on a different filesystem.

```
~/job-hunting-organizer/                       # config home (override with $JHO_CONFIG_HOME)
├── config.json                                # global: LLM, GitHub, calendar, logging
└── .locks/                                    # proper-lockfile sidecars

~/job-hunting-organizer-data/                  # data root (override with $JHO_DATA)
└── campaigns/
    ├── default/                               # default campaign (auto-created on first `jho init`)
    │   ├── config.json                        # per-campaign: profile path, CV path, LinkedIn URL, applied dir, KB dir
    │   ├── profile.md                         # candidate profile, target roles
    │   ├── backups/                           # profile backups on re-init (profile.YYYY-MM-DD_HH-mm-ss.md.bak)
    │   ├── applied/                           # folder per application
    │   │   └── YYYY-MMM-DD-role-co-jobid/
    │   └── knowledge-base/
    └── freelance/                             # second campaign (created via `jho init freelance`)
        └── ...
```

The config home is fixed; the data root is fixed; campaigns are subfolders of the data root. Power users can relocate **each** independently via its env var (no CLI flags by design — matches `git`, `VS Code`, `ssh` config location conventions). Campaign selection: `jho --campaign <name> ...` (explicit) or cwd-inferred from `<dataRoot>/campaigns/<name>/`. MCP tool calls always pass an explicit campaign name.

**Renaming a campaign**: the folder name is the only thing that identifies a campaign; nothing on disk references it elsewhere. `jho rename-campaign <new> [--from <old>]` is the validated path (validates `<new>`, takes a `proper-lockfile` lock, atomic `fs.rename`, logs the move). Bare `mv` on `<dataRoot>/campaigns/<old>/` is also supported as an escape hatch — the tool will pick up the new name on the next call.

## Repo structure

```
.
├── bin/                # CLI and MCP server entry points (jho, jho-mcp)
├── src/
│   ├── cli/            # CLI commands
│   ├── mcp/            # MCP server
│   └── core/           # shared business logic (no I/O boundaries)
│       ├── applications/  # application CRUD: create, update, read, list; writes meta.md + jd.md + index
│       │   ├── application-qa.ts  # Q&A answer generation (LLM-backed, append-only qa.md)
│       │   ├── applications.ts    # core CRUD operations
│       │   ├── cover-letter.ts    # cover letter generation (LLM-backed, marker-aware write)
│       │   ├── index-builder.ts   # build/update applied/.index.json from folder listing
│       │   ├── meta-schema.ts     # Zod schema for meta.md frontmatter
│       │   └── types.ts           # application-specific types
│       ├── interviews/  # interview pipeline management (no LLM, H2-based append-only)
│       ├── retro/       # post-mortem retros with LLM-backed learning plans + cross-app aggregation
│       ├── prepare/     # pre-interview prep plans (LLM-backed, toolhash sidecar)
│       ├── doctor/      # campaign diagnostics
│       ├── repair/      # auto-repair (frontmatter, indexes, counters)
│       ├── jobs/        # JD fetch, extraction (single LLM call), target-role suggestion
│       ├── track/       # track orchestration (create/update/refresh)
│       ├── init/        # init wizard orchestration
│       ├── stats/       # campaign snapshot: counts by status/role/site, funnel, this-month delta
│       ├── list/        # list applications with filters
│       ├── types.ts     # shared interfaces and type aliases consumed by 2+ modules (consumed via `import type`); private/internal types stay colocated with their module
│       └── tests/       # colocated vitest suite
├── prompts/            # versioned LLM prompt templates
├── evals/              # lightweight eval suite (not in CI)
├── docs/
│   ├── PLAN.md         # full design plan
│   ├── ROADMAP.md      # phased build plan
│   └── help/           # conceptual guides for `jho help <topic>`
├── examples/           # MCP client configs (claude-desktop, cursor, continue)
├── .github/workflows/  # CI (lint, typecheck, test, build)
├── glama.json          # glama.ai MCP registry metadata
├── tsconfig.json       # TypeScript configuration
├── tsup.config.ts      # tsup build configuration
├── vitest.config.ts    # vitest test configuration
└── package.json
```

## Build & test commands

```sh
npm install
npm run build        # tsup → dist/
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run format:check # prettier
npm test             # vitest
npm run eval         # lightweight LLM eval suite (manual)
```

## CLI commands (planned)

```
jho init [<name>] [--cv <path>] [--github <user>] [--linkedin <url>] [--profile <path>] [--yes]
  # wizard: LinkedIn URL (optional) → CV path → GitHub user + token → LLM config → calendar →
  #   profile build (LLM) → target-roles review → write config + profile.md
  # --yes: skip prompts (uses env vars for LLM; missing CV/LLM → skeleton profile)
  # --linkedin <url>: skip LinkedIn prompt (JHO_LINKEDIN_URL env var also pre-fills)
  # --profile <path>: copy existing profile.md, skip build
  # Re-init: warns if campaign exists; always merges global config
  # Calendar: ICS / Outlook / None (user can enable later)
  # Graceful degradation: if CV or LLM missing, creates skeleton profile.md
jho config show|path    # show the global config (in the config home); secrets redacted
jho campaign config show|path  # show the active campaign's config (in the data root); secrets redacted
jho rename-campaign <new> [--from <old>]  # rename a campaign folder (or `mv` the folder directly)
jho profile show|rebuild
jho track <url>         # record a new application (or update by slug); suggests target role
jho track <url> --paste # paste JD from clipboard, extract, create application
jho track <url> --stdin # read JD from stdin pipe, extract, create application
jho track <slug> [--status X] [--salary X] [--tag X] [--note X] [--target-role X] [--steer X]
  # update existing application by slug (or cwd-inferred)
  # --steer: custom LLM instructions for JD extraction (stored in jd.md)
jho list [--status s] [--tag t] [--role <slug>] [--json]
  # list all applications; filters are AND-combined
jho show [<slug>]       # slug is optional; inferred from cwd if omitted
jho cover-letter [<slug>] [--no-save] [--steer <text>]
                                  # slug optional (cwd inference)
                                  # --steer: custom LLM instructions (overwrites stored steer)
jho cover-letter show [<slug>]   # display existing cover letter
jho answer  [<slug>] "<question>" | --image <path> | --stdin [--steer <text>]
                                  # slug optional (cwd inference)
                                  # --steer: custom LLM instructions for this answer
jho answer show [<slug>]         # display existing Q&A entries
jho show [<slug>]       # show one application with file-ownership footer
jho interview [<slug>] {add,list,mark,notes}  # manage interview pipeline; --when, --type, --duration, --interviewer, --location; mark --status, notes --append
jho prepare [<slug>]    # pre-interview prep: topics to brush up, behavioural, timeline (from JD + profile); --add, --text, --days, --steer, --json
jho prepare <url>       # ad-hoc prep from URL (print to stdout, don't save)
jho prepare --text "..."# ad-hoc prep from pasted text
jho retro [<slug>]      # post-mortem for failed interviews; generates a learning plan; --steer <text>, --interview <n>
jho retro show [<slug>] # display existing retro
jho retro append [<slug>] [--weak-topics <topics>] [--notes <text>] [--steer <text>]
                        # add weak topics to existing retro
jho retro aggregate [--role <slug>] [--include-abandoned]
                        # recurring weak topics across all apps
jho ownership           # what you can/can't edit
jho doctor [<slug>]     # diagnose the campaign or a single app; --all
jho repair [<slug>]     # attempt auto-repair; --all for campaign-wide
jho stats [--role <slug>] [--since <date|7d|30d|90d>] [--json]
  # campaign snapshot: counts by status / role / site, funnel, this-month delta
jho logs [--tail <n>] [--level <level>] [--json] [--path]
  # pretty-print the log file (JSON -> human-readable); --json for raw lines,
  # --path for the file location. Log file is always JSON (for jq/grep/aggregators).
jho help [<cmd>|<topic>]
jho mcp                 # start MCP server
```

**Slug inference**: every command that accepts a `<slug>` also accepts the implicit form — omit the slug and run from inside the application folder. The slug is inferred from the cwd by matching the folder basename against `^\d{4}-[A-Z][a-z]{2}-\d{2}-.+$` and walking up to the first match under `appliedDir`. CLI-only convenience; MCP tool calls always pass an explicit slug. If neither explicit slug nor cwd inference yields a slug, exit with an error and the hint: `pass a slug, or run from inside the application folder (e.g. cd applied/<slug>)`.

**Campaign inference**: every command that targets a campaign accepts `--campaign <name>` (explicit) or infers the campaign from the cwd by walking up to a folder named `campaigns` and using the directory below it. The default is `default`. CLI-only convenience; MCP tool calls always pass an explicit campaign name. If neither an explicit `--campaign` flag nor cwd inference yields a campaign, the `default` campaign is used.

## MCP tools (planned)

`init`, `extract_jd`, `cover_letter`, `answer_question`, `track_application`, `list_applications`, `show_application`, `add_interview`, `list_interviews`, `mark_interview`, `schedule_interview`, `post_mortem`, `show_retro`, `append_retro`, `aggregate_retros`, `prepare`, `read_profile`, `update_profile`, `get_root`, `get_campaign`, `list_campaigns`, `update_config`, `ownership`, `doctor`, `repair`, `get_stats`.

## Resources (planned)

`profile://current`, `applied://list`, `applied://<slug>`, `applied://<slug>/interviews`, `applied://<slug>/retro`, `applied://<slug>/prepare`.

## Prompts (versioned LLM templates)

| Prompt              | Phase | Purpose                                          |
| ------------------- | ----- | ------------------------------------------------ |
| `profile-build.md`  | 3d    | Generate profile.md from CV + GitHub             |
| `jd-extract.md`     | 5b    | Extract structured JD from raw text (Tier 1)     |
| `suggest-role.md`   | 5c    | Suggest best-matching target role from profile   |
| `cover-letter.md`   | 6a    | Generate tailored cover letter (Tier 2)          |
| `application-qa.md` | 6b    | Tailor answer to application question (Tier 2)   |
| `learning-plan.md`  | 7b    | Generate learning plan from weak topics (Tier 2) |
| `prepare.md`        | 7c    | Generate pre-interview prep plan (Tier 2)        |

## File ownership model

**The one rule**: _If a comment at the top of the file says `jho:...`, the boundary is right there. If not, the file is yours._

| File                                                | Tool writes                                                                   | Edit freely?                                        | Tool behavior on your edit                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| `meta.md` (the metadata fields at the top)          | yes (rewrites from the job ad + your current status)                          | yes (add your own key:value lines)                  | your extra fields are kept; the rest is rewritten               |
| `meta.md` (everything below the metadata fields)    | never                                                                         | yes                                                 | kept exactly as you wrote it                                    |
| `jd.md` (the auto-fetched job ad, at the top)       | yes (replaces it when you re-run `jho track`)                                 | no (the tool owns this section)                     | your edits are lost on the next `jho track`                     |
| `jd.md` (`<!-- jho:steer: -->` marker)              | when you run `jho track --steer`                                              | yes (edit the marker directly)                      | overwritten by `--steer`; no flag preserves existing            |
| `jd.md` (everything below the auto-fetched section) | never                                                                         | yes                                                 | kept when you re-run `jho track`                                |
| `cover-letter.md`                                   | when you re-run `jho cover-letter`; includes `<!-- jho:steer: -->` marker     | yes                                                 | asks before overwriting; steer overwritten by `--steer`         |
| `qa.md`                                             | appends new entries; `- Steer:` line per entry when `--steer` provided        | yes                                                 | older entries stay as you wrote them; steer stored per-entry    |
| `interviews.md`                                     | appends new entries; updates the current status line                          | yes (except the current status line)                | change the status with `jho interview mark`                     |
| `retro.md`                                          | appends a new section per retro                                               | yes (your notes and checklists inside a section)    | older retro sections stay as you wrote them                     |
| `prepare.md`                                        | rewrites on each `jho prepare`; appends topics on `--add`                     | yes                                                 | asks before overwriting; your edits are kept unless you accept  |
| `profile.md` (the "Target roles" section)           | suggests roles on `jho campaign init` and `profile rebuild`                   | yes (titles, fields, priority)                      | asks before overwriting                                         |
| `backups/profile.*.md.bak`                          | created on re-init (before profile overwrite)                                 | no (tool-managed backups)                           | previous profile versions preserved; safe to delete manually    |
| `notes.md`                                          | never                                                                         | yes                                                 | this file is entirely yours — the tool never reads or writes it |
| `applied/.index.json`                               | regenerated when the tool reads it (to refresh the listing)                   | no (the tool regenerates it; not for human editing) | your edits are lost — it is regenerated automatically           |
| `applied/.counters.json`                            | when two applications need the same folder name (so a -2, -3 suffix is added) | no (the tool regenerates it; not for human editing) | your edits are lost — it is regenerated automatically           |

Each tool-managed file has a `.toolhash` sidecar. If the file's current hash differs from the sidecar, the tool refuses silent overwrite and shows a diff.

**Discoverability**: in-file markers, `jho ownership`, `jho doctor`, README, and this file.

## Logging conventions

The codebase has three output channels, each serving a different audience. Mixing them is **expected** — they're layered, not redundant.

### Output channels

| Channel                             | Purpose                           | Audience                     | Destination                             | When to use                                                                              |
| ----------------------------------- | --------------------------------- | ---------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| **`@clack/prompts` (`clackLog.*`)** | Styled interactive UI             | User in a wizard/flow        | Terminal (with `✔ ✖ ⚠` symbols, colors) | `wizard.ts`, `profile-builder.ts`, `roles.ts`, `prompts.ts`, interactive cancel messages |
| **`process.stderr.write(...)`**     | Plain user-facing errors/messages | User running the CLI         | stderr (plain text)                     | Stub commands, validation failures, `error: ...` lines in `cli/commands/*.ts`            |
| **`log.*` (pino)**                  | Structured diagnostics            | Developer/operator debugging | File by default (or silenced)           | Throughout `src/core/` for observability — never use to talk to the user                 |

### Decision tree

1. Are you in an **interactive wizard** and want styled output? → `clackLog.info/warn/success`
2. Are you **reporting an error to the user** (plain text, non-styled)? → `process.stderr.write('error: ...')` + `process.exit(1)`
3. Are you **logging a lifecycle event for debugging**? → `log.info/debug/warn/error`

### Pino specifics

- By default, logs are appended to `<config home>/jho.log` (append-only, no rotation). Override the path via `JHO_LOG_FILE` env var or `logging.file` in `config.json`. Suppress file logging entirely with `logging.disableFileLogging: true`.
- **No terminal output ever** by default — stdout is reserved for command output (so pipes like `jho list --json | jq .` keep working), and pino logs go to file only.
- No user content is logged (no CV / JD / cover letter / Q&A text). Metadata only (slugs, model, tokens, duration).
- MCP server logs are JSON. CLI logs are JSON (always written to file, never to terminal by default).
- When `--verbose` is passed (see Phase 5d3), the logger switches to terminal output (pretty in TTY, JSON otherwise) at `debug` level for that single run, temporarily overriding `disableFileLogging`.
- Every log line carries a correlation id; MCP reuses the JSON-RPC request id.
- Secrets in config are redacted by default; `jho config show --reveal` shows all (with confirmation).
- Use `moduleLogger(import.meta.url)` instead of `childLogger({ module: '...' })` at module scope — it's rename-proof (the `module` binding derives from the file path).

## Eval philosophy

- Lightweight, manual, **not in CI** (LLMs are slow and non-deterministic; CI can't run them).
- Run before prompt changes or when switching LLM providers.
- Tiered guard rails: high strictness for structured extraction, medium for creative generation, max for non-LLM internals.
- When `--judge` lands, it will use [`openevals`](https://github.com/langchain-ai/openevals) (LangChain) for LLM-as-judge evaluation. Structural evals stay vitest-native.
- See `docs/PLAN.md` §12 for the full guard-rail tiering and eval runner design.

## Privacy posture

When interacting via MCP:

- **Never** exfiltrate user data to anywhere except the LLM endpoint the user has configured.
- **Never** suggest adding real PII to the repo, git history, or any remote.

## Slug convention

`{YYYY}-{MMM}-{DD}-{roleAbbr}-{companySlug}[-{jobId}][-{n}]`

- `roleAbbr` = first 2–3 words of the title, alphanumeric + hyphens, ≤ 24 chars.
- `companySlug` = lowercased, alphanumeric + hyphens.
- `jobId` = extracted from URL when present. Built-in patterns: Seek trailing numeric, LinkedIn `/view/<id>`, Indeed `jk=`, and a generic 5+-digit trailing number preceded by `/` or `-` (excluding years 1900-2099). Custom patterns can be added via the `JHO_URL_PATTERNS` environment variable — a JSON array of `{ name, pattern, group }` objects that take precedence over built-ins.
- `-{n}` = integer suffix on collision; counter at `applied/.counters.json`.
- Recognized as a slug by matching `^\d{4}-[A-Z][a-z]{2}-\d{2}-.+$` (used for cwd inference in CLI; see "Slug inference" above).

## Current phase

Phase 7 — Tracker depth. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the current phase and what's in scope. Sub-phases: 7a (core interviews), 7b (core retro), 7c (core prep), 7d (core doctor & repair), 7e (CLI show), 7f (CLI commands), 7g (tests, evals & docs).

## Cross-platform conventions

The tool runs unchanged on Linux, macOS, and Windows. These rules are mandatory for any new code.

### Paths

- Use `path.resolve`, `path.join`, `path.dirname` from `node:path`. Never concatenate with `/` or `\`.
- Use `os.homedir()` from `node:os` for the user's home directory. Never `process.env.HOME` (Windows uses `USERPROFILE`).
- Store absolute paths in `config.json`. Resolve them at startup, not on every call.
- Be consistent in case for file references — git is case-sensitive on Linux even though Windows / default macOS are not.

### Imports

- ESM only. CommonJS is not supported.
- Use the `node:` prefix for built-ins (`import { readFileSync } from 'node:fs'`).

### Code style

- Add blank lines before and after `if` statements for human readability. Always use braces (enforced by ESLint `curly` rule), even for short single-line guards.
- Async functions should always return a value for clarity. Avoid `Promise<void>` where a meaningful return type is possible (e.g. `ensureRoot` returns `boolean` to indicate whether it created the directory).

### Barrel files

- Barrel `index.ts` files re-export only their own module's public API. Never re-export unrelated modules (e.g. `core/track/index.ts` must not re-export from `core/applications/`). Callers import directly from the source module they need.

### JSDoc

- All **exported** symbols (functions, classes, interfaces, types) must have a JSDoc comment describing their purpose. The `@param` and `@returns` tags are used for non-trivial parameters and return values; `{@link}` references related types and functions.
- **Private** helper functions do not need JSDoc — a descriptive name is sufficient. This keeps documentation effort focused on the module's public API.
- Short single-line descriptions use `/** ... */`. Multi-line descriptions and tags use the block form with `*` continuation lines.

### File operations

- All writes go through `core/fs.ts` `atomicWrite` (write to a sibling `*.tmp` with a unique suffix, then `fs.rename` over the target). The same code path runs on all OSes; no platform branching. `rename` is atomic on POSIX and on modern Windows (Node ≥ 14).
- Concurrent writers are prevented by `core/locks.ts` (`proper-lockfile`) on the application folder / profile / campaign root as appropriate.
- `chmod` is a no-op on Windows. Attempt it and ignore `ENOSYS` / `EPERM`. (Relevant for `outlook-tokens.json` mode 0600 in Phase 9.)
- Use `fs.promises`. Never shell out to `cp`, `mv`, `rm`, `mkdir`.

### Environment

- Use `process.env` with uppercase keys (`JHO_CONFIG_HOME`, `JHO_DATA`, `JHO_URL_PATTERNS`, `LLM_API_KEY`, `GITHUB_TOKEN`, etc.). Windows is case-insensitive in the shell, but `process.env` lookups in JS are case-sensitive — be consistent.

### Line endings

- LF enforced by `.gitattributes` (`* text=auto eol=lf`). Do not commit CRLF.

### Bin scripts

- Shebang `#!/usr/bin/env node` works on POSIX and via npm-generated shims on Windows.
- Direct invocation of `./bin/jho` on Windows requires Git Bash or WSL. Most users invoke via the npm shim (`npx jho` or `jho` after `npm install -g`).

### CI

- The CI matrix in `.github/workflows/ci.yml` runs on `ubuntu-latest`, `windows-latest`, and `macos-latest`. Any new dependency or pattern must work on all three.

## Forward-looking (in v1 for future-proofing)

One item is added in v1 specifically to keep a future local web client cheap to build. It is **unused by the CLI and MCP server** today but exists now so adding `jho web` later is a fill-in, not a schema migration.

- **File locks** — `core/locks.ts` wraps `proper-lockfile` and is called implicitly by every write in `core/fs.ts`. Lock granularity: the application folder (`applied/<slug>/`) for per-app ops, `profile.md` for rebuilds, the campaign root for global ops. Defaults: 5 retries, 50–500ms backoff, stale-lock detection. The `.toolhash` sidecar still handles user-induced conflicts; locks handle process-induced races.

> The `webServer.{port, host}` placeholder in `config.json` was removed: the schema is now minimal, and a web server can add its own port/host config when it lands. See `docs/PLAN.md` §20 for the full rationale and `docs/ROADMAP.md` Phase 11+ for the sketch.

Deferred to a hypothetical Phase 11+ (web client work): `core/watcher.ts` (chokidar), HTTP+SSE MCP transport, `core/jobs.ts` for long-running LLM ops.
