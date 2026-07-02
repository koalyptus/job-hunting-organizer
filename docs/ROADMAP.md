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
    - [ ] 5d2 — `jho track <slug> --refresh` (re-fetch JD for existing application)
    - [ ] 5d3 — `--verbose` CLI flag (enables terminal output for a single run)
  - [ ] 5e — jho list
  - [ ] 5f — core/stats & jho stats
  - [ ] 5g — Tests, docs & polish
- [x] **Phase 6** — Cover letter & Q&A
  - [x] 6a — Cover letter core
  - [x] 6b — Q&A core
  - [x] 6c — CLI commands (cover-letter + answer)
  - [x] 6d — Tests, docs & polish
- [ ] **Phase 7** — Tracker depth (interviews, doctor, repair, ownership, retro)
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
- `core/slug.ts` — slug algorithm, `applied/.counters.json` management, jobId extraction, `SLUG_PATTERN`, `validateSlug(slug)`
- `core/frontmatter.ts` — `readFrontmatter(path)`, `writeFrontmatter(path, fm, body)` preserving custom fields
- `core/markers.ts` — parse/write `<!-- jho:* -->` markers, identify ownership regions
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

- `core/slug.ts` — slug algorithm, `applied/.counters.json` management, jobId extraction, `SLUG_PATTERN`, `validateSlug(slug)`
- `core/frontmatter.ts` — `readFrontmatter(path)`, `writeFrontmatter(path, fm, body)` preserving custom fields
- `core/markers.ts` — parse/write `<!-- jho:* -->` markers, identify ownership regions
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

- `src/cli/commands/cover-letter.ts` — replace stub: slug or URL, default stdout + save, `--no-save`, `--out`, `--paste`
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

---

## Phase 7 — Tracker depth

**Scope**:

- `core/interviews.ts` — `addInterview`, `listInterviews`, `markInterview`, `appendNotes`
- `core/qa.ts` — append-only writer
- `core/doctor.ts` — campaign diagnostics
- `core/repair.ts` — rebuilds frontmatter, indexes, counters
- `core/retro.ts` — `startRetro`, `appendRetro`, `showRetro`, `aggregateRetros`
- `core/learning-plan.ts` — LLM call to generate a learning plan from a list of weak topics
- `prompts/learning-plan.md` — prompt template
- `applied/<slug>/retro.md` (new file type, append-only per H2)
- `core/prep.ts` — `generatePrep({ jd, profile, targetRole, days })` returning a zod-validated structured plan; `formatPrep(plan)` → markdown; `writePrep(slug, plan)` (atomic + `.toolhash`); `readPrep(slug)`; `appendTopic(slug, topic)`
- `prompts/prep.md` — prompt template; cross-references `retro.md` weak topics and `aggregate_retros` output for the same target role (read-only seed)
- `applied/<slug>/prep.md` (new file type; regenerable on `--update`, appends user-added topics on `--add`; same `.toolhash` conflict detection as `cover-letter.md`)
- `jho show <slug>` with file-ownership footer
- `jho interview` subcommands
- `jho retro <slug>` (interactive: ask for weak topics, generate plan, write to retro.md)
- `jho retro <slug> --show`
- `jho retro <slug> --interview <n>` (associate with a specific interview)
- `jho retro <slug> --append` (add more weak topics to an existing retro)
- `jho retro --aggregate` (recurring weak topics across all apps)
- `jho prepare <slug>` (generate or show prep plan; slug inferred from cwd)
- `jho prepare <slug> --update` (regenerate from current JD + profile; prompts on user-edit conflict)
- `jho prepare <slug> --add "<topic>"` (append a manual topic)
- `jho prepare <url>` and `jho prepare --text "..."` (ad-hoc: print to stdout, don't save)
- `jho prepare --days <n>` (default 7), `--json`
- `jho doctor`, `jho repair`, `jho ownership`
- `evals/learning-plan/{cases.ts, rubric.md}` — qualitative evals
- `evals/prep/{cases.ts, expected/<jd-slug>/expected.json, rubric.md}` — checks depth distribution, materials are real URLs, timeline sums, strengths/concerns reference profile
- Tests

**Deliverable**: Full CLI tracker workflow including post-mortem retro for failed interviews with LLM-generated learning plans, cross-app aggregation, and pre-interview prep plans generated from JD + profile. Real job-hunting campaign usable from CLI only.

**Commit**: `feat(applications): interviews, doctor, repair, ownership, retro, prep`

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
