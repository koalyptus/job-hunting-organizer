import { createServer, type Server } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';

/** Default port for the MCP HTTP server. */
export const DEFAULT_HTTP_PORT = 7331;

/** CORS headers for loopback-only browser-extension clients. */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, mcp-protocol, mcp-session-id, authorization',
};

/** Hop-by-hop headers that must not be forwarded to the Web Request. */
const HOP_BY_HOP = new Set(['host', 'connection', 'content-length', 'transfer-encoding']);

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
  if (resp.body) {
    const reader = resp.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      res.write(value);
    }
  }
  res.end();
}

/**
 * Start a Node HTTP server that bridges incoming requests to the MCP
 * {@link WebStandardStreamableHTTPServerTransport}.
 *
 * The server adds CORS headers (loopback-only, no auth), handles `OPTIONS`
 * preflights, and converts between Node and Web request/response objects.
 *
 * @param transport - The MCP Streamable HTTP transport to bridge to.
 * @param port - The port to listen on.
 * @returns Resolves with the underlying Node server once it is listening.
 */
export async function startHttpServer(
  transport: WebStandardStreamableHTTPServerTransport,
  port: number,
): Promise<Server> {
  const server = createServer(async (req, res) => {
    // Add CORS headers to every response (including errors).
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      res.setHeader(k, v);
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const chunks: Buffer[] = [];
    for await (const c of req) {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    }
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

    const webReq = toWebRequest(req, port, body);
    const resp = await transport.handleRequest(webReq);
    await writeWebResponse(res, resp);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

/**
 * Create a stateful MCP Streamable HTTP transport with a random session ID
 * generator.
 *
 * @returns A new transport ready to connect to an McpServer.
 */
export function createHttpTransport(): WebStandardStreamableHTTPServerTransport {
  return new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
}
