import {
  buildNotification,
  buildRequest,
  decodeJsonRpcMessage,
  decodeToolResult,
  readSessionId,
  type JsonRpcError,
} from './protocol';
import type { ToolResult } from './types';

/** Minimal `fetch` shape, so tests can inject a stub. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  status: number;
  headers: Headers;
  text: () => Promise<string>;
}>;

/** Options for {@link McpBridgeClient}. */
export interface McpBridgeOptions {
  /** Streamable HTTP endpoint, e.g. `http://127.0.0.1:7331/mcp`. */
  url: string;
  /** Fetch implementation (defaults to global `fetch`). */
  fetch?: FetchLike;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
}

/** Raised when the bridge returns a non-2xx status. */
export class McpHttpError extends Error {
  /** HTTP status code returned by the bridge. */
  readonly status: number;

  /**
   * @param status - HTTP status code.
   * @param message - Human-readable description.
   */
  constructor(status: number, message: string) {
    super(message);
    this.name = 'McpHttpError';
    this.status = status;
  }
}

/**
 * MCP protocol version this client speaks.
 *
 * Transcribed from `LATEST_PROTOCOL_VERSION` in `@modelcontextprotocol/core`
 * (the transport the bridge's server side uses), not chosen by hand. The server
 * may negotiate an older version from `SUPPORTED_PROTOCOL_VERSIONS`
 * (`2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`, `2024-10-07`).
 */
const PROTOCOL_VERSION = '2025-11-25';

/**
 * Minimal MCP client for the jho Streamable HTTP bridge (`jho mcp --http`).
 *
 * Speaks just enough of the protocol for the extension's use case:
 * `initialize` → `notifications/initialized` → `tools/list` / `tools/call`.
 * The session id returned by `initialize` is echoed on every later request.
 *
 * Deliberately hand-rolled rather than pulling in `@modelcontextprotocol/sdk`:
 * the SDK is ~7 MB of Node-oriented code (`eventsource`, `jose`, OAuth) for a
 * client that only ever calls tools, and #112 is explicit that bundle size
 * matters. Swap to the SDK here if the protocol surface grows.
 */
export class McpBridgeClient {
  private readonly url: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private nextId = 1;
  private sessionId?: string;

  /**
   * @param options - Endpoint and optional fetch/timeout overrides.
   */
  constructor(options: McpBridgeOptions) {
    this.url = options.url;
    this.fetchImpl = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  /** The negotiated session id, once {@link initialize} has succeeded. */
  get session(): string | undefined {
    return this.sessionId;
  }

  /**
   * Perform the MCP `initialize` handshake and record the session id.
   *
   * @throws {McpHttpError} When the bridge responds with a non-2xx status.
   */
  async initialize(): Promise<void> {
    const result = await this.request('initialize', {
      // LATEST_PROTOCOL_VERSION from @modelcontextprotocol/core, which is what
      // the bridge's server transport speaks. Not a value picked by hand.
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'jho-browser-extension', version: '0.1.0' },
    });

    if (result.error) {
      throw new McpHttpError(-1, `initialize failed: ${describeError(result.error)}`);
    }

    // `notifications/initialized` has no `id`; the server must not reply.
    await this.notify('notifications/initialized');
  }

  /**
   * List the tool names the bridge exposes.
   *
   * @returns Tool names, in server order.
   */
  async listTools(): Promise<string[]> {
    const result = await this.request('tools/list', {});

    if (result.error) {
      throw new McpHttpError(-1, `tools/list failed: ${describeError(result.error)}`);
    }

    const tools = (result.result as { tools?: Array<{ name?: string }> })?.tools ?? [];

    return tools.flatMap((tool) => (typeof tool.name === 'string' ? [tool.name] : []));
  }

  /**
   * Invoke a tool by name.
   *
   * @param name - Tool name, e.g. `list_applications`.
   * @param args - Tool arguments.
   * @returns The decoded text content and error flag.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const result = await this.request('tools/call', { name, arguments: args });

    if (result.error) {
      throw new McpHttpError(-1, `tools/call failed: ${describeError(result.error)}`);
    }

    return decodeToolResult(result.result);
  }

  private async request(
    method: string,
    params: Record<string, unknown>,
  ): Promise<{ result?: unknown; error?: JsonRpcError }> {
    const id = this.nextId++;
    const response = await this.post(buildRequest(id, method, params));
    const message = decodeJsonRpcMessage(response.contentType, response.body);

    if (message === null) {
      throw new McpHttpError(-1, `${method}: no JSON-RPC message in response`);
    }

    return { result: message.result, error: message.error };
  }

  private async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    await this.post(buildNotification(method, params));
  }

  private async post(payload: unknown): Promise<{ contentType: string; body: string }> {
    return this.rawFetch(JSON.stringify(payload));
  }

  private async rawFetch(body: string): Promise<{ contentType: string; body: string }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // Streamable HTTP requires the client to accept both content types.
      Accept: 'application/json, text/event-stream',
    };

    if (this.sessionId !== undefined) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Awaited<ReturnType<FetchLike>>;

    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status < 200 || response.status >= 300) {
      throw new McpHttpError(response.status, `HTTP ${response.status} from MCP bridge`);
    }

    const contentType = response.headers.get('content-type') ?? 'application/json';

    // The session id is assigned by the initialize response and must be echoed
    // on every later request.
    this.sessionId ??= readSessionId(response.headers);

    return { contentType, body: await response.text() };
  }
}

/** Render a JSON-RPC error for a thrown message. */
function describeError(error: JsonRpcError): string {
  return error.data === undefined ? error.message : `${error.message} (${JSON.stringify(error.data)})`;
}
