import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';

/**
 * Create a real in-process MCP client/server pair wired together over
 * {@link InMemoryTransport.createLinkedPair}.
 *
 * This replaces the old `fakeServer()` test doubles: tool/resource/prompt
 * handlers now run through the actual MCP protocol (schema validation,
 * request/response serialization) instead of being invoked directly.
 *
 * @param register - Optional callback to register tools, resources, or prompts
 *   on the server. Must run before {@link McpServer.connect} — the v2 SDK
 *   rejects capability registration after the transport is connected.
 * @returns The connected client and the underlying server.
 */
export async function createTestServer(
  register?: (server: McpServer) => void,
): Promise<{ client: Client; server: McpServer }> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = new McpServer({ name: 'test-server', version: '1.0.0' });
  register?.(server);
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);
  return { client, server };
}
