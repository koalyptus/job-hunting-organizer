/**
 * Pure helpers for the MCP **Streamable HTTP** wire format.
 *
 * Kept free of `fetch`/DOM so they are unit-testable in a plain Node vitest
 * run (see `src/mcp/tests/protocol.test.ts`). The transport itself lives in
 * `client.ts`.
 *
 * A Streamable HTTP response is either `application/json` (a single JSON-RPC
 * message) or `text/event-stream` (one or more SSE frames, each carrying a
 * JSON-RPC message in its `data:` field).
 */

/** JSON-RPC 2.0 request envelope. */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 error object. */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** JSON-RPC 2.0 response envelope (result XOR error). */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | null;
  result?: unknown;
  error?: JsonRpcError;
}

/** Build a JSON-RPC request envelope. */
export function buildRequest(
  id: number,
  method: string,
  params?: Record<string, unknown>,
): JsonRpcRequest {
  return params === undefined
    ? { jsonrpc: '2.0', id, method }
    : { jsonrpc: '2.0', id, method, params };
}

/** Build a JSON-RPC notification envelope (no `id`, no response expected). */
export function buildNotification(
  method: string,
  params?: Record<string, unknown>,
): Record<string, unknown> {
  return params === undefined ? { jsonrpc: '2.0', method } : { jsonrpc: '2.0', method, params };
}

/**
 * Parse a `data:` line from an SSE frame.
 *
 * @param line - One line of the SSE body.
 * @returns The payload after `data:`, or `null` if the line is not a data line.
 */
export function parseSseDataLine(line: string): string | null {
  if (!line.startsWith('data:')) {
    return null;
  }

  const payload = line.slice('data:'.length);
  // SSE strips a single leading space after the colon.
  return payload.startsWith(' ') ? payload.slice(1) : payload;
}

/**
 * Extract every JSON payload from an SSE body.
 *
 * @param body - Raw `text/event-stream` response body.
 * @returns Non-empty `data:` payloads, in order.
 */
export function parseSsePayloads(body: string): string[] {
  const payloads: string[] = [];

  for (const line of body.split(/\r?\n/)) {
    const data = parseSseDataLine(line);
    if (data !== null && data !== '') {
      payloads.push(data);
    }
  }

  return payloads;
}

/**
 * Decode a response body into a JSON-RPC message, transparently handling both
 * `application/json` and `text/event-stream` content types.
 *
 * @param contentType - Response `Content-Type`, used to pick the parser.
 * @param body - Raw response body.
 * @returns The decoded message, or `null` when the body carries none.
 */
export function decodeJsonRpcMessage(
  contentType: string,
  body: string,
): JsonRpcResponse | null {
  const payloads = contentType.includes('text/event-stream')
    ? parseSsePayloads(body)
    : [body.trim()];

  for (const payload of payloads) {
    if (payload === '') {
      continue;
    }

    try {
      return JSON.parse(payload) as JsonRpcResponse;
    } catch {
      // Not a JSON-RPC frame (e.g. a keep-alive comment); keep scanning.
      continue;
    }
  }

  return null;
}

/** Shape of a `tools/call` result envelope. */
export interface CallToolEnvelope {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
}

/**
 * Decode a `tools/call` result into a flat, transport-neutral shape.
 *
 * @param result - The `result` field of the JSON-RPC response.
 * @returns The tool's text content and error flag.
 */
export function decodeToolResult(result: unknown): {
  isError: boolean;
  text: string[];
} {
  const envelope = (result ?? {}) as CallToolEnvelope;

  return {
    isError: envelope.isError === true,
    text: (envelope.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string),
  };
}

/** Extract the `Mcp-Session-Id` header value, if present. */
export function readSessionId(headers: Headers): string | undefined {
  const value = headers.get('mcp-session-id');
  return value === null || value === '' ? undefined : value;
}
