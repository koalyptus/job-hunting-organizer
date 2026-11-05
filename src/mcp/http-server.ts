import { createServer, type Server } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';

/** Default port for the MCP HTTP server. */
export const DEFAULT_HTTP_PORT = 7331;

/**
 * Default bind host for the MCP HTTP server.
 *
 * Loopback only. The transport is unauthenticated, so it must not listen on
 * other interfaces unless the user explicitly overrides {@link HTTP_HOST_ENV_VAR}.
 */
export const DEFAULT_HTTP_HOST = '127.0.0.1';

/** Environment variable that overrides the bind host for the HTTP transport. */
export const HTTP_HOST_ENV_VAR = 'JHO_MCP_HOST';

/** CORS methods and headers exposed to browser-extension clients. */
const CORS_HEADERS: Record<string, string> = {
  // No DELETE: this transport is stateless, so there is no session to
  // terminate (the SDK would otherwise close the shared transport for good).
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  // The MCP v2 client sends these on non-safelisted requests. `mcp-protocol` is
  // the obsolete v1 name and is deliberately absent.
  'Access-Control-Allow-Headers': [
    'Content-Type',
    'Authorization',
    'mcp-protocol-version',
    'mcp-session-id',
    'mcp-method',
    'mcp-name',
    'last-event-id',
  ].join(', '),
};

/** Hostnames that may legitimately appear in a loopback request's `Host` header. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Bind hosts that mean "every interface"; the Host allowlist cannot apply to them. */
const WILDCARD_HOSTS = new Set(['', '0.0.0.0', '::', '::0']);

/** Hop-by-hop headers that must not be forwarded to the Web Request. */
const HOP_BY_HOP = new Set(['host', 'connection', 'content-length', 'transfer-encoding']);

/**
 * Resolve the bind host for the HTTP transport.
 *
 * @returns `JHO_MCP_HOST` when set to a non-empty value, otherwise
 *   {@link DEFAULT_HTTP_HOST}.
 */
export function resolveHttpHost(): string {
  const configured = process.env[HTTP_HOST_ENV_VAR]?.trim();
  return configured ? configured : DEFAULT_HTTP_HOST;
}

/**
 * Extract the hostname from a `Host` header value, dropping any port and
 * handling bracketed IPv6 literals.
 *
 * @param host - The raw `Host` header (e.g. `localhost:7331`, `[::1]:7331`).
 * @returns The bare hostname, lowercased.
 */
function hostnameOf(host: string): string {
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end === -1 ? host.toLowerCase() : host.slice(1, end).toLowerCase();
  }
  const colon = host.lastIndexOf(':');
  return (colon === -1 ? host : host.slice(0, colon)).toLowerCase();
}

/**
 * Whether a browser origin may make cross-origin requests to the transport.
 *
 * Only loopback development servers and installed browser extensions are
 * allowed; arbitrary web origins get no `Access-Control-Allow-Origin` header,
 * so the browser blocks their responses.
 *
 * @param origin - The request's `Origin` header, if present.
 * @returns `true` when the origin is a loopback or extension origin.
 */
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    // WHATWG `URL.hostname` keeps the brackets on IPv6 literals.
    hostname === '[::1]' ||
    url.protocol === 'chrome-extension:' ||
    url.protocol === 'moz-extension:'
  );
}

/**
 * Whether the request's `Host` header refers to this server.
 *
 * Rejects DNS-rebinding attempts, where an attacker-controlled name resolves to
 * `127.0.0.1` and the browser sends that name as the `Host` header.
 *
 * @param host - The request's `Host` header, if present.
 * @param boundHost - The host the server is actually bound to.
 * @returns `true` when the header names loopback or the bound host.
 */
function isAllowedHost(host: string | undefined, boundHost: string): boolean {
  // A wildcard bind means the user deliberately exposed the port beyond
  // loopback; remote clients legitimately send their own host, so the
  // DNS-rebinding defence cannot apply.
  if (WILDCARD_HOSTS.has(boundHost.toLowerCase())) {
    return true;
  }

  if (!host) {
    return false;
  }

  const hostname = hostnameOf(host);
  return LOOPBACK_HOSTS.has(hostname) || hostname === boundHost.toLowerCase();
}

/**
 * Convert a Node {@link IncomingMessage} into a Web {@link Request} for the
 * MCP Streamable HTTP transport.
 *
 * @param req - The Node incoming message.
 * @param port - The local port the server is listening on.
 * @param body - The already-read request body, if any.
 * @returns A Web Request suitable for `transport.handleRequest`.
 */
function toWebRequest(req: IncomingMessage, port: number, body: Buffer | undefined): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (!v || HOP_BY_HOP.has(k)) {
      continue;
    }
    headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  }
  return new Request(`http://localhost:${port}${req.url ?? '/'}`, {
    method: req.method,
    headers,
    body,
  });
}

