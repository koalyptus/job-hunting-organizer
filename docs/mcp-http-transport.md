# MCP-over-HTTP (Streamable HTTP) — implementation resource

Tracking issue: [#103 spike: MCP-over-HTTP/SSE transport exposed to the browser extension](https://github.com/koalyptus/job-hunting-organizer/issues/103). This is a dev-facing resource for adding an HTTP entry point to `jho-mcp`.

## Validation findings (spike #103)

**Result: VALIDATED.** jho's real MCP server — all 37 tools (plus 5 resources and the registered prompts) from `src/mcp/server.ts` (`createServer()` + `registerTools` / `registerResources` / `registerPrompts`) — is servable over the MCP **v2 Streamable HTTP** transport and callable by a v2 `StreamableHTTPClientTransport` client. CORS headers were confirmed on the wire. The stdio surface (`node bin/jho-mcp`) is unaffected. No repo source was modified for the spike (throwaway scripts imported from `src/` via `tsx`).

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

**Stdio baseline (unaffected):** `StdioClientTransport` → `node bin/jho-mcp`: `STDIO_OK=1`, 37 tools; `list_campaigns` vs live data → returned the campaigns present on the test machine (names and counts are machine-specific, so not reproduced here).

**Footprint:** no `src`/`bin`/`dist` changes; throwaway scripts under `scripts/spike/` (untracked, awaiting cleanup); temp data roots created under the OS temp dir during the spike were auto-cleaned.

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
http
  .createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, mcp-protocol, mcp-session-id, authorization',
    );
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (!v) continue;
      if (k === 'host' || k === 'connection' || k === 'content-length' || k === 'transfer-encoding')
        continue;
      headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    }
    let body: BodyInit | undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
      body = Buffer.concat(chunks);
    }
    const webReq = new Request(`http://localhost:${PORT}${req.url ?? '/'}`, {
      method: req.method,
      headers,
      body,
    });
    const resp = await transport.handleRequest(webReq);
    const setCookies = resp.headers.getSetCookie();
    const respHeaders: Record<string, string | string[]> = Object.fromEntries(
      [...resp.headers.entries()].filter(([k]) => k !== 'set-cookie'),
    );
    if (setCookies.length) respHeaders['Set-Cookie'] = setCookies;
    res.writeHead(resp.status, respHeaders);
    if (resp.body) {
      const reader = resp.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  })
  .listen(PORT);
```

## Implementation status (issue #104, commit `c14e8d8`)

**Implemented and shipped.** The wiring described in the spike has landed:

- `src/mcp/http-server.ts` (new): Node `http` adapter with CORS, `OPTIONS` preflight, Node↔Web `Request`/`Response` conversion, duplicate `Set-Cookie` preservation. Exports `createHttpTransport()`, `startHttpServer()`, and `DEFAULT_HTTP_PORT` (7331).
- `src/mcp/server.ts`: `startServer({ transport?: 'stdio' | 'http'; port?: number })` — on `http`, creates the transport and starts the HTTP server; on `stdio` (default), keeps the current behavior (no regression). The store/server/registration bootstrap is shared.
- `bin/jho-mcp`: parses `--http` and `--port N` from `process.argv` and passes them to `startServer`.
- `src/cli/commands/mcp.ts`: `jho mcp --http [--port N]` commander options with help text and examples.
- `src/mcp/tests/http-server.test.ts`: 3 integration tests covering the HTTP round-trip.

Usage:

```
jho mcp                     # stdio (default, no regression)
jho mcp --http              # Streamable HTTP on port 7331
jho mcp --http --port 8080  # Streamable HTTP on a custom port
```

CORS is as in the reference (`Access-Control-Allow-Origin: *`, loopback-only, no auth). For a production web client, scope origins and add bearer auth (see PLAN §20 / ROADMAP "Web client").

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
  // body/headers: same Node<->Web conversion as the bridge pattern above
  const resp = await handler.fetch(
    new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, body, headers }),
  );
  // write resp with CORS headers
});
```

## Open questions for implementation

1. **Server lifetime:** ~~single shared `McpServer` vs. per-request~~ **Resolved** — chose the shared `McpServer` + `WebStandardStreamableHTTPServerTransport` (stateful sessions, single registration). The `createMcpHandler` alternative was rejected to avoid re-registering 37 tools per request.
2. **Session/Cookie echo:** stateful sessions need `sessionIdGenerator` + correct `set-cookie` echoing through the Node adapter; the shared-server pattern is stateful. **Resolved** — `createHttpTransport()` uses `randomUUID()` for session IDs, and `writeWebResponse()` preserves duplicate `Set-Cookie` headers via `resp.headers.getSetCookie()`.
3. **Protocol era:** confirm which client era the browser extension target speaks; `createMcpHandler` and `WebStandardStreamableHTTPServerTransport` both handle modern/`2026-07-28` negotiation.
4. **Port default / config:** ~~pick a default port and decide whether it lives in global `config.json`~~ **Resolved** — default port is **7331** (`DEFAULT_HTTP_PORT` in `src/mcp/http-server.ts`). Not added to `config.json` yet; the `webServer.{port,host}` placeholder was removed per PLAN §20 and will be re-added when the web client lands.
