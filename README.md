# job-hunting-organizer

A CLI and MCP server helping job seekers to keep track of job applications without leaving the comfort of the terminal or harness ;-)

## What it does

1. **Builds your profile** from a CV (PDF / DOCX / Markdown) and your GitHub repos — including a structured list of target roles (level, domain, stack, comp floor, priority) you can refine.
2. **Suggests the best-matching target role** for every new job description, so the cover letter and Q&A know which version of "you" to emphasize.
3. **Generates tailored cover letters** from job-description URLs (Seek, LinkedIn, Indeed, others).
4. **Tailors answers** to application questions — given as text or as a screenshot.
5. **Tracks every application** in a structured folder per role, with the full interview pipeline.
6. After a failed interview, **captures your weak topics and generates a personal learning plan** for each, then aggregates recurring weak areas across applications.
7. **Schedules interviews** via an ICS file you can import into any calendar.

## Privacy

> **Your data stays local.** `job-hunting-organizer` reads your CV from a path you configure, fetches job descriptions from URLs you provide, and calls the LLM endpoint _you_ configure. Nothing is sent to the tool author or to any third party. With a local model (Ollama, OpenCode, LM Studio) the LLM call stays on your machine. The tool has zero telemetry, zero analytics, and zero outbound calls except those you explicitly configure.

All user data lives outside the repo under two external directories. The **config home** (default `~/.job-hunting-organizer/`, override with `$JHO_CONFIG_HOME`) holds the global `config.json` (LLM endpoint, GitHub token) and `.locks/`. The **data root** (default `~/job-hunting-organizer-data/`, override with `$JHO_DATA`) holds `campaigns/<name>/` and all per-campaign working data — each campaign has its own `profile.md`, `applied/`, and `knowledge-base/`. Nothing user-specific is committed to this repo. You can run multiple independent campaigns by creating more under `campaigns/`.

The data layout (folder-per-application, markdown + JSON, no DB) leaves room for an optional local web client in the future. The CLI and MCP server are the v1 surfaces; see `docs/PLAN.md` §20 for the forward-looking design notes.

## Install

```sh
npm install
npm run build
```

The binaries are then available at `./bin/jho` and `./bin/jho-mcp`.

## Build & test commands

```sh
npm run build            # tsup → dist/
npm run typecheck        # tsc --noEmit
npm run lint             # eslint
npm run format:check     # prettier
npm test                 # vitest (unit tests)
npm run test:integration # vitest (integration tests)
npm run eval             # lightweight LLM eval suite (manual)
```

### Integration tests

End-to-end tests exercising the full CLI or MCP stack with real filesystem operations.

**Location**: `integration-tests/`

**Run**:

```sh
npm run test:integration
```

**Structure**:

```text
integration-tests/
├── helpers.ts              # Shared setup utilities
├── mocks.ts                # Shared vitest mock factories
├── cli/                    # CLI end-to-end tests
│   ├── ...
└── mcp/                    # MCP tool dispatch tests
    └── tools-e2e.test.ts
```

**What's mocked vs real**:

| Layer       | Unit Tests | Integration Tests |
| ----------- | ---------- | ----------------- |
| CLI parsing | Real       | Real              |
| Core logic  | Mocked     | **Real**          |
| Filesystem  | Real       | Real              |
| LLM         | Mocked     | Mocked            |
| Logger      | Mocked     | Mocked            |

**Adding a new test**:

1. CLI: Add to `integration-tests/cli/`, use `runCommand()` from `src/cli/tests/helpers.ts`
2. MCP: Add to `integration-tests/mcp/`, use `createTestServer()` from `src/mcp/tests/tools/helpers.ts`
3. Mock only logger and LLM — never mock the layer under test

### Cross-platform notes

Runs unchanged on Linux, macOS, and Windows.

- **Linux / macOS**: `./bin/jho --version` or `npx jho --version`.
- **Windows**: use `npx jho --version` (or `jho --version` after `npm install -g`). Direct invocation of `./bin/jho` requires Git Bash or WSL because Windows shells don't honor shebangs; the npm shim handles this transparently.
- All shell commands above work in PowerShell, cmd, bash, and zsh. No platform-specific flags.
- CI runs the full check matrix on `ubuntu-latest`, `windows-latest`, and `macos-latest` (Node 20 + 22).

## Quickstart

```sh
# 1. Initialize your campaign (wizard builds your profile from CV + GitHub,
#    then reviews the suggested target roles with you)
jho init

# 2. Record an application from a job URL
#    (suggests a target role from your profile; you confirm or override)
jho track https://au.seek.com.au/job/12345

> **Job ID extraction**: URLs are parsed for a job-board ID used in the folder slug. Built-in patterns support Seek, LinkedIn, Indeed, and a generic trailing-number fallback. Custom patterns can be added via the `JHO_URL_PATTERNS` environment variable — a JSON array of `{ name, pattern, group }` objects that are tried before the built-in patterns.

# 3. Generate a tailored cover letter
jho cover-letter 2026-Jun-03-SE-Nuage-Technology-Group-12345

# 4. Tailor an answer to an application question
jho answer 2026-Jun-03-SE-Nuage-Technology-Group-12345 "Why this company?"

# 5. Track interview stages
jho interview 2026-Jun-03-SE-Nuage-Technology-Group-12345 add \
  --when "2026-06-10 10:00" --type hr --duration 30

# 5b. Before the interview: get a prep plan (tech stack, depth-tagged topics, timeline)
jho prepare 2026-Jun-03-SE-Nuage-Technology-Group-12345 --days 7
#   ... write prepare.md to the app folder; append with --add

# 6. After a rejection: jot down weak topics, get a learning plan
jho retro 2026-Jun-03-SE-Nuage-Technology-Group-12345
#  ... answer "what topics did you struggle with?" ...

# 7. See recurring weak topics across all interviews
jho retro aggregate

# 8. Get a snapshot of the campaign (counts, funnel, this-month delta)
jho stats

# 9. Read the log file (pretty-printed; log file is always JSON for tools)
jho logs --tail 50
jho logs --json | jq 'select(.level == 50)'    # pipe to jq for filtering
```

