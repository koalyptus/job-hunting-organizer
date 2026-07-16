# Roadmap

10 phases. Each phase ends with the user committing manually.

## Status

- [x] **Phase 0** — Planning artifacts
- [x] **Phase 1** — Skeleton & toolchain
- [x] **Phase 2** — Core infra (paths, config, logger, slug, frontmatter, markers)
- [ ] **Phase 3** — LLM client & profile building
  - [x] 3a — LLM client
  - [x] 3b — CV parser + GitHub client
  - [x] 3c — Target roles
  - [x] 3d — Profile builder
  - [x] 3e — Knowledge base caching & evals
- [x] **Phase 4** — CLI scaffolding & `init` wizard
  - [x] 4a — CLI framework & command module structure
  - [x] 4b — Real commands (rename-campaign, campaign inference)
  - [x] 4c — Init wizard
  - [x] 4d — Tests & polish
- [ ] **Phase 5** — JD extraction & `track`
  - [x] 5a — Data schemas & applications core
  - [x] 5b — JD fetch & extraction
  - [x] 5c — Target role suggestion
  - [x] 5d — jho track CLI
    - [x] 5d1 — CLI logging integration (incl. `disableFileLogging` config flag)
    - [x] 5d2 — `jho track <slug> --refresh` (re-fetch JD for existing application)
    - [x] 5d3 — `--verbose` CLI flag (enables terminal output for a single run)
  - [x] 5e — jho list
  - [x] 5f — core/stats & jho stats
  - [x] 5g — Tests, docs & polish
- [x] **Phase 6** — Cover letter & Q&A
  - [x] 6a — Cover letter core
  - [x] 6b — Q&A core
  - [x] 6c — CLI commands (cover-letter + answer)
  - [x] 6d — Tests, docs & polish
  - [x] 6e — Steer: custom LLM instructions per command
- [ ] **Phase 7** — Tracker depth (interviews, doctor, repair, ownership, retro, show)
  - [x] 7a — Core: Interviews module
  - [x] 7b — Core: Retro module (LLM-backed learning plan)
  - [x] 7c — Core: Prep module (LLM-backed pre-interview plan)
  - [x] 7d — Core: Doctor & Repair (toolhash utility, diagnostics, auto-repair)
  - [x] 7d1 — Toolhash sidecar wiring (integrate writeToolhash into existing modules)
  - [x] 7e — CLI: Show command with ownership footer
  - [x] 7f — CLI: Interview, retro, prepare, doctor, repair commands
  - [x] 7f1 — Interactive campaign picker
  - [x] 7g — Tests, evals & documentation
  - [ ] 7h — CLI: Markdown-formatted show commands
  - [ ] 7i — Core: Employment type in application meta
  - [x] 7j — CLI: Natural-language command interface
- [ ] **Phase 8** — MCP server
- [ ] **Phase 9** — Calendar providers
- [ ] **Phase 10** — Polish & public readiness

---

## Phase 0 — Planning artifacts

**Scope**: `docs/PLAN.md` and this roadmap file. No code.

**Commit**: `docs: initial plan and roadmap`

---

## Phase 1 — Skeleton & toolchain

**Scope**: Empty but compilable project.

- `package.json` (name, scripts, deps stub, `bin`, `mcp` placeholder, `license`)
- `tsconfig.json` (strict, ESM, NodeNext)
- `eslint.config.js` + `.prettierrc`
- `vitest.config.ts`
- `.gitignore` (final, minimal)
- `.env.example`
- `glama.json` (placeholder `maintainers: ["todo"]`)
- `LICENSE` (MIT placeholder)
- `bin/jho` and `bin/jho-mcp` shebang stubs that print `--version`
- `README.md` and `AGENTS.md` skeletons
- `.github/workflows/ci.yml` — lint, typecheck, test, build

**Deliverable**: `npm install && npm run build && npm test` passes. `./bin/jho --version` prints `0.1.0`.

**Commit**: `chore: project skeleton with toolchain and CI`

---

## Phase 2 — Core infrastructure (no LLM, no network)

**Scope** (split into 2a/2b for incremental delivery — see below):

- `core/paths.ts` — resolves `$JHO_CONFIG_HOME` and `$JHO_DATA`, finds global `config.json`, resolves campaign root, `findSlugFromCwd` and `findCampaignFromCwd`
- `core/config.ts` — zod schemas (global + per-campaign), read/write both, redact secrets, `updateConfig(partial)` merge
- `core/config.schema.ts` — Zod schemas split out (single-responsibility: validation rules in their own module)
- `core/logger.ts` — pino factory, redaction paths, TTY vs JSON, child loggers
- `core/debug.ts` — `debug` wrapper, namespace `jho:*`
- `core/fs.ts` — `atomicWrite(path, content)`, `withBackup(path, fn)`
- `core/locks.ts` — `acquireLock(target, fn)` via `proper-lockfile` (5 retries, 50–500ms backoff, stale-lock detection). Lock granularity: app folder for per-app ops, profile for rebuild, campaign root for global ops. See PLAN §7 "Concurrency / file locks".
- `core/parser/slug.ts` — slug algorithm, `applied/.counters.json` management, jobId extraction, `SLUG_PATTERN`, `validateSlug(slug)`
- `core/parser/frontmatter.ts` — `readFrontmatter(path)`, `writeFrontmatter(path, fm, body)` preserving custom fields
- `core/parser/markers.ts` — parse/write `<!-- jho:* -->` markers, identify ownership regions
- Tests for each module (~80% coverage on these)

### Phase 2a — Foundation (delivered in PR #2)

Sub-phase covering the lowest-risk modules first. Smaller, easier to review, unblocks Phase 2c (CLI surface) without waiting on the more opinionated modules (frontmatter, markers, slug).

**Delivered**:

