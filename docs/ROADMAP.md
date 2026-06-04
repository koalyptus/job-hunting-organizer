# Roadmap

10 phases. Each phase ends with the user committing manually.

## Status

- [x] **Phase 0** — Planning artifacts
- [ ] **Phase 1** — Skeleton & toolchain
- [ ] **Phase 2** — Core infra (paths, config, logger, slug, frontmatter, markers)
- [ ] **Phase 3** — LLM client & profile builder
- [ ] **Phase 4** — CLI scaffolding & `init` wizard
- [ ] **Phase 5** — JD extraction & `track`
- [ ] **Phase 6** — Cover letter & Q&A
- [ ] **Phase 7** — Tracker depth (interviews, doctor, repair, ownership)
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

**Scope**:

- `core/paths.ts` — resolves `$JHO_ROOT`, finds `config.json`
- `core/config.ts` — zod schema, read/write `config.json`, redact secrets, `updateConfig(partial)` merge
- `core/logger.ts` — pino factory, redaction paths, TTY vs JSON, child loggers
- `core/debug.ts` — `debug` wrapper, namespace `jho:*`
- `core/fs.ts` — `atomicWrite(path, content)`, `withBackup(path, fn)`
- `core/slug.ts` — slug algorithm, `applied/.counters.json` management, jobId extraction
- `core/frontmatter.ts` — `readFrontmatter(path)`, `writeFrontmatter(path, fm, body)` preserving custom fields
- `core/markers.ts` — parse/write `<!-- jho:* -->` markers, identify ownership regions
- Tests for each module (~80% coverage on these)

**Deliverable**: `jho root` prints campaign root. `jho config show` prints redacted config. `jho ownership` prints the table. `jho --help` works.

**Commit**: `feat(core): paths, config, logger, slug, frontmatter, markers`

---

## Phase 3 — LLM client & profile building

**Scope**:

- `core/llm.ts` — OpenAI-compatible client
- `core/cv.ts` — PDF (pdf-parse), DOCX (mammoth), MD/TXT readers
- `core/github.ts` — REST API client for user + repos
- `core/profile.ts` — orchestrates CV + GitHub → LLM → `profile.md`
- `prompts/profile-build.md`
- `knowledge-base/local/{cv,github}/` for raw text caching
- Tests with nock + msw

**Deliverable**: `buildProfile({ cvPath, githubUser })` returns generated `profile.md` content. CLI not yet wired.

**Commit**: `feat(profile): CV parsing, GitHub fetch, LLM-backed profile builder`

---

## Phase 4 — CLI scaffolding & `init` wizard

**Scope**:

- `src/cli/index.ts` — commander setup, command registration
- One file per command (init, config, root, profile, track, list, show, cover-letter, answer, interview, ownership, doctor, repair, help, mcp)
- Hand-written `--help` for each
- Stub commands error with "not implemented yet (planned: phase X)"
- Real commands: `init`, `config`, `root`, `profile show`, `ownership`, `help`
- `src/cli/spinner.ts` — ora wrapper
- `jho init` wizard with `@clack/prompts`

**Deliverable**: `jho init` works end-to-end on a fresh machine. All other commands are visible in `--help` with full docs, even if they error.

**Commit**: `feat(cli): command surface with full --help, init wizard`

---

## Phase 5 — JD extraction & `track`

**Scope**:

- `core/jobs.ts` — `extractJdFromUrl`, `extractJdFromText`, `extractJobId`, `fetchWithFallback`
- `core/tracker.ts` (initial) — `createApplication`, `writeMeta`, `writeJd`, `listApplications`, `findBySlug`
- `core/slug.ts` (extended) — build full slug from JD + jobId
- `core/frontmatter.ts` (extended) — meta.md frontmatter schema with zod
- `jho track` (full), `jho list` (basic)
- `applied/.index.json` builder
- Tests

**Deliverable**: `jho track https://au.seek.com/job/12345` creates a folder with `meta.md` + `jd.md`. `jho list` shows it.

**Commit**: `feat(jobs+tracker): URL fetch, JD extract, application creation, list`

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
- `jho show <slug>` with file-ownership footer
- `jho interview` subcommands
- `jho doctor`, `jho repair`, `jho ownership`
- Tests

**Deliverable**: Full CLI tracker workflow. Real job-hunting campaign usable from CLI only.

**Commit**: `feat(tracker): interviews, doctor, repair, ownership table`

---

## Phase 8 — MCP server

**Scope**:

- `src/mcp/server.ts` — `@modelcontextprotocol/sdk` server, stdio transport
- All tools wired to `core/`
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
- `npm publish --dry-run` clean
- Glama submission
- Tagged release

**Deliverable**: Public, glama-listed, fully documented.

**Commit**: `docs: README, help topics, examples, glama-ready`
