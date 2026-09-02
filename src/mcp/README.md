# src/mcp

Model Context Protocol server for `jho-mcp`.

- `server.ts` — stdio server bootstrap, fatal-log fallback, store wiring.
- `tools.ts` — registers all MCP tools on the server.
- `tools/` — one file per tool; validates Zod input, delegates to workflow/core, returns MCP content.
- `resources/` — static/read resources exposed to MCP clients.
- `prompts/` — prompt wrappers/re-exports for MCP prompt registration.
- `logger.ts` / `error-handler.ts` / `schemas.ts` — MCP-specific logging, error translation, and schema metadata.

The MCP surface mirrors CLI capabilities; it should not contain its own campaign business logic.