- `core/paths.ts` — `$JHO_CONFIG_HOME` and `$JHO_DATA`, config home + data root, campaign root, slug & campaign cwd inference
- `core/config.ts` + `core/config.schema.ts` — zod schemas, global + per-campaign config load/merge/update
- `core/logger.ts` — pino factory, redaction, TTY/JSON output, file output
- `core/debug.ts` — `jho:*` namespace helper
- `core/fs.ts` — `atomicWrite` (writeFile → rename), `pathExists`, `withBackup`
- `core/locks.ts` — proper-lockfile wrapper
- `core/package.ts` — package version / root resolution
- `src/cli/index.ts` — `jho --version`, `jho --help`, `jho config [show|path]`, `jho campaign config [show|path]`, `jho ownership`
- Tests: 63/63 passing, ~88% line coverage on `core/`

**Deliverable**: `jho config show` and `jho campaign config show` print the global and campaign configs respectively. `jho --help` works. Two-level config is loaded with disjoint global / campaign key sets.

**Commit**: `feat(core): paths, config, logger, locks, package, root command`

### Phase 2b — Schema-driven IO (delivered)

Picks up the more opinionated modules that build on 2a. Unblocks Phase 5 (JD extraction) and Phase 6 (cover letter / Q&A).

**Scope**:

- `core/parser/slug.ts` — slug algorithm, `applied/.counters.json` management, jobId extraction, `SLUG_PATTERN`, `validateSlug(slug)`
- `core/parser/frontmatter.ts` — `readFrontmatter(path)`, `writeFrontmatter(path, fm, body)` preserving custom fields
- `core/parser/markers.ts` — parse/write `<!-- jho:* -->` markers, identify ownership regions
- `jho config show` — prints redacted merged config for the inferred campaign
- `jho ownership` — prints the per-file ownership table

**Deliverable**: Phase 5+ can build on top of these. `jho track` writes frontmatter and uses markers for the JD region. `jho cover-letter` writes a `<!-- jho:cover-letter -->`-marked file.

**Commit**: `feat(core): slug, frontmatter, markers, config show, ownership`

---

## Phase 3 — LLM client & profile building

Split into sub-phases for incremental delivery.

#### 3a — LLM client (delivered)

`core/llm.ts` — OpenAI-compatible client (`chatComplete`, `defaultLlmConfig`, `parseJsonResult`). 22 tests.

**Commit**: `feat(llm): OpenAI-compatible chat client`

#### 3b — CV parser + GitHub client (delivered)

`core/cv.ts` — PDF (pdf-parse), DOCX (mammoth), MD/TXT readers. `core/github.ts` — REST API client for user + repos. Types in `types.ts` (`CvFormat`, `CvContent`, `GithubUser`, `GithubRepo`). 23 tests.

**Commit**: `feat(profile): CV parser and GitHub API client`

#### 3c — Target roles

`core/target-roles.ts` — parse/validate/update the `## Target roles` section in `profile.md`. H3-per-role format with slug, title, priority, level, domain, stack, work style, comp floor, notes. Tests.

**Commit**: `feat(profile): target roles parser and validator`

#### 3d — Profile builder

`core/profile.ts` — orchestrates CV + GitHub → LLM → `profile.md` (including the `## Target roles` section). `prompts/profile-build.md` — must include a "generate 2-4 target roles" section with priority, level, domain, stack, comp floor, notes. Tests with nock + msw.

**Deliverable**: `buildProfile({ cvPath, githubUser })` returns generated `profile.md` content (including `## Target roles`). CLI not yet wired.

**Commit**: `feat(profile): LLM-backed profile builder with prompt template`

#### 3e — Knowledge base caching & evals

