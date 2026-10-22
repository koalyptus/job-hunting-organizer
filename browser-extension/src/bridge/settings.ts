/**
 * Extension-side settings, persisted in `browser.storage.local`.
 *
 * The bridge URL defaults to the port `jho mcp --http` binds
 * (`DEFAULT_HTTP_PORT` = 7331, see `docs/mcp-http-transport.md`). It is
 * overridable in the popup because the transport is dev-only and the port may
 * be changed with `--port`.
 */

/** Default Streamable HTTP endpoint of the local jho MCP bridge. */
export const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:7331/mcp';

/** Campaign used when the user has not picked one. */
export const DEFAULT_CAMPAIGN = 'default';

const BRIDGE_URL_KEY = 'bridgeUrl';
const CAMPAIGN_KEY = 'campaign';

/**
 * Read the configured bridge URL, falling back to {@link DEFAULT_BRIDGE_URL}.
 *
 * @returns The Streamable HTTP endpoint to call.
 */
export async function getBridgeUrl(): Promise<string> {
  const stored = await browser.storage.local.get(BRIDGE_URL_KEY);
  const value = stored[BRIDGE_URL_KEY];

  return typeof value === 'string' && value !== '' ? value : DEFAULT_BRIDGE_URL;
}

/**
 * Persist the bridge URL.
 *
 * @param url - Streamable HTTP endpoint to call.
 */
export async function setBridgeUrl(url: string): Promise<void> {
  await browser.storage.local.set({ [BRIDGE_URL_KEY]: url });
}

/**
 * Read the active campaign, falling back to {@link DEFAULT_CAMPAIGN}.
 *
 * @returns The campaign name.
 */
export async function getCampaign(): Promise<string> {
  const stored = await browser.storage.local.get(CAMPAIGN_KEY);
  const value = stored[CAMPAIGN_KEY];

  return typeof value === 'string' && value !== '' ? value : DEFAULT_CAMPAIGN;
}

/**
 * Persist the active campaign.
 *
 * @param campaign - Campaign name.
 */
export async function setCampaign(campaign: string): Promise<void> {
  await browser.storage.local.set({ [CAMPAIGN_KEY]: campaign });
}
