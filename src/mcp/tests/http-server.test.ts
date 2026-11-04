import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Server } from 'node:http';
import { createServer } from '../server.js';
import { createHttpTransport, startHttpServer } from '../http-server.js';
import { registerTools } from '../tools.js';
import { registerResources } from '../resources/index.js';
import { registerPrompts } from '../prompts/index.js';
import { createStore } from '../../storage/index.js';

/**
 * Start a real MCP server with the Streamable HTTP transport on an
 * ephemeral port and connect a v2 client to it.
 *
 * @returns The connected client, the HTTP server handle, and the port.
 */
async function startTestHttpServer(): Promise<{ client: Client; server: Server; port: number }> {
  const transport = createHttpTransport();
  const server = createServer();
  registerTools(server, createStore());
  registerResources(server);
  registerPrompts(server);
  await server.connect(transport);

  const httpServer = await startHttpServer(transport, 0);
  const addr = httpServer.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Expected port address');
  }

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://localhost:${addr.port}/`)),
  );

  return { client, server: httpServer, port: addr.port };
}

describe('MCP Streamable HTTP transport', () => {
  let client: Client;
  let httpServer: Server;
  let port: number;

  beforeAll(async () => {
    const started = await startTestHttpServer();
    client = started.client;
    httpServer = started.server;
    port = started.port;
  }, 15_000);

  afterAll(async () => {
    await client.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('lists all tools over HTTP', async () => {
    const result = await client.listTools();
    expect(result.tools.length).toBeGreaterThanOrEqual(37);
    const names = result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('list_applications');
    expect(names).toContain('track_application');
    expect(names).toContain('extract_jd');
  }, 15_000);

  it('calls a read-only tool over HTTP', async () => {
    const result = await client.callTool({
      name: 'list_campaigns',
      arguments: {},
    });
    const data = JSON.parse((result.content as Array<{ type: string; text: string }>)[0]!.text);
    expect(Array.isArray(data.campaigns)).toBe(true);
  }, 15_000);

  it('responds to CORS preflight with 204', async () => {
    const resp = await fetch(`http://localhost:${port}/`, {
      method: 'OPTIONS',
    });
    expect(resp.status).toBe(204);
    expect(resp.headers.get('access-control-allow-origin')).toBe('*');
    expect(resp.headers.get('access-control-allow-methods')).toContain('POST');
  }, 15_000);
});