`knowledge-base/local/{cv,github}/` for raw text caching. `evals/profile-build/{target-roles-cases.ts, expected-target-roles/}` — golden fixtures for the target-roles output. Evals use vitest for structural checks. `--judge` (LLM-as-judge, planned for later phases) will use [`openevals`](https://github.com/langchain-ai/openevals).

**Commit**: `feat(profile): knowledge base caching and eval fixtures`

---

## Phase 4 — CLI scaffolding & `init` wizard

Split into sub-phases for incremental delivery.

#### 4a — CLI framework & command module structure

- Install `commander`, `@clack/prompts`, `ora` as production dependencies
- Create `src/cli/commands/` directory with one file per command
- `src/cli/spinner.ts` — ora wrapper (TTY-only, auto-disabled on non-TTY, replaced by single info line)
- `src/cli/options.ts` — shared global option parser (`--campaign`, `--verbose`, `--quiet`, `--yes`, `--no-color`, `--log-file`)
- Refactor `src/cli/index.ts` from hand-rolled argv parser to commander setup
- Register all commands (real + stubs) with hand-written `--help` for each
- Stub commands: `track`, `list`, `show`, `cover-letter`, `answer`, `interview`, `retro`, `prepare`, `doctor`, `repair`, `stats`, `mcp` — each errors with `"not implemented yet (planned: phase X)"`
- Real commands wired: `config`, `campaign config`, `ownership`, `profile show`
- Remove `ParsedArgs` from `core/types.ts` (commander replaces it)

**Deliverable**: `jho --help` shows all commands with full docs. `jho config show`, `jho campaign config show`, `jho ownership`, `jho profile show` work. All other commands show "not implemented yet" with the correct phase number. Commander handles arg parsing, help generation, and `--version`.

**Commit**: `feat(cli): commander setup with command modules, global options, spinner`

#### 4b — Real commands (rename-campaign, campaign inference)

- `src/cli/commands/rename-campaign.ts` — validates `<new>` (no empty, no `/`, no `\`, no `..`, no `.`, no leading `-`, no whitespace); refuses if cwd is inside the campaign being renamed; takes `proper-lockfile` lock on campaign root; atomic `fs.rename`; logs move with correlation id; `jho rename-campaign <new> [--from <old>]` with cwd-infer old when `--from` is omitted
- Wire `--campaign` flag on all commands that need it (config, ownership, profile, rename-campaign, stubs)
- `src/cli/commands/profile.ts` — add `rebuild` subcommand (calls `buildProfile` from Phase 3)

**Deliverable**: `jho rename-campaign new-name` works. `jho --campaign freelance config show` works. All commands respect `--campaign`.

**Commit**: `feat(cli): rename-campaign with validation and lock, --campaign flag on all commands`

#### 4c — Init wizard

- `src/cli/commands/init.ts` — full `jho init [<name>]` wizard using `@clack/prompts`:
  1. Prompt for campaign name (default: `default`); skip if arg provided
  2. Prompt for LinkedIn URL (optional; pre-filled from existing config); `--linkedin <url>` skips prompt; `JHO_LINKEDIN_URL` env var pre-fills
  3. Prompt for CV path (optional; empty = skip profile build)
  4. Prompt for GitHub username (+ optional token, masked); optional
  5. Prompt for LLM baseUrl, apiKey, model (pre-filled from env vars or existing global config); optional
  6. Prompt for calendar provider: ICS / Outlook / **None** (skip; user can enable later via re-init or config edit)
  7. Create campaign directory structure (`applied/`, `knowledge-base/local/cv/`, `knowledge-base/local/github/`)
  8. **Profile build decision**: if `--profile <path>` → copy file; elif CV + LLM → `buildProfile()` with spinner; else → create skeleton `profile.md` with full structure and placeholder text, warn user
  9. If profile built: parse `## Target roles` via `parseTargetRoles()`
  10. **Review loop** (if roles exist and not `--yes`): show roles in a table, user can accept all / edit one / add / delete
  11. Write `profile.md` to campaign root
  12. Write global `config.json` (always merge via `updateGlobalConfig`)
  13. Write per-campaign `config.json`
  14. Print success summary with next steps
- Individual `@clack/prompts` calls (`text`, `select`, `password`, `confirm`) for each step; pre-fill all fields from existing config on re-init
- `--yes` flag: skip all prompts, use flags + env vars + defaults; no flags required — missing CV/LLM → skeleton profile
- Re-init: if campaign exists, warn and confirm (skip in `--yes` mode); backup existing `profile.md` to `backups/profile.YYYY-MM-DD_HH-mm-ss.md.bak`; always write global config (shallow merge preserves untouched fields)
- **Calendar skip**: "None" sets `defaultProvider: 'none'` in config; not permanent — user can re-init or edit config to enable later; calendar commands check provider and show helpful message if `'none'`
- **Profile graceful degradation**: if CV or LLM missing, create skeleton `profile.md` with `<!-- jho:target-roles -->` marker; user can edit manually or re-run `jho init --cv ./cv.pdf` with LLM configured
- **`--profile <path>`**: copies existing `profile.md` into campaign, skips build; useful for migration
- Tests: mock `@clack/prompts`, mock `buildProfile`, test happy path / `--yes` / re-init / skeleton / `--profile` / error cases

**Deliverable**: `jho init` works end-to-end on a fresh machine. User has a profile with a reviewed list of target roles (or a skeleton to fill in). Both config files are written. Calendar can be skipped.

**Commit**: `feat(cli): init wizard with profile build, target-roles review, config write`

#### 4d — Tests & polish

- `src/cli/tests/` — command tests for config, ownership, init (mocked prompts), rename-campaign, spinner, options
- Snapshot tests for `--help` output of every command (prevents help drift)
- Update `AGENTS.md` and `docs/ROADMAP.md` Phase 4 status to checked

**Deliverable**: All tests pass. Help output is snapshot-tested. Phase 4 complete.

**Commit**: `test(cli): command tests, help snapshots, init wizard tests`

---

## Phase 5 — JD extraction & `track`

Split into sub-phases for incremental delivery.

#### 5a — Data schemas & applications core

- `src/core/meta-schema.ts` — Zod schema for `meta.md` frontmatter: `slug`, `status` enum (`applied | interview | offer | rejected | withdrawn | abandoned | ghosted | accepted`), `appliedOn`, `title`, `company`, `location`, `site`, `link`, `salary`, `tags[]`, `targetRole`
- `src/core/applications.ts` — `createApplication(opts)` (builds slug, creates folder + `meta.md` + `jd.md` with markers, updates index), `updateApplication(slug, patch)` (reads + merges + writes frontmatter), `readApplication(appliedDir, slug)`, `listApplications(appliedDir, filters?)`
- `src/core/index-builder.ts` — build/update `applied/.index.json` from folder listing; schema: `{slug, status, title, company, site, targetRole, appliedOn, tags[]}[]`
- `src/core/types.ts` — add `MetaFrontmatter`, `ApplicationStatus`, `ApplicationEntry`, `CreateApplicationInput`, `UpdateApplicationInput`
- Tests: create app happy path, collision suffix, update status, update multiple fields, index builder round-trip, list with filters

**Deliverable**: `createApplication` creates a folder with `meta.md` + `jd.md`. `updateApplication` patches frontmatter. `.index.json` stays in sync.

**Commit**: `feat(applications): meta schema, application CRUD, index builder`

#### 5b — JD fetch & extraction (single LLM call)

- `src/core/jobs.ts` — `fetchWithFallback(url, log?)` (fetch with user-agent, 15s timeout, redirect follow), `extractJdFromUrl(url, llmConfig, log?)`, `extractJdFromText(text, llmConfig, log?)`
- `prompts/jd-extract.md` — Tier 1 prompt (temperature 0.1, `response_format: json_object`, 2 retries, 20k char cap); extracts title, company, location, salary, tags, description, requirements in a single call
- `src/core/types.ts` — add `ExtractedJd`, `FetchResult`
- `package.json` — add `clipboardy` production dependency (for `--paste`)
- Tests: fetch mock success/failure, extract from URL/text mock, paste fallback, stdin read, validation retry

**Deliverable**: `jho track --paste` reads clipboard, `jho track --stdin` reads pipe, both extract structured JD via LLM.

**Commit**: `feat(jobs): URL fetch, single-call JD extraction, paste/stdin support`

#### 5c — Target role suggestion

- `src/core/jobs.ts` — add `suggestTargetRole(jd, targetRoles, llmConfig, log?)`
- `prompts/suggest-role.md` — Tier 1 prompt; input: JD + target roles list; output: `{roleSlug, confidence, reasoning}` zod-validated
- `src/core/types.ts` — add `RoleSuggestion`
- Tests: matching role, no match, no roles, skip when `--target-role` flag provided

**Deliverable**: `jho track` suggests a target role from the profile. Skipped when `--target-role` flag is given.

**Commit**: `feat(jobs): LLM-backed target role suggestion from profile`

#### 5d — `jho track` CLI (create + update)

- `src/cli/commands/track.ts` — replace stub with full implementation
- `src/cli/commands/track/prompts.ts` — interactive: confirm tracking, prompt job ID, confirm update
- Create flow: fetch → extract → suggest role → show summary → confirm → create app
- Update flow: `jho track <slug> [--status X] [--salary X] [--tag X] [--note X] [--target-role X]` → read existing → merge patch → write
- `--paste` flow: read clipboard → extract from text → same as create
- `--stdin` flow: read pipe → extract from text → same as create
- `--yes` mode: skip all prompts, use flags + defaults
- No-arg: cwd-infer slug for update, error with hint if not in app folder
- Tests: create from URL, create from paste, create with --yes, update status, update multiple fields, no-arg cwd inference, error on missing slug, jobId prompt

**Deliverable**: `jho track <url>` creates app with JD + suggested role. `jho track <slug> --status interview` updates existing app.

**Commit**: `feat(cli): wire jho track with full pipeline and interactive prompts`

#### 5d1 — CLI logging integration

- Wire pino logger to CLI entry point (`src/cli/index.ts`): initialize root logger, set `JHO_LOG_FILE`
- Pass logger to core functions: `runTrack({ log })`, `runInit({ log })`, `buildProfile({ log })`
- Add `log.error()` in CLI catch blocks before `process.stderr.write()` for: `TrackError`, `InitError`, `ProfileReadError`, `RenameError`
- Replace `console.warn` in `src/core/config.ts` (lines 96, 132) with pino logger
- Add `log.debug()` to silent catches: profile read failure (track.ts:130), campaign config load (wizard.ts:74)
- Log cancellation events at `debug` level: `TrackCancelled`, `InitCancelled`

**Deliverable**: All errors appear in `<configHome>/jho.log`. CLI commands pass logger to core.

**Commit**: `feat(cli): wire pino logger to CLI commands for error logging`

#### 5d2 — `jho track <slug> --refresh` (re-fetch JD)

- `src/core/track/track.ts` — add `refresh?: boolean` to `TrackOptions`; add `runTrackRefresh` function; wire in `runTrack` dispatch
- `runTrackRefresh`: read existing app's `link` from `meta.md` frontmatter; call `extractJdFromUrl` (or `extractJdFromText` if `--paste`/`--stdin` is provided); update `jd.md` `fetched-jd` region via `replaceRegion`; write back via `atomicWrite`
- `src/cli/commands/track.ts` — add `--refresh` option; pass `refresh` to `runTrack`; update `hasTrackUpdateFlags` to include `refresh`
- Edge cases: no link in meta.md → `TrackError`; fetch failure → error includes paste hint; user notes below `<!-- jho:start:fetched-jd -->` preserved
- Tests: re-fetch from URL, with `--paste`, with `--stdin`, no link stored, fetch failure, CLI option + help snapshot

**Deliverable**: `jho track <slug> --refresh` re-fetches JD from stored URL. `--paste`/`--stdin` override source.

**Commit**: `feat(track): --refresh flag to re-fetch JD for existing applications`

#### 5e — `jho list` implementation

- `src/cli/commands/list.ts` — replace stub with real implementation
- Reads `.index.json`; default: pretty table via `cli-table3` (Slug, Title, Company, Status, Role, Date)
- `--json`: machine-readable; `--status`, `--role`, `--tag` filters (AND-combined)
- Tests: list all, filter by status/role/tag, JSON output, empty result

**Deliverable**: `jho list --role senior-backend-engineer` filters applications.

**Commit**: `feat(cli): implement jho list with filters and JSON output`

#### 5f — `core/stats.ts` & `jho stats`

- `src/core/stats.ts` — `computeStats(appliedDir, options?)`: reads `.index.json` + `meta.md` bodies for `accepted` heuristic
- `src/cli/commands/stats.ts` — replace stub; pretty table: by status, by role, by site, funnel, this-month delta
- `src/core/types.ts` — add `CampaignStats`, `StatsOptions`
- `accepted` count: `offer` apps with `meta.md` body matching `/accepted|joining/i`
- `--role`, `--since` (ISO or `7d/30d/90d`), `--json` flags
- Tests: counts, funnel, accepted heuristic, this-month delta, filters, empty campaign, JSON

**Deliverable**: `jho stats` prints campaign snapshot. `jho stats --role X --since 30d` filters.

**Commit**: `feat(stats): campaign snapshot with counts, funnel, and this-month delta`

#### 5g — Tests, docs & polish

- CLI tests: `track.test.ts`, `list.test.ts`, `stats.test.ts`
- Core tests: `applications.test.ts`, `jobs.test.ts`, `stats.test.ts`, `index-builder.test.ts`, `meta-schema.test.ts`
- Snapshot tests for `--help` output of track, list, stats
- Update `docs/ROADMAP.md` Phase 5 status to checked
- Update `AGENTS.md` — new modules, updated commands, updated MCP tools list

**Deliverable**: All tests pass (~75 new). Phase 5 complete.

**Commit**: `test: Phase 5 tests, help snapshots, docs update`

---

## Phase 6 — Cover letter & Q&A generation

Split into sub-phases for incremental delivery.

#### 6a — Cover letter core

- `src/core/types.ts` — add `CoverLetterInput`, `CoverLetterResult` interfaces
- `prompts/cover-letter.md` — Tier 2 prompt (temperature 0.6, refusal detection, 200–600 words)
- `src/core/cover-letter.ts` — `generateCoverLetter(opts)` orchestrator: reads app + profile + JD, calls LLM, writes `cover-letter.md` with marker-aware `replaceRegion`
- Tests: happy path, target role matching, missing application, LLM failure, user notes preservation

**Commit**: `feat(cover-letter): core orchestrator with LLM generation and marker-aware write`

#### 6b — Q&A core

- `src/core/types.ts` — add `QaInput`, `QaResult` interfaces
- `prompts/application-qa.md` — Tier 2 prompt (temperature 0.6, refusal detection, 50–400 words)
- `src/core/application-qa.ts` — `answerQuestion(opts)` orchestrator: reads app + profile + JD, supports multimodal (images), appends to `qa.md` (append-only H2 sections)
- Tests: happy path, image question, append to existing, missing application, LLM failure

**Commit**: `feat(qa): core orchestrator with LLM generation and append-only qa.md writer`

#### 6c — CLI commands

- `src/cli/commands/cover-letter.ts` — replace stub: slug, default stdout + save, `--no-save`
- `src/cli/commands/answer.ts` — replace stub: slug + question, default stdout + append, `--no-save`, `--stdin`, `--image`
- CLI tests, help snapshots updated

**Commit**: `feat(cli): wire jho cover-letter and jho answer commands`

#### 6d — Tests & polish

- Core tests: `cover-letter.test.ts`, `application-qa.test.ts`
- CLI tests: stub tests updated, option tests updated
- Help snapshots updated
- `docs/ROADMAP.md` Phase 6 status checked
- `AGENTS.md` updated

**Commit**: `test: Phase 6 tests, docs update`

**Deliverable**: `jho cover-letter` generates tailored cover letters. `jho answer` tailors answers to application questions. Both print to stdout and save to the application folder by default.

**Commit**: `feat(generation): cover letter and application Q&A`

#### 6e — Steer: custom LLM instructions per command

- `src/core/types.ts` — add `steer?: string` to `CoverLetterOptions`, `AnswerOptions`
- `src/core/parser/markers.ts` — add `extractSteer()` and `replaceSteer()` helpers for `<!-- jho:steer: -->` markers
- `src/core/track/track.ts` — add `steer?: string` to `TrackOptions`, `ConfirmAndCreateOptions`; write steer to `jd.md` marker
- `src/core/applications/cover-letter.ts` — read steer from `cover-letter.md`, combine with CLI steer, append `## Additional instructions` to user message, write back
- `src/core/applications/application-qa.ts` — use steer in user message, write `- Steer:` line to `qa.md` entry
- `src/cli/commands/track.ts` — add `--steer <text>` option
- `src/cli/commands/cover-letter.ts` — add `--steer <text>` option
- `src/cli/commands/answer.ts` — add `--steer <text>` option
- `prompts/cover-letter.md` — add rule: follow additional instructions when present
- `prompts/application-qa.md` — add rule: follow additional instructions when present
- Tests: steer marker extraction/replacement, steer in user message, steer in qa.md entry, CLI option parsing

**Commit**: `feat(steer): custom LLM instructions per command`

**Deliverable**: `jho track --steer` stores JD instructions in `jd.md`. `jho cover-letter --steer` customizes cover letter generation. `jho answer --steer` customizes per-question answers.

---

## Phase 7 — Tracker depth

Split into sub-phases for incremental delivery.

#### 7a — Core: Interviews module (no LLM)

- `src/core/interviews/` — types, interviews.ts, index.ts
- `addInterview(appliedDir, slug, opts)` — appends new H2 section to `interviews.md` with timestamp, type, interviewers, location, status, topics, notes
- `listInterviews(appliedDir, slug)` — parses H2 sections into structured `InterviewEntry[]`
- `markInterviewStatus(appliedDir, slug, index, status)` — regex-replaces `Status:` line in section `n` only
- `appendInterviewNotes(appliedDir, slug, index, notes)` — appends each note as its own `- ` bullet under the `Notes` heading in section `n`
- Error classes: `InterviewError`, `InterviewNotFoundError`
- Tests: append, list, mark status, append notes, invalid index, missing file

**Deliverable**: `jho interview add/list/mark/notes` backend. `interviews.md` append-only writer with section-aware status updates.

**Commit**: `feat(interviews): H2-based append-only interviews module`

#### 7b — Core: Retro module (LLM-backed, Tier 2)

- `src/core/retro/` — types, retro.ts, aggregate.ts, index.ts
- `startRetro(opts)` — reads app + profile + JD, calls LLM with weak topics → generates learning plan → appends new H2 to `retro.md` (follows same `read→LLM→write` pattern as `cover-letter.ts`)
- `appendRetro(opts)` — adds more weak topics and regenerates learning plan for an existing retro section
- `showRetro(campaign, slug)` — reads `retro.md` (no LLM)
- `aggregateRetros(appliedDir, options?)` — scans all `applied/*/retro.md`, extracts weak topics from H2 sections, counts frequency, returns ranked `AggregateResult[]` (pure text analysis, no LLM)
  - `--role <slug>` filters aggregate to a single target role
  - `--include-abandoned` includes abandoned apps in aggregation
- `prompts/learning-plan.md` — Tier 2 prompt (temperature 0.6, refusal detection, 200–600 word plan per topic); same frontmatter format as `cover-letter.md`
- Tests: retro generation, append, show, aggregate with filters, LLM failure, missing app

**Deliverable**: `retro.md` appendable. Learning plan generation from weak topics. Cross-app weak topic aggregation.

**Commit**: `feat(retro): LLM-backed post-mortem with learning plans and cross-app aggregation`

#### 7c — Core: Prep module (LLM-backed, Tier 2, toolhash)

- `src/core/prepare/` — types, prepare.ts, index.ts
- `generatePrep(opts)` — reads app + profile + JD + target role + days, calls LLM → returns zod-validated structured `PrepPlan` (topics with depth/why/resources/timeline, behavioural questions, strengths, concerns, materials)
- Ad-hoc mode: `generatePrepFromUrl(url, ...)` and `generatePrepFromText(text, ...)` — extract JD, generate plan, return to stdout (no file I/O)
- `writePrep(campaign, slug, plan)` — writes `prepare.md` with `<!-- jho:prepare -->` section marker via `atomicWrite`; `.toolhash` sidecar for conflict detection (same mechanism as `cover-letter.md`)
- `readPrep(campaign, slug)` — reads existing prepare.md
- `appendTopic(campaign, slug, topic)` — appends user-added H3 under a preserved "User-added topics" section
- Cross-seeds weak topics from `retro.md` of the same app + `aggregateRetros()` output for the same target role (read-only seed; v1 does not write back)
- `prompts/prepare.md` — Tier 2 prompt (temperature 0.6); cross-references retro weak topics; validates depth distribution (≥1 of each), materials are real URLs, timeline sums to ±20% of `days`
- Tests: generate, ad-hoc mode (URL/text), write/read round-trip, append topic, toolhash conflict, cross-referencing retro, LLM failure

**Deliverable**: `jho prepare` generates structured pre-interview plans. `prepare.md` with toolhash conflict detection. Ad-hoc mode for untracked jobs.

**Commit**: `feat(prepare): LLM-backed pre-interview prepare plans with toolhash`

#### 7d — Core: Doctor & Repair (no LLM, pure file I/O)

- `src/core/doctor/` — types, doctor.ts, index.ts
- `diagnoseCampaign(campaignRoot)` checks: campaign root exists, `config.json` valid, `profile.md` present, `applied/` directory, `.index.json` consistency
- `diagnoseApp(appliedDir, slug)` checks: folder exists, `meta.md` has valid marker + frontmatter, `jd.md` has `fetched-jd` region, toolhash mismatches per file
- Returns typed `DiagnoseIssue[]` with severity (`error|warn|info`), category, message, remediation hint
- `src/core/repair/` — types, repair.ts, index.ts
- `repairApp(appliedDir, slug, log?)` — rebuilds frontmatter from sibling files, regenerates toolhash, re-adds index entry
- `repairAll(appliedDir, log?)` — rebuilds `.index.json`, `.counters.json`, walks all app folders running `repairApp` on each
- Uses `core/fs.ts`, `core/parser/frontmatter.ts`, `core/parser/markers.ts`, `core/parser/slug.ts`, `core/index-builder.ts`
- Tests: doctor finds known issues (missing file, bad marker, toolhash mismatch), repair fixes them, no-op on clean state, all flag

**Deliverable**: `jho doctor` diagnoses issues. `jho repair` fixes them. Campaign can be recovered from common corruptions.

**Commit**: `feat(doctor,repair): campaign diagnostics and auto-repair`

#### 7d1 — Toolhash sidecar wiring (mechanical follow-up)

Wires `writeToolhash()` calls into every existing module that writes tool-managed files, so `.toolhash` sidecars are created/updated alongside each write. Without this sub-phase, the toolhash integrity checks in `diagnoseApp()` detect mismatches but no tool-owned file ever has a sidecar.

**Scope**:

- `src/core/applications/applications.ts` — add `writeToolhash(metaPath, hash)` after `writeFrontmatter(metaPath, ...)` in `createApplication` and `updateApplication`
- `src/core/track/track.ts` — add `writeToolhash(jdPath, hash)` after `replaceRegion` / `atomicWrite` in `runTrackCreate` and `runTrackRefresh`
- `src/core/applications/cover-letter.ts` — add `writeToolhash(clPath, hash)` after `atomicWrite` in `generateCoverLetter`
- `src/core/prepare/prepare.ts` — add `writeToolhash(preparePath, hash)` after `atomicWrite` in `writePrep`
- `src/core/interviews/interviews.ts` — add `writeToolhash(interviewsPath, hash)` after `atomicWrite` in `addInterview`, `markInterviewStatus`, and `appendInterviewNotes` (interviews.md has in-place status updates, unlike purely append-only files)
- `src/core/retro/retro.ts` — add `writeToolhash(retroPath, hash)` after `atomicWrite` in `startRetro` and `appendRetro`

**Not needed** — qa.md (append-only, never overwrites) and user-owned files (notes.md).

**Tests**: one integration test per module ensuring the sidecar is created with the correct hash after a write operation.

**Deliverable**: Every tool-managed write creates or updates its `.toolhash` sidecar. `jho doctor`/`jho repair` can meaningfully detect user edits.

**Commit**: `feat(toolhash): wire sidecar writes into all tool-writing modules`

#### 7e — CLI: Show command with ownership footer

- `src/cli/commands/show.ts` — replace stub with full implementation
- Summary view: title, company, status, location, site, salary, tags, target role
- Safe slug inference (cwd or explicit); error with hint when missing
- File-ownership footer: renders a compact per-entry ownership table listing every file in the application folder with its `jho:` marker rules
- Tests: show summary, show with filename flags, slug inference, missing slug error, help snapshot

**Deliverable**: `jho show` displays applications with ownership footer.

**Commit**: `feat(cli): jho show with summary view and file-ownership footer`

#### 7f — CLI: Interview, retro, prepare, doctor, repair commands

- `src/cli/commands/interview.ts` — wire subcommands to core interviews module:
  - `jho interview add --when <datetime> --type <type> --duration <min> [--interviewer] [--location]`
  - `jho interview list`
  - `jho interview mark <n> --status <status>`
  - `jho interview notes <n> --append <text>`
  - All subcommands support slug inference from cwd
- `src/cli/commands/retro.ts` — wire to core retro module:
  - `jho retro [<slug>]` — interactive (prompt for weak topics, generate plan, write to retro.md)
  - `jho retro show [<slug>]` — display existing retro
  - `jho retro append [<slug>] --weak-topics <topics>` — add weak topics to existing retro
  - `jho retro aggregate [--role <slug>] [--include-abandoned]` — cross-app aggregation
- `src/cli/commands/prepare.ts` — wire to core prepare module:
  - `jho prepare [<slug>]` — generate/show prepare plan
  - `jho prepare <slug>` — regenerate from current JD + profile
  - `jho prepare <slug> --add "<topic>"` — append a manual topic
  - `jho prepare <url>` — ad-hoc from URL
  - `jho prepare --text "..."` — ad-hoc from pasted text
  - `--days <n>` (default 7), `--json`
- `src/cli/commands/doctor.ts` — wire to core doctor module:
  - `jho doctor [<slug>]` — diagnose single app or campaign
  - `jho doctor --all` — run all checks
- `src/cli/commands/repair.ts` — wire to core repair module:
  - `jho repair [<slug>]` — repair single app or campaign
  - `jho repair --all` — attempt all repairs
- Each command: error handling via custom error classes, help text with examples, `--campaign` flag, slug inference
- CLI tests, help snapshots updated

**Deliverable**: All Phase 7 commands wired end-to-end. Campaign is fully usable from CLI only.

**Commit**: `feat(cli): wire interview, retro, prepare, doctor, repair commands`

#### 7f1 — Interactive campaign picker

- `src/core/paths.ts` — new async helpers:
  - `pickCampaign(dataRoot, opts?)` — list campaigns via `listCampaigns`, prompt user with `@clack/prompts select` if 2+, auto-select if 1, error if 0
  - `resolveCampaignNameOrPick(explicitName, opts?)` — async fallback chain: explicit → cwd-inferred → `pickCampaign()`
  - Respects `--yes` flag: skips prompt, falls back to `'default'`
- Updated commands (9 files, 15 actions) — switch from `resolveCampaignName` to `await resolveCampaignNameOrPick`:
  - `track`, `show`, `cover-letter` (generate, show), `answer` (generate, show)
  - `interview` (add, list, mark, notes), `retro` (generate, show, append, aggregate)
  - `prepare` (generate, show), `doctor`, `repair`
- Unchanged: `list`, `stats` (keep "show all" default), `init`, `profile`, `campaign`, `config`
- Tests: `pickCampaign` unit tests (0/1/many campaigns, cancel, `--yes`), CLI tests mock `@clack/prompts select`

**Deliverable**: Users with multiple campaigns are prompted to pick one instead of silently defaulting.

**Commit**: `feat(cli): interactive campaign picker when multiple campaigns exist`

#### 7g — Tests, evals & documentation

- Core tests: `src/core/tests/interviews.test.ts`, `retro.test.ts`, `prepare.test.ts`, `doctor.test.ts`, `repair.test.ts`
- CLI tests: `show.test.ts`, `interview.test.ts`, `retro.test.ts`, `prepare.test.ts`, `doctor.test.ts`, `repair.test.ts` — captured output, flag parsing, error messages, help snapshots
- Eval fixtures:
  - `evals/learning-plan/{cases.ts, expected/, rubric.md}` — qualitative eval for learning plan generation: depth distribution, materials are real URLs, strengths/concerns reference profile
  - `evals/prepare/{cases.ts, expected/<jd-slug>/expected.json, rubric.md}` — checks depth distribution (≥1 of each level), materials are real URLs, timeline sums to ±20% of `days`, strengths/concerns correctly reference profile
- Update `docs/ROADMAP.md` Phase 7 status to checked
- Update `AGENTS.md` — new modules, updated CLI commands, updated MCP tools list, updated prompt table
- Help snapshots regenerated

**Deliverable**: All tests pass. Phase 7g complete.

**Commit**: `test: Phase 7 tests, evals, docs update`

#### 7h — CLI: Markdown-formatted show commands

Renders markdown content in all `show` commands with styled terminal output using `marked` + `marked-terminal`.

- `src/cli/markdown.ts` — shared markdown renderer: `renderMarkdown(content: string): string`
  - Configures `marked` with `TerminalRenderer` (headings: bold cyan, bullets: green, code spans: yellow, links: blue)
  - Respects `NO_COLOR` env var via existing `initColors()` integration
  - `tab: 4` for consistent indentation
  - `showSectionPrefix: false` to avoid duplicate heading markers
- `package.json` — add `marked` + `marked-terminal` production dependencies
- Updated show commands (6 files):
  - `src/cli/commands/profile.ts` — `userOutput(renderMarkdown(content))`
  - `src/cli/commands/cover-letter.ts` — render after marker stripping
  - `src/cli/commands/answer.ts` — render after marker stripping
  - `src/cli/commands/retro.ts` — render retro content
  - `src/cli/commands/prepare.ts` — render after marker stripping
  - `src/cli/commands/show.ts` — render JD content when `--jd` flag used
- `--json` output keeps raw markdown (machine consumption)
- Ownership table in `jho show` stays as `cli-table3` (already well-formatted)
- Tests: `src/cli/tests/markdown.test.ts` — heading rendering, list rendering, code block rendering, NO_COLOR respect
- Update existing command tests to match rendered output format
- Update help snapshots

**Deliverable**: All `show` commands render markdown with styled headings, lists, code blocks, and links.

**Commit**: `feat(cli): render markdown content in show commands with marked-terminal`

---

#### 7i — Core: Employment type in application meta

Add `employmentType` field (permanent, temp, contract, casual, part-time) to application metadata.

- `src/core/applications/meta-schema.ts` — add `employmentType` field with enum: `permanent | temp | contract | casual | part-time | ''`
- `src/core/applications/types.ts` — add `EmploymentType` type and update `ApplicationFrontmatter`, `ApplicationEntry`, `CreateApplicationInput`, `UpdateApplicationInput`
- `src/core/applications/applications.ts` — wire in `createApplication`, `buildUpdates`, `entryFromFrontmatter`, `listApplications` filter
- `src/core/applications/index-builder.ts` — wire into `entryFromFolder`
- `src/core/track/track.ts` — pass `jd.employmentType` from `ExtractedJd` into create flow via normalization helper
- `src/core/applications/normalize.ts` — new normalization helper mapping LLM freeform text to constrained enum
- `src/cli/commands/show.ts` — add to summary view labels
- `src/cli/commands/list.ts` — add `--employment-type <type>` filter option
- `src/cli/commands/stats.ts` — add `--employment-type <type>` filter option, display "by type" grouping
- `prompts/jd-extract.md` — update v6 to output constrained enum values directly
- Tests: meta-schema validation, create/update with type, list filter, stats by type, normalization helper

**Deliverable**: `employmentType` persisted in `meta.md` frontmatter, indexed in `.index.json`, filterable in `jho list --employment-type`, shown in `jho show`, available in `jho stats --employment-type`.

**Commit**: `feat(applications): add employment type to application metadata`

---

#### 7j — CLI: Natural-language command interface

Let users invoke any command in plain English. Detection, LLM parsing, and dispatch reuse all existing command logic — no business logic is duplicated.

- `prompts/nl-command.md` — v1 prompt enumerating all 22 commands + globals + few-shot examples for LLM→`ParsedCommand` mapping.
- `src/core/parser/prompt-parser.ts`:
  - `looksLikeNaturalLanguage(argv)` — heuristic: first arg has a space AND is not a known command AND doesn't start with `-`.
  - `extractPromptAndGlobals(argv)` — peel `--campaign/--verbose/--quiet/--yes/--no-color/--log-file` out as globals, return the remaining prompt tokens.
  - `parseNaturalLanguage(prompt, globals, log)` — LLM call (json mode, temp 0.1, 30s) → `ParsedCommand { command, subcommand?, args, options, confidence }`. Globals are merged over LLM output so explicit flags always win. Throws `PromptParseError` on invalid/unknown command or non-JSON.
  - `VALID_COMMANDS`, `COMMANDS_WITH_SUBCOMMANDS` — gate-keep the LLM's `command` field against the real CLI surface.
- `src/cli/nl-dispatch.ts`:
  - `dispatchNaturalLanguage(parsed, globals, program, log)` — builds a synthetic argv via `buildArgv` and re-parses it through the existing fully-configured Commander `program` (`program.parseAsync(argv, { from: 'user' })`). 100% reuse of command logic.
  - `buildArgv(parsed, globals)` — globals first, then command, subcommand, positional args, then kebab-cased options (booleans as flags, arrays expanded to repeated flags). Global option keys are skipped (already applied).
- `src/cli/index.ts`:
  - Set `program.exitOverride()` before the synthetic re-parse so parse errors surface as user-facing text.
  - On NL detection: parse, then confidence gate — ≥0.8 auto-run; 0.5–0.8 confirm via `@clack/prompts` (skip with `--yes`); <0.5 error with a rephrase hint.
  - On `PromptParseError`: friendly message pointing at LLM config / `jho help`.
- `src/core/tests/parser/prompt-parser.test.ts` — 20 unit tests (mocked chat/parse): heuristics, happy path, subcommands, globals, arrays, confidence, validation errors.
- `evals/nl-command/` — `cases.ts` (33 cases covering all 22 commands + synonyms + ambiguous), `nl-command.test.ts` (rubric-scored against LLM), `rubric.md`.
- `src/cli/tests/commands/prompt.test.ts` — 14 integration tests: heuristics, `extractPromptAndGlobals`, full `dispatchNaturalLanguage` re-parse through a Commander program (globals, options, repeated flags, subcommands).
- Docs: `README.md` "Natural language" section; `src/cli/commands/help.ts` after-text; this file (7j checked).

**Confidence thresholds**: ≥0.8 auto, 0.5–0.8 confirm, <0.5 error. Globals from explicit flags always override LLM-parsed globals.

**Deliverable**: `jho "list all applications for <campaign> campaign"`, `jho "create cover letter for <slug>"`, etc. all resolve to the identical command behaviour; `--yes` for non-interactive use.

**Commit**: `feat(cli): natural-language command interface`

---

## Phase 8 — MCP server

**Scope**:

- `src/mcp/server.ts` — `@modelcontextprotocol/sdk` server, stdio transport
- All tools wired to `core/`, including `get_stats { role?, since?, includeNotes? }` (mirrors `jho stats` from Phase 5)
- Resources and prompts
- `bin/jho-mcp` shebang complete
- `examples/mcp-clients/{claude-desktop,cursor,continue}.json`
- README "For MCP Clients" section
- Smoke test
- Update `glama.json` `maintainers` to real GitHub user
- Update `package.json` `mcp` field

**Deliverable**: `npx jho-mcp` works in Claude Desktop / Cursor. Glama submission ready.

**Commit**: `feat(mcp): full server with tools, resources, prompts, examples`

---

## Phase 9 — Calendar providers

**Scope**:

- `core/calendar.ts` — `CalendarProvider` interface, registry
- `IcsProvider`
- `OutlookGraphProvider` with MSAL device-code flow
- `jho interview add --provider outlook`
- Tests

**Deliverable**: ICS default, Outlook opt-in.

**Commit**: `feat(calendar): ICS and Microsoft Graph providers`

---

## Phase 10 — Polish & public readiness

**Scope**:

- README final pass (all sections)
- `docs/help/{file-ownership,interviews,calendar,slug-format,profile,application-lifecycle,troubleshooting,mcp}.md`
- `jho help <topic>` wired
- Snapshot tests for help output
- `docs/examples/`
- **Default log file**: `defaultLoggerConfig()` computes `${resolveConfigHome()}/jho.log` when no `JHO_LOG_FILE` env var or `logging.file` override is set. Append-only, no rotation (user manages externally). Update `AGENTS.md` logging conventions accordingly.
- `npm publish --dry-run` clean
- Glama submission
- Tagged release

**Deliverable**: Public, glama-listed, fully documented.

**Commit**: `docs: README, help topics, examples, glama-ready`

---

## Phase 11+ — Optional future work (not in v1)

These items are explicitly **out of scope for v1** but the design leaves room for them. Captured here so they don't get re-litigated from scratch.

### Web client (`jho web`)

Local-only web UI bound to `127.0.0.1:7331` (the port will be added back to `config.json` when this lands). Reads and writes the same campaign root as the CLI. See PLAN §20 for the full rationale and the 4 forward-looking items (file locks are already in v1; the other three — watcher, HTTP MCP transport, job runner — are deferred).

Sketch only:

- `src/web/` — Hono (or similar) HTTP server, server-renders markdown
- `core/watcher.ts` — chokidar-based, emits `file-changed` for live UI updates
- Optional SQLite cache for fast listing (does not change on-disk format)
- Auth: out of scope for v1 web client (loopback-only)

Not started, not committed, no timeline. Pick up only if/when the CLI/MCP UX is no longer enough.

### Other deferred items

- Multi-user / auth (local-first stays)
- Cloud / hosted web (privacy posture)
- Calendar provider for Google Calendar (only ICS + Microsoft Graph in v1)
