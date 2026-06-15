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
- [ ] **Phase 6** — Cover letter & Q&A
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
- Re-init: if campaign exists, warn and confirm (skip in `--yes` mode); always write global config (shallow merge preserves untouched fields)
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

**Scope**:

- `core/jobs.ts` — `extractJdFromUrl`, `extractJdFromText`, `extractJobId` (uses `JHO_URL_PATTERNS` env var for custom patterns), `fetchWithFallback`
- `core/jobs.ts` (extended) — `suggestTargetRole(jd, profile)` — returns the slug of the best-matching target role from the profile's `## Target roles` section
- `core/tracker.ts` (initial) — `createApplication`, `writeMeta`, `writeJd`, `listApplications`, `findBySlug`
- `core/slug.ts` (extended) — build full slug from JD + jobId
- `core/frontmatter.ts` (extended) — meta.md frontmatter schema with zod, including optional `targetRole` field
- `jho track` (full) — extracts JD, suggests a `targetRole`, prompts user to confirm/override; when the URL has no extractable job ID, prompts user to supply one manually (optional — skip to proceed without); writes `meta.md` with `targetRole: <slug>` set
- `jho list` (basic) — supports `--role <slug>` filter
- `applied/.index.json` builder (includes `targetRole`)
- `core/tracker.ts` (extended) — `meta.md` status enum: `applied | interview | offer | rejected | withdrawn | abandoned | ghosted` (the LLM distinguishes `withdrawn` from `abandoned` based on user input; see PLAN §4 status semantics table)
- `core/stats.ts` (initial) — pure read of `applied/.index.json` + `meta.md` frontmatter; counts by status / target role / site; funnel; this-month delta; no LLM
- `jho stats` (basic) — `--role <slug>`, `--since <date|7d|30d|90d>`, `--json`; pretty TTY table by default. See PLAN §8.
- Tests

**Deliverable**: `jho track https://au.seek.com/job/12345` creates a folder with `meta.md` + `jd.md`, suggests a target role from the profile, and writes `targetRole` to frontmatter. `jho list --role <slug>` filters. `jho stats` prints a campaign snapshot.

**Commit**: `feat(jobs+tracker): URL fetch, JD extract, application creation, list, target-role, stats`

---

## Phase 6 — Cover letter & Q&A generation

**Scope**:

- `core/cover-letter.ts` — `generateCoverLetter(slug)` with backup
- `core/application-qa.ts` — `answerQuestion(slug, question, image?)`
- `prompts/cover-letter.md`, `prompts/application-qa.md`
- `jho cover-letter`, `jho answer` (text + image)
- Tests

**Deliverable**: Cover letters and tailored Q&A answers.

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

**Commit**: `feat(tracker): interviews, doctor, repair, ownership, retro, prep`

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
