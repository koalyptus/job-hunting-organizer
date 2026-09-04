# src/core

I/O-free shared business logic for the job-hunting organizer.

- No `node:fs`, `node:path`, `node:os`, or network imports.
- Owns domain types (`src/core/types.ts`), LLM client, humanize post-processing, GitHub helpers, CV-light parsing, JD extraction/suggestion, application listing, prompt parsing, slug/URL parsing, sanitization, validation, and spinner/debug utilities.
- Consumed by `src/workflow/` orchestrators and, for a few pure helpers, directly by `src/cli/` or `src/mcp/`.
- Tests are colocated under `src/core/tests/`.

If a module needs filesystem paths, config, logging, or storage, it belongs in `src/lib/`, `src/workflow/`, or `src/storage/`.
