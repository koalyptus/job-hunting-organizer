# src/workflow

I/O-permitted orchestrators shared by the CLI and MCP surfaces.

Each subfolder owns one campaign/application workflow:

- `init/` — init wizard: inputs, local-agent detection, LLM config, profile generation/skeleton, and config/profile writes.
- `campaign/` — campaign-level operations: profile build/read/write, KB ingest/context/sync, target roles, voice guide resolution, ownership, rename/remove.
- `applications/` — application CRUD, cover letter generation, Q&A, metadata/normalization, index/counter management, rename, show formatting.
- `track/` — `jho track` orchestration: JD extraction, target-role suggestion, create/update confirmation, steer handling.
- `interviews/` — interview entry CRUD and status promotion.
- `prepare/` — pre-interview prep generation and persistence.
- `retro/` — retro generation, append, and weak-topic aggregation.
- `repair/` — auto-repair: toolhash refresh/sidecar migration, index/counter rebuild, interview-status backfill.
- `doctor/` — campaign and application diagnostics.
- `stats/` — campaign snapshot, detailed formatting, funnel/interview-entry counting.
- `prompts.ts` — prompt template loader for workflow modules.

Workflow modules are allowed to use `node:fs/promises`, `node:path`, `node:os`, locks, atomic writes, and the storage port.