/**
 * Write a Web {@link Response} back to a Node {@link ServerResponse},
 * preserving duplicate `Set-Cookie` headers (which `Object.fromEntries` collapses).
 *
 * @param res - The Node server response.
 * @param resp - The Web response from the MCP transport.
 */
async function writeWebResponse(res: ServerResponse, resp: Response): Promise<void> {
  const setCookies = resp.headers.getSetCookie();
  const respHeaders: Record<string, string | string[]> = Object.fromEntries(
    [...resp.headers.entries()].filter(([k]) => k !== 'set-cookie'),
  );
  if (setCookies.length > 0) {
    respHeaders['Set-Cookie'] = setCookies;
  }
  res.writeHead(resp.status, respHeaders);
  // Send the headers now rather than on the first body write: a GET SSE stream
  // may produce no body until the keepalive fires, and the client should not
  // sit on a pending request until then.
  res.flushHeaders();
  if (!resp.body) {
    res.end();
    return;
  }

  const reader = resp.body.getReader();

  // A GET opens a long-lived SSE stream. If the client disconnects mid-stream,
  // cancel the upstream reader so the transport is not left waiting forever.
  const cancelOnDisconnect = (): void => {
    void reader.cancel().catch(() => {});
  };
  res.once('close', cancelOnDisconnect);

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || res.writableEnded || res.destroyed) {
        break;
      }
      res.write(value);
    }
  } finally {
    res.removeListener('close', cancelOnDisconnect);
    // Cancelling also releases the reader lock; releaseLock() covers the case
    // where cancel() has not run yet.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  if (!res.writableEnded && !res.destroyed) {
    res.end();
  }
}

/**
 * Start a Node HTTP server that bridges incoming requests to the MCP
 * {@link WebStandardStreamableHTTPServerTransport}.
 *
 * The server binds loopback only by default (override with
 * {@link HTTP_HOST_ENV_VAR}), rejects requests whose `Host` header does not
 * match the bound host, echoes CORS headers only for loopback/extension
 * origins, handles `OPTIONS` preflights, and converts between Node and Web
 * request/response objects.
 *
 * @param transport - The MCP Streamable HTTP transport to bridge to.
 * @param port - The port to listen on.
 * @param host - The interface to bind. Defaults to {@link resolveHttpHost}.
 * @returns Resolves with the underlying Node server once it is listening.
 */
export async function startHttpServer(
  transport: WebStandardStreamableHTTPServerTransport,
  port: number,
  host: string = resolveHttpHost(),
): Promise<Server> {
  const server = createServer(async (req, res) => {
    try {
      // Reject DNS rebinding: only loopback (or the explicitly bound host) may
      // address this server.
      if (!isAllowedHost(req.headers.host, host)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden: invalid Host header\n');
        return;
      }

      // Echo a permissive CORS policy only for trusted origins; everyone else
      // gets no Access-Control-Allow-Origin and is blocked by the browser.
      // `Vary` is unconditional because the response differs by Origin either way.
      res.setHeader('Vary', 'Origin');
      const origin = req.headers.origin;
      if (typeof origin === 'string' && isAllowedOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      for (const [k, v] of Object.entries(CORS_HEADERS)) {
        res.setHeader(k, v);
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'DELETE') {
        // Stateless mode has no session to terminate. The SDK's DELETE handler
        // calls `transport.close()` unconditionally, which would permanently
        // disable this shared transport for every client.
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed: this transport is stateless\n');
        return;
      }

      // GET/HEAD must not carry a body — `new Request` rejects one.
      const method = req.method ?? 'GET';
      let body: Buffer | undefined;
      if (method !== 'GET' && method !== 'HEAD') {
        const chunks: Buffer[] = [];
        for await (const c of req) {
          chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
        }
        body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
      }

      const webReq = toWebRequest(req, port, body);
      const resp = await transport.handleRequest(webReq);
      await writeWebResponse(res, resp);
    } catch (err) {
      // Never leave the socket open: an unhandled rejection here would hang the
      // client instead of reporting the failure.
      if (res.headersSent || res.writableEnded) {
        res.destroy();
        return;
      }
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Internal error: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

/**
 * Create a stateless MCP Streamable HTTP transport.
 *
 * No `sessionIdGenerator` means the SDK neither assigns nor requires a session
 * id. A single shared *stateful* transport serves exactly one session for the
 * life of the process: the SDK rejects a second `initialize` with
 * `400 Server already initialized`, and any `DELETE` closes the transport for
 * every client. Chrome suspends and restarts the extension's MV3 background
 * worker constantly, so it re-initializes on every resume and would be locked
 * out permanently. jho's tools are stateless file operations, so nothing is
 * lost by dropping sessions.
 *
 * @returns A new stateless transport ready to connect to an McpServer.
 */
export function createHttpTransport(): WebStandardStreamableHTTPServerTransport {
  return new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
}
