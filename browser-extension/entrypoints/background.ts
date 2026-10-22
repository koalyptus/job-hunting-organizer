import { McpBridgeClient } from '@/src/mcp/client';
import type { BridgeRequest, BridgeResponse } from '@/src/bridge/messages';
import {
  getBridgeUrl,
  getCampaign,
  setBridgeUrl,
  setCampaign,
} from '@/src/bridge/settings';

/**
 * Background service worker: owns the MCP bridge session and answers the popup
 * and content scripts.
 *
 * The extension never touches the campaign filesystem — every read and write
 * goes to `jho mcp --http` as an MCP tool call, so the CLI/MCP writers (locks,
 * toolhash, atomic writes) stay the single source of truth. See spike #104 and
 * the #113 location decision.
 */

/** One live MCP client per bridge URL; rebuilt when the configured URL changes. */
let client: McpBridgeClient | undefined;
let clientUrl: string | undefined;

/**
 * Return a connected client for the configured bridge URL, connecting on first
 * use and reconnecting if the URL changed.
 *
 * @returns A ready-to-use MCP client.
 */
async function getClient(): Promise<McpBridgeClient> {
  const url = await getBridgeUrl();

  if (client === undefined || clientUrl !== url) {
    void client?.close();
    const next = new McpBridgeClient({ url });
    // Only cache the client once the handshake succeeds, so a failed
    // initialize() is retried on the next message instead of reusing a
    // half-open session.
    await next.initialize();
    client = next;
    clientUrl = url;
  }

  return client;
}

/**
 * Call a tool and flatten its text content into a single string.
 *
 * @param mcp - Connected client.
 * @param name - Tool name.
 * @param args - Tool arguments.
 * @returns The concatenated text content.
 */
async function callToolText(
  mcp: McpBridgeClient,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await mcp.callTool(name, args);
  if (result.isError) {
    throw new Error(result.text.join('\n') || `${name} failed`);
  }

  return result.text.join('\n');
}

/**
 * Parse the JSON payload a jho tool returns inside its text content block.
 *
 * @param text - Concatenated text content.
 * @returns The decoded payload, or `undefined` when there is none.
 */
function parsePayload(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Handle one message from the popup or a content script.
 *
 * @param request - The incoming message.
 * @returns The response to send back.
 */
async function handleMessage(request: BridgeRequest): Promise<BridgeResponse> {
  switch (request.type) {
    case 'bridge/status': {
      try {
        const mcp = await getClient();
        await mcp.listTools();

        return {
          type: 'bridge/status',
          ok: true,
          url: await getBridgeUrl(),
          campaign: await getCampaign(),
        };
      } catch (err) {
        return {
          type: 'bridge/status',
          ok: false,
          url: await getBridgeUrl(),
          campaign: await getCampaign(),
          error: errorMessage(err),
        };
      }
    }

    case 'bridge/campaigns': {
      try {
        const text = await callToolText(await getClient(), 'list_campaigns', {});

        return { type: 'bridge/campaigns', ok: true, campaigns: asArray(parsePayload(text)) };
      } catch (err) {
        return { type: 'bridge/campaigns', ok: false, error: errorMessage(err) };
      }
    }

    case 'bridge/applications': {
      try {
        const text = await callToolText(await getClient(), 'list_applications', {
          campaign: request.campaign,
        });

        return {
          type: 'bridge/applications',
          ok: true,
          entries: asArray(parsePayload(text)),
        };
      } catch (err) {
        return { type: 'bridge/applications', ok: false, error: errorMessage(err) };
      }
    }

    case 'bridge/track': {
      try {
        const text = await callToolText(await getClient(), 'track_application', {
          campaign: request.campaign,
          url: request.url,
        });

        return { type: 'bridge/track', ok: true, slug: extractSlug(text) };
      } catch (err) {
        return { type: 'bridge/track', ok: false, error: errorMessage(err) };
      }
    }

    case 'bridge/extract': {
      try {
        const mcp = await getClient();
        const result = await mcp.callTool('extract_jd', {
          campaign: request.campaign,
          url: request.url,
        });

        if (result.isError) {
          return {
            type: 'bridge/extract',
            ok: false,
            error: result.text.join('\n') || 'extract_jd failed',
          };
        }

        return { type: 'bridge/extract', ok: true, result };
      } catch (err) {
        return { type: 'bridge/extract', ok: false, error: errorMessage(err) };
      }
    }

    case 'bridge/setBridgeUrl': {
      await setBridgeUrl(request.url);
      client = undefined;
      clientUrl = undefined;

      return { type: 'bridge/setting', ok: true };
    }

    case 'bridge/setCampaign': {
      await setCampaign(request.campaign);

      return { type: 'bridge/setting', ok: true };
    }
  }
}

/**
 * Coerce a decoded tool payload into an array of rows.
 *
 * `list_applications` returns `{ entries: [...] }`; `list_campaigns` returns a
 * bare array.
 *
 * @param payload - Decoded JSON payload.
 * @returns The row array (empty when the payload has none).
 */
function asArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const entries = (payload as { entries?: unknown[] } | undefined)?.entries;

  return Array.isArray(entries) ? entries : [];
}

/** Pull the application slug out of a `track_application` payload. */
function extractSlug(text: string): string {
  const payload = parsePayload(text) as { slug?: unknown } | undefined;

  return typeof payload?.slug === 'string' ? payload.slug : '';
}

/** Render an unknown thrown value as a message. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message) => {
    return handleMessage(message as BridgeRequest) as Promise<BridgeResponse>;
  });
});
