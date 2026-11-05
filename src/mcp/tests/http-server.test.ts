import { describe, it, expect, afterAll, beforeAll, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Server } from 'node:http';
import { request as httpRequest } from 'node:http';
import { createServer } from '../server.js';
import {
  createHttpTransport,
  startHttpServer,
  resolveHttpHost,
  DEFAULT_HTTP_HOST,
  HTTP_HOST_ENV_VAR,
} from '../http-server.js';
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
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${addr.port}/`)),
  );

  return { client, server: httpServer, port: addr.port };
}

/**
 * Send a raw HTTP request so the test controls the `Host` and `Origin`
 * headers exactly (undici normalises both).
 *
 * @param port - The port the test server listens on.
 * @param method - The HTTP method to send.
 * @param headers - Extra headers to send.
 * @returns The response status code and headers.
 */
function rawRequest(
  port: number,
  method: string,
  headers: Record<string, string>,
): Promise<{ status: number; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path: '/', method, headers }, (res) => {
      res.resume();
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers as Record<string, string> });
      });
    });
    req.on('error', reject);
    req.end();
  });
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

  it('binds loopback by default', () => {
    const addr = httpServer.address();
    expect(addr && typeof addr !== 'string' && addr.address).toBe(DEFAULT_HTTP_HOST);
  });

  it('responds to a loopback CORS preflight and echoes the origin', async () => {
    const { status, headers } = await rawRequest(port, 'OPTIONS', {
      Origin: 'http://localhost:5173',
    });
    expect(status).toBe(204);
    expect(headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(headers['access-control-allow-methods']).toContain('POST');
  }, 15_000);

  it('withholds CORS headers from untrusted origins', async () => {
    const { status, headers } = await rawRequest(port, 'OPTIONS', {
      Origin: 'https://evil.example.com',
    });
    expect(status).toBe(204);
    expect(headers['access-control-allow-origin']).toBeUndefined();
  }, 15_000);

  it('rejects a Host header that is not loopback (DNS rebinding)', async () => {
    const { status } = await rawRequest(port, 'GET', { Host: 'evil.example.com' });
    expect(status).toBe(403);
  }, 15_000);

  it('accepts a localhost Host header', async () => {
    const { status } = await rawRequest(port, 'GET', { Host: `localhost:${port}` });
    expect(status).not.toBe(403);
  }, 15_000);
});

describe('resolveHttpHost', () => {
  const originalHost = process.env[HTTP_HOST_ENV_VAR];

  afterEach(() => {
    if (originalHost === undefined) {
      delete process.env[HTTP_HOST_ENV_VAR];
    } else {
      process.env[HTTP_HOST_ENV_VAR] = originalHost;
    }
  });

  it('defaults to loopback', () => {
    delete process.env[HTTP_HOST_ENV_VAR];
    expect(resolveHttpHost()).toBe(DEFAULT_HTTP_HOST);
  });

  it('honours the host override', () => {
    process.env[HTTP_HOST_ENV_VAR] = '192.0.2.10';
    expect(resolveHttpHost()).toBe('192.0.2.10');
  });

  it('ignores a blank override', () => {
    process.env[HTTP_HOST_ENV_VAR] = '   ';
    expect(resolveHttpHost()).toBe(DEFAULT_HTTP_HOST);
  });
});
