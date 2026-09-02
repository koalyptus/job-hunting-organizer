# bin

Entry points for the `job-hunting-organizer` package.

- `jho` — local-first CLI. Invokes the Commander program in `src/cli/index.ts`.
- `jho-mcp` — MCP server. Invokes the stdio server in `src/mcp/server.ts`.

Both are thin Node shims. They do not contain domain logic.
