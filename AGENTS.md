# AGENTS

This document is for AI agents (Claude, Cursor, etc.) using the `job-hunting-organizer` MCP server or contributing to the tool itself. It complements the user-facing [README](README.md) and the [plan](docs/PLAN.md).

## Project at a glance

- **Type**: local-first CLI + MCP server
- **Language**: TypeScript (strict, ESM, Node ≥ 20)
- **Package layout**: single package (not monorepo)
- **LLM**: generic OpenAI-compatible client (Ollama, OpenCode, LM Studio, OpenAI, etc.)
- **Data location**: external `~/job-hunting-organizer/` (or `$JHO_ROOT`); never inside the repo

## Repo structure

```
.
├── bin/                # CLI and MCP server entry points (jho, jho-mcp)
├── src/
│   ├── cli/            # CLI commands
│   ├── mcp/            # MCP server
│   └── core/           # shared business logic (no I/O boundaries)
├── prompts/            # versioned LLM prompt templates
├── evals/              # lightweight eval suite (not in CI)
├── docs/
│   ├── PLAN.md         # full design plan
│   ├── ROADMAP.md      # phased build plan
│   └── help/           # conceptual guides for `jho help <topic>`
├── examples/           # MCP client configs (claude-desktop, cursor, continue)
├── .github/workflows/  # CI (lint, typecheck, test, build)
├── glama.json          # glama.ai MCP registry metadata
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
jho init                # wizard: build profile from CV + GitHub
jho config show|path    # show global config (secrets redacted)
jho root                # print campaign root
jho profile show|rebuild
jho track <url>         # record a new application (or update by slug); suggests target role
jho list [--role <slug>] # list all applications (filter by target role)
jho show [<slug>]       # slug is optional; inferred from cwd if omitted
jho cover-letter [<slug>] # generate a tailored cover letter
jho answer [<slug>] "..." # tailor an answer (text or screenshot)
jho interview [<slug>] {add,list,mark,notes}
jho prepare [<slug>]    # pre-interview prep: topics to brush up, behavioural, timeline (from JD + profile)
jho retro [<slug>]      # post-mortem for failed interviews; generates a learning plan
jho retro --aggregate   # recurring weak topics across all apps
jho ownership           # what you can/can't edit
jho doctor              # diagnose the campaign
jho repair              # attempt auto-repair
jho stats               # campaign snapshot: counts by status / role / site, funnel, this-month delta
jho help [<cmd>|<topic>]
jho mcp                 # start MCP server
```

**Slug inference**: every command that accepts a `<slug>` also accepts the implicit form — omit the slug and run from inside the application folder. The slug is inferred from the cwd by matching the folder basename against `^\d{4}-[A-Z][a-z]{2}-\d{2}-.+$` and walking up to the first match under `appliedDir`. CLI-only convenience; MCP tool calls always pass an explicit slug. If neither explicit slug nor cwd inference yields a slug, exit with an error and the hint: `pass a slug, or run from inside the application folder (e.g. cd applied/<slug>)`.

## MCP tools (planned)

`init`, `extract_jd`, `cover_letter`, `answer_question`, `track_application`, `list_applications`, `show_application`, `add_interview`, `list_interviews`, `mark_interview`, `schedule_interview`, `post_mortem`, `show_retro`, `append_retro`, `aggregate_retros`, `prepare`, `read_profile`, `update_profile`, `get_root`, `update_config`, `ownership`, `doctor`, `repair`, `get_stats`.

## Resources (planned)

`profile://current`, `applied://list`, `applied://<slug>`, `applied://<slug>/interviews`, `applied://<slug>/retro`, `applied://<slug>/prep`.

## File ownership model

**The one rule**: _If a comment at the top of the file says `jho:...`, the boundary is right there. If not, the file is yours._

| File                                   | Tool writes                                                     | Edit freely?                   | Tool behavior on your edit                                 |
| -------------------------------------- | --------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| `meta.md` frontmatter                  | yes (rebuild from JD + state)                                   | yes (add custom fields)        | round-tripped, custom fields preserved                     |
| `meta.md` body                         | never                                                           | yes                            | preserved verbatim                                         |
| `jd.md` (above `jho:start:fetched-jd`) | yes (on re-track)                                               | no (tool-managed region)       | overwritten                                                |
| `jd.md` (below `jho:end:fetched-jd`)   | never                                                           | yes                            | preserved on re-track                                      |
| `cover-letter.md`                      | on regenerate                                                   | yes                            | prompts on next regenerate                                 |
| `qa.md`                                | appends only                                                    | yes                            | prior entries untouched                                    |
| `interviews.md`                        | appends, `Status:` line updates                                 | yes (except `Status:`)         | mark status via `jho interview mark`                       |
| `retro.md`                             | appends new H2 sections                                         | yes (checklists, notes)        | prior retros untouched                                     |
| `prep.md`                              | regenerates on `--update`; appends user-added topics on `--add` | yes                            | prompts on overwrite; user edits preserved unless accepted |
| `profile.md` `## Target roles`         | suggests on `jho init`/`profile rebuild`                        | yes (titles, fields, priority) | prompts before overwrite; user edits preserved             |
| `notes.md`                             | never                                                           | yes                            | never touched                                              |
| `.index.json`                          | on read / staleness                                             | no (internal cache)            | regenerated                                                |
| `.counters.json`                       | on slug collision                                               | no (internal cache)            | regenerated                                                |

