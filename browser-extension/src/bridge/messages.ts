/** Message sent from the popup or content script to the background worker. */
export type BridgeRequest =
  | { type: 'bridge/status' }
  | { type: 'bridge/campaigns' }
  | { type: 'bridge/applications'; campaign: string }
  | { type: 'bridge/track'; campaign: string; url: string }
  | { type: 'bridge/setBridgeUrl'; url: string }
  | { type: 'bridge/setCampaign'; campaign: string };

/** Message returned by the background worker. */
export type BridgeResponse =
  | { type: 'bridge/status'; ok: boolean; url: string; campaign: string; error?: string }
  | { type: 'bridge/campaigns'; ok: true; campaigns: unknown[] }
  | { type: 'bridge/campaigns'; ok: false; error: string }
  | { type: 'bridge/applications'; ok: true; entries: unknown[] }
  | { type: 'bridge/applications'; ok: false; error: string }
  | { type: 'bridge/track'; ok: true; slug: string }
  | { type: 'bridge/track'; ok: false; error: string }
  | { type: 'bridge/setting'; ok: true };