> **Tip**: you can omit the slug and just `cd` into the application folder — `jho show`, `jho cover-letter`, `jho answer`, `jho interview ...`, `jho prepare`, `jho retro`, `jho retro show`, `jho retro append` all infer the slug from the current directory.
>
> ```sh
> cd ~/job-hunting-organizer-data/campaigns/default/applied/2026-Jun-03-SE-Nuage-Technology-Group-12345
> jho show              # same as passing the slug explicitly
> jho retro             # works from any subfolder too
> ```
>
> **Multiple campaigns**: each one lives at `<data-root>/campaigns/<name>/`. Create them with `jho init <name>` (omit the name to use the `default` campaign). All commands accept `--campaign <name>` to target a specific one; otherwise the campaign is inferred from your cwd.
>
> ```sh
> jho init freelance
> jho --campaign freelance track https://au.seek.com.au/job/12345
> jho --campaign ft-jobs stats
> ```
>
> **Renaming a campaign**: the folder name is the only thing that identifies a campaign — nothing on disk references it elsewhere, so `jho rename-campaign <old> <new>` (or just `jho rename-campaign <new>` from inside the campaign folder) is enough. It validates the new name, takes a lock, and logs the move. You can also just `mv` the folder directly; the tool will pick up the new name on the next call.

### Natural language

Any command can also be invoked in plain English. If the first argument contains a space and isn't a known command, `jho` asks an LLM to map it to the equivalent command and re-runs the real implementation — no behaviour is reimplemented, so output is identical to the explicit form.

```sh
jho "list all applications for javascript-developer campaign"
jho "create cover letter for application-xyz"
jho "show retro for application-xyz"
jho "add interview for application-xyz tomorrow at 2pm"
```

Global flags work too: `jho --yes "list apps"`. Lower-confidence parses are echoed back for confirmation (unless `--yes`); very low confidence errors out with a rephrase hint. Natural-language parsing requires a configured LLM (same as the other LLM-backed commands).

## As an MCP server

This package ships an MCP server via the `jho-mcp` binary.
Check your harness documentation for correct configuration, as an example:

**GitHub Copilot** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "jho-mcp": {
			"type": "stdio",
			"command": "node",
			"args": ["bin/jho-mcp"],
			"cwd": "C:\\path\\to\\job-hunting-organizer"
		}
  }
}
```

**Opencode** (`opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "jho-mcp": {
      "type": "local",
      "command": [
        "node",
        "bin/jho-mcp"
      ],
      "cwd": "path/to/job-hunting-organizer/bin/jho-mcp",
      "enabled": true,
      "timeout": 60000
    }
  }
}
```

> **Local model tip:** If you use a local LLM (Ollama, LM Studio, OpenCode), add `"timeout": 30000` to the MCP server config. Local models can be slow on first load, and the default 5-second timeout may fire before the server responds to `initialize` or `tools/list`.
>
> ```json
> {
>   "type": "local",
>   "command": ["jho-mcp"],
>   "enabled": true,
>   "timeout": 30000
> }
> ```

> **Note:** MCP client configs are not standardized — each client uses its own schema and key names.
> To set a custom data location, add `"JHO_DATA": "/path/to/data"` to the `env` block (Claude Desktop, Cursor, Copilot) or `environment` block (Opencode).

## LLM configuration

`jho` uses the OpenAI API format for all LLM calls. Any OpenAI-compatible endpoint works:

- **Ollama** — `http://localhost:11434/v1` (free, private, on-device)
- **LM Studio** — `http://localhost:1234/v1` (free, private, on-device)
- **OpenAI** — `https://api.openai.com/v1` (cloud)
- **Any OpenAI-compatible proxy** (LiteLLM, OpenRouter, etc.)

> **Anthropic / Claude users:** Anthropic native API uses a different format (`/v1/messages` instead of `/v1/chat/completions`). To use Claude with `jho`, run LiteLLM as a local proxy:
>
> ```sh
> pip install litellm
> litellm --model anthropic/claude-3-5-sonnet-20241022 --api_base http://localhost:4000
> ```
>
> Then configure `jho` with baseUrl `http://localhost:4000/v1` and an empty API key.

During `jho init`, the tool automatically detects locally-installed Ollama and LM Studio instances (via the [detect-local-agents](https://www.npmjs.com/package/detect-local-agents) package) and pre-fills the recommended LLM config. Run `jho doctor --detect-agents` at any time to see what's detected.

## Documentation

- [`docs/PLAN.md`](docs/PLAN.md) — the full design plan
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phased build plan with status
- [`AGENTS.md`](AGENTS.md) — for AI agents using the MCP server

## License

[MIT](LICENSE)
