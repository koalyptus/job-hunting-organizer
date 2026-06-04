# job-hunting-organizer

A local-first CLI and MCP server for running a job-hunting campaign.

> **Status:** under active development. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for progress. Currently at **Phase 1** (skeleton).

## What it does

1. **Builds your profile** from a CV (PDF / DOCX / Markdown) and your GitHub repos.
2. **Generates tailored cover letters** from job-description URLs (Seek, LinkedIn, Indeed, others).
3. **Tailors answers** to application questions — given as text or as a screenshot.
4. **Tracks every application** in a structured folder per role, with the full interview pipeline.
5. **Schedules interviews** to your calendar (ICS by default; Microsoft Outlook opt-in).

## Privacy

> **Your data stays local.** `job-hunting-organizer` reads your CV from a path you configure, fetches job descriptions from URLs you provide, and calls the LLM endpoint _you_ configure. Nothing is sent to the tool author or to any third party. With a local model (Ollama, OpenCode, LM Studio) the LLM call stays on your machine. The tool has zero telemetry, zero analytics, and zero outbound calls except those you explicitly configure.

All user data lives under one external directory, default `~/job-hunting-organizer/` (override with `$JHO_ROOT`). Nothing user-specific is committed to this repo.

## Install

```sh
npm install
npm run build
```

The binaries are then available at `./bin/jho` and `./bin/jho-mcp`.

### Cross-platform notes

Runs unchanged on Linux, macOS, and Windows.

- **Linux / macOS**: `./bin/jho --version` or `npx jho --version`.
- **Windows**: use `npx jho --version` (or `jho --version` after `npm install -g`). Direct invocation of `./bin/jho` requires Git Bash or WSL because Windows shells don't honor shebangs; the npm shim handles this transparently.
- All shell commands above work in PowerShell, cmd, bash, and zsh. No platform-specific flags.
- CI runs the full check matrix on `ubuntu-latest`, `windows-latest`, and `macos-latest` (Node 20 + 22).

## Quickstart (once Phase 4 is shipped)

```sh
# 1. Initialize your campaign (wizard builds your profile from CV + GitHub)
jho init

# 2. Record an application from a job URL
jho track https://au.seek.com.au/job/12345

# 3. Generate a tailored cover letter
jho cover-letter 2026-Jun-03-SE-Nuage-Technology-Group-12345

# 4. Tailor an answer to an application question
jho answer 2026-Jun-03-SE-Nuage-Technology-Group-12345 "Why this company?"

# 5. Track interview stages
jho interview 2026-Jun-03-SE-Nuage-Technology-Group-12345 add \
  --when "2026-06-10 10:00" --type hr --duration 30
```

## As an MCP server

Once Phase 8 is shipped, this package ships an MCP server. Add to your MCP client config:

```json
{
  "mcpServers": {
    "jho": {
      "command": "jho-mcp"
    }
  }
}
```

The server exposes tools for the full workflow: `init`, `extract_jd`, `cover_letter`, `answer_question`, `track_application`, `list_applications`, `show_application`, `add_interview`, `list_interviews`, `mark_interview`, `read_profile`, `update_profile`, `get_root`, `update_config`, `ownership`, `doctor`, `repair`.

## Documentation

- [`docs/PLAN.md`](docs/PLAN.md) — the full design plan
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phased build plan with status
- [`AGENTS.md`](AGENTS.md) — for AI agents using the MCP server

## License

[MIT](LICENSE)
