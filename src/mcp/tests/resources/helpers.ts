import type {
  McpServer,
  ReadResourceResult,
  ReadResourceTemplateCallback,
  ResourceContents,
  Variables,
} from '@modelcontextprotocol/server';
import { createTestServer } from '../helpers.js';

export { createTestServer } from '../helpers.js';

/**
 * Extracts the text from a resource content item, throwing if the content is
 * binary (blob) rather than text. Resource tests assert on the JSON text body
 * of each resource.
 *
 * @param content - the resource content item to read
 * @returns the text content of the item
 */
export function resourceText(content: ResourceContents): string {
  const text = (content as { text?: unknown }).text;
  if (typeof text !== 'string') {
    throw new Error('expected text resource content');
  }
  return text;
}

/**
 * Invokes a captured resource read callback with the given URI and variables,
 * returning a full {@link ReadResourceResult}. Used to exercise defensive
 * branches (array/empty variables) that the protocol never triggers.
 *
 * @param readCallback - the captured read callback
 * @param uri - the resource URI to pass to the callback
 * @param variables - the template variables to pass to the callback
 * @returns the handler result as a {@link ReadResourceResult}
 */
export async function invokeResourceRead(
  readCallback: ReadResourceTemplateCallback,
  uri: string,
  variables: Variables,
): Promise<ReadResourceResult> {
  return (await readCallback(new URL(uri), variables, {} as never)) as ReadResourceResult;
}

/**
 * Registers resources on a real in-process server and captures each registered
 * read callback. Protocol tests go through `client.readResource`, but resource
 * handlers keep defensive guards (array/empty variables) that the protocol can
 * never trigger with single-segment templates — those branches are exercised
 * directly through the captured callbacks.
 *
 * @param register - callback that registers resources on the server
 * @returns the connected client plus the captured read callbacks, in registration order
 */
export async function createTestServerAndCapture(register: (server: McpServer) => void): Promise<{
  client: Awaited<ReturnType<typeof createTestServer>>['client'];
  readCallbacks: ReadResourceTemplateCallback[];
}> {
  const readCallbacks: ReadResourceTemplateCallback[] = [];

  const { client } = await createTestServer((srv) => {
    const originalRegisterResource = srv.registerResource.bind(srv);
    srv.registerResource = ((...args: Parameters<typeof srv.registerResource>) => {
      const registered = originalRegisterResource(...args);
      const callback = (registered as { readCallback?: ReadResourceTemplateCallback }).readCallback;
      if (callback) {
        readCallbacks.push(callback);
      }
      return registered;
    }) as typeof srv.registerResource;
    register(srv);
  });

  return { client, readCallbacks };
}
