# MCP-over-HTTP (Streamable HTTP) — implementation resource

Tracking issue: [#103 spike: MCP-over-HTTP/SSE transport exposed to the browser extension](https://github.com/koalyptus/job-hunting-organizer/issues/103). This is a dev-facing resource for adding an HTTP entry point to `jho-mcp`.

## Validation findings (spike #103)

**Result: VALIDATED.** jho's real MCP server — all 37 tools/resources/prompts registered from `src/mcp/server.ts` (`createServer()` + `registerTools` / `registerResources` / `registerPrompts`) — is servable over the MCP **v2 Streamable HTTP** transport and callable by a v2 `StreamableHTTPClientTransport` client. CORS headers were confirmed on the wire. The stdio surface (`node bin/jho-mcp`) is unaffected. No repo source was modified for the spike (throwaway scripts imported from `src/` via `tsx`).

**Re-scoping (issue premise is v1):** `@modelcontextprotocol/server@2.0.0` has **no `./sse` export and no `SSEServerTransport`**:

```
$ node -e "require('@modelcontextprotocol/server/sse')"
# TypeError: ... @modelcontextprotocol/server/sse ... does not provide an export ...
```

v2's replacement is **Streamable HTTP** (the `2026-07-28` spec). A Streamable HTTP endpoint can still stream SSE (`text/event-stream`) and serves browser extensions; it is simply not the old v1 `SSEServerTransport` class. `SSEClientTransport` is deprecated on the client side.

**Bootstrap (throwaway bridge):** `createStore()` → `createServer()` → `registerTools/Resources/Prompts` → `server.connect(transport)` on `WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() })`; a Node `http.createServer` adapter adds CORS and converts `IncomingMessage` ↔ Web `Request`/`Response` (hand-rolled, since `@modelcontextprotocol/node` is not installed).

**HTTP round-trip** (via `StreamableHTTPClientTransport`, 10s connect timeout):
- `HTTP_OK=1`, **37 tools listed**.
- `list_campaigns` → seeded `default` (`applicationCount: 0`).
- `get_root {campaign:"default"}` → resolved campaign root under `$JHO_DATA/campaigns/default`.

**CORS on the wire** (fetch probe):
- `OPTIONS` → `204`, `access-control-allow-origin: *`, `access-control-allow-methods: GET, POST, OPTIONS`, `access-control-allow-headers: Content-Type, mcp-protocol, mcp-session-id, authorization`.
- `POST initialize` → `406` + `access-control-allow-origin: *` + `content-type: application/json` (the `406` is the bare-fetch probe missing client protocol-negotiation headers; a real v2 client gets `200`).

**Stdio baseline (unaffected):** `StdioClientTransport` → `node bin/jho-mcp`: `STDIO_OK=1`, 37 tools; `list_campaigns` vs live data → `backend-developer(7)`, `default(4)`, `javascript-developer(115)`, `test8(7)`.

**Footprint:** no `src`/`bin`/`dist` changes; throwaway scripts under `scripts/spike/` (5 files) awaiting cleanup; two orphaned temp data roots under the OS temp dir (auto-cleaned).

> Full evidence: issue #103 spike comment [#6247928680](https://github.com/koalyptus/job-hunting-organizer/issues/103#issuecomment-6247928680).

## Installed API (verified)

`@modelcontextprotocol/server@2.0.0`:
- `WebStandardStreamableHTTPServerTransport` (class, main index export) — connects to an `McpServer`; uses Web-standard `Request`/`Response` (Node ≥ 18).
  - `constructor(options?: WebStandardStreamableHTTPServerTransportOptions)` where `sessionIdGenerator?: (() => string) | undefined` (omit or `undefined` for stateless).
  - `handleRequest(req: Request, options?: HandleRequestOptions): Promise<Response>` — handles both `GET` (SSE stream) and `POST`.
- `createMcpHandler(factory, options?): McpHttpHandler` — high-level: `handler.fetch(request: Request): Promise<Response>`. Routes GET/POST and protocol-era negotiation for you.
- `StdioServerTransport` from `@modelcontextprotocol/server/stdio` — used by the current stdio entry.

`@modelcontextprotocol/client@2.0.0`:
- `StreamableHTTPClientTransport` (class, main index export) — `constructor(url: URL, opts?)`. The preferred v2 client transport.
- `StdioClientTransport` from `@modelcontextprotocol/client/stdio`.
- `@modelcontextprotocol/node` is **not** installed (no `toNodeHandler`/`toWebRequest` helpers); Node↔Web `Request`/`Response` conversion must be hand-rolled (or use `createMcpHandler` + `handler.fetch`).

## Validated bridge pattern (reference)

Mirror the existing `startServer()` bootstrap in `src/mcp/server.ts`, then attach an HTTP transport instead of stdio:

```ts
// 1) same bootstrap as startServer()
const store = createStore();
const server = createServer();
registerTools(server, store);
registerResources(server);
registerPrompts(server);

// 2) Streamable HTTP transport
const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: () => crypto.randomUUID(), // omit for stateless
});
await server.connect(transport);

// 3) Node http adapter with CORS + Node<->Web conversion
http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-protocol, mcp-session-id, authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (!v) continue;
    if (k === 'host' || k === 'connection' || k === 'content-length' || k === 'transfer-encoding') continue;
    headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  }
  let body: BodyInit | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    body = Buffer.concat(chunks);
  }
  const webReq = new Request(`http://localhost:${PORT}${req.url ?? '/'}`, { method: req.method, headers, body });
  const resp = await transport.handleRequest(webReq);
  res.writeHead(resp.status, Object.fromEntries(resp.headers.entries()));
  if (resp.body) {
    const reader = resp.body.getReader();
    while (true) { const { done, value } = await reader.read(); if (done) break; res.write(value); }
  }
  res.end();
}).listen(PORT);
```

## Wiring direction (`--http` / `--port N`)

- `src/mcp/server.ts`: parametrize `startServer({ transport?: 'stdio' | 'http'; port?: number })`. On `http`, run the pattern above; on `stdio` (default), keep current behavior (no regression). The store/server/registration bootstrap is shared.
- `bin/jho-mcp`: parse `--http` and `--port N` from `process.argv` and pass to `startServer`.
- `src/cli/commands/mcp.ts`: add `jho mcp --http [--port N]` commander options.
- Keep CORS as in the reference (browser-extension origin is localhost; `*` is fine for loopback-only, no auth). For a production web client, scope origins and add bearer auth (see PLAN §20 / ROADMAP "Web client").

## `createMcpHandler` alternative (less plumbing)

If per-request server creation is acceptable (simpler, no manual CORS/Request conversion, era negotiation handled):

```ts
import { createMcpHandler } from '@modelcontextprotocol/server';
const handler = createMcpHandler(() => {
  const server = createServer();
  registerTools(server, createStore());
  registerResources(server);
  registerPrompts(server);
  return server;
});
http.createServer(async (req, res) => {
  const resp = await handler.fetch(new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, body, headers }));
  // write resp with CORS headers
});
```

## Open questions for implementation
1. **Server lifetime:** single shared `McpServer` + `WebStandardStreamableHTTPServerTransport` (reuse #103 pattern) vs. `createMcpHandler`'s per-request factory (simpler, re-registers 37 tools per request — cheap but wasteful under load).
2. **Session/Cookie echo:** stateful sessions need `sessionIdGenerator` + correct `set-cookie` echoing through the Node adapter; the shared-server pattern is stateful.
3. **Protocol era:** confirm which client era the browser extension target speaks; `createMcpHandler` and `WebStandardStreamableHTTPServerTransport` both handle modern/`2026-07-28` negotiation.
4. **Port default / config:** pick a default port and decide whether it lives in global `config.json` (note: the `webServer.{port,host}` placeholder was removed per PLAN §20; re-add only when this lands).