Each tool-managed file has a `.toolhash` sidecar. If the file's current hash differs from the sidecar, the tool refuses silent overwrite and shows a diff.

**Discoverability**: in-file markers, `jho ownership`, `jho doctor`, `jho show <slug>`, README, and this file.

## Logging conventions

- Logs go to **stderr** only. **stdout** is reserved for command output.
- No user content is logged (no CV / JD / cover letter / Q&A text). Metadata only (slugs, model, tokens, duration).
- MCP server logs are JSON. CLI logs are pretty (TTY) or JSON (non-TTY).
- Every log line carries a correlation id; MCP reuses the JSON-RPC request id.
- Secrets in config are redacted by default; `jho config show --reveal` shows all (with confirmation).

## Eval philosophy

- Lightweight, manual, **not in CI** (LLMs are slow and non-deterministic; CI can't run them).
- Run before prompt changes or when switching LLM providers.
- Tiered guard rails: high strictness for structured extraction, medium for creative generation, max for non-LLM internals.
- See `docs/PLAN.md` §12 for the full guard-rail tiering and eval runner design.

## Privacy posture

When interacting via MCP:

- **Never** exfiltrate user data to anywhere except the LLM endpoint the user has configured.
- **Never** suggest adding real PII to the repo, git history, or any remote.
- The legacy `applied/2026-Jun-03-SE-Nuage-Technology-Group.md` is gitignored and ignored by the tool; do not read or modify it.

## Slug convention

`{YYYY}-{MMM}-{DD}-{roleAbbr}-{companySlug}[-{jobId}][-{n}]`

- `roleAbbr` = first 2–3 words of the title, alphanumeric + hyphens, ≤ 24 chars.
- `companySlug` = lowercased, alphanumeric + hyphens.
- `jobId` = extracted from URL when present (Seek trailing numeric, LinkedIn `/view/<id>`, Indeed `jk=`).
- `-{n}` = integer suffix on collision; counter at `applied/.counters.json`.
- Recognized as a slug by matching `^\d{4}-[A-Z][a-z]{2}-\d{2}-.+$` (used for cwd inference in CLI; see "Slug inference" above).

## Current phase

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the current phase and what's in scope.

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

### File operations

- Atomic writes (`tmp + rename`) work on POSIX. On Windows, `rename` fails if the target exists — `core/fs.ts` must use `fs.copyFile` + `unlink` (or `proper-lockfile`) instead.
- `chmod` is a no-op on Windows. Attempt it and ignore `ENOSYS` / `EPERM`. (Relevant for `outlook-tokens.json` mode 0600 in Phase 9.)
- Use `fs.promises`. Never shell out to `cp`, `mv`, `rm`, `mkdir`.

### Environment

- Use `process.env` with uppercase keys (`JHO_ROOT`, `LLM_API_KEY`, `GITHUB_TOKEN`, etc.). Windows is case-insensitive in the shell, but `process.env` lookups in JS are case-sensitive — be consistent.

### Line endings

- LF enforced by `.gitattributes` (`* text=auto eol=lf`). Do not commit CRLF.

### Bin scripts

- Shebang `#!/usr/bin/env node` works on POSIX and via npm-generated shims on Windows.
- Direct invocation of `./bin/jho` on Windows requires Git Bash or WSL. Most users invoke via the npm shim (`npx jho` or `jho` after `npm install -g`).

### CI

- The CI matrix in `.github/workflows/ci.yml` runs on `ubuntu-latest`, `windows-latest`, and `macos-latest`. Any new dependency or pattern must work on all three.

## Forward-looking (in v1 for future-proofing)

Two items are added in v1 specifically to keep a future local web client cheap to build. They are **unused by the CLI and MCP server** today but exist now so adding `jho web` later is a config fill-in, not a schema migration.

- **File locks** — `core/locks.ts` wraps `proper-lockfile` and is called implicitly by every write in `core/fs.ts`. Lock granularity: the application folder (`applied/<slug>/`) for per-app ops, `profile.md` for rebuilds, the campaign root for global ops. Defaults: 5 retries, 50–500ms backoff, stale-lock detection. The `.toolhash` sidecar still handles user-induced conflicts; locks handle process-induced races.
- **`config.json → webServer.{port, host}`** — placeholder, default `127.0.0.1:7331`. Schema is forward-compatible; no consumer reads it in v1.

Deferred to a hypothetical Phase 11+ (web client work): `core/watcher.ts` (chokidar), HTTP+SSE MCP transport, `core/jobs.ts` for long-running LLM ops. See `docs/PLAN.md` §20 for the full rationale and `docs/ROADMAP.md` Phase 11+ for the sketch.
