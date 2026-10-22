import { useCallback, useEffect, useState } from 'react';
import type { ApplicationEntry, CampaignSummary } from '@/src/mcp/types';
import type { BridgeRequest, BridgeResponse } from '@/src/bridge/messages';

/** Bridge reachability plus the active campaign. */
export interface BridgeStatus {
  ok: boolean;
  url: string;
  campaign: string;
  error?: string;
}

/** Popup state and the actions that mutate it. */
export interface BridgeState {
  status: BridgeStatus;
  campaigns: CampaignSummary[];
  entries: ApplicationEntry[];
  loading: boolean;
  refresh: () => Promise<void>;
  pickCampaign: (campaign: string) => Promise<void>;
  saveBridgeUrl: (url: string) => Promise<void>;
}

/**
 * Send a message to the background worker and narrow the reply.
 *
 * @param request - Message to send.
 * @returns The decoded response, or `undefined` if the worker did not reply.
 */
async function send(request: BridgeRequest): Promise<BridgeResponse | undefined> {
  const response: unknown = await browser.runtime.sendMessage(request);

  return typeof response === 'object' && response !== null
    ? (response as BridgeResponse)
    : undefined;
}

/**
 * Popup state hook: bridge status, campaign list and the selected campaign's
 * applications, all sourced from the background worker.
 *
 * @returns The current state and the actions that refresh it.
 */
export function useBridge(): BridgeState {
  const [status, setStatus] = useState<BridgeStatus>({
    ok: false,
    url: '',
    campaign: 'default',
  });
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [entries, setEntries] = useState<ApplicationEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);

    const statusResponse = await send({ type: 'bridge/status' });
    const nextStatus: BridgeStatus = {
      ok: statusResponse?.type === 'bridge/status' ? statusResponse.ok : false,
      url: statusResponse?.type === 'bridge/status' ? statusResponse.url : '',
      campaign: statusResponse?.type === 'bridge/status' ? statusResponse.campaign : 'default',
      error: statusResponse?.type === 'bridge/status' ? statusResponse.error : 'no response',
    };
    setStatus(nextStatus);

    const campaignsResponse = await send({ type: 'bridge/campaigns' });
    const names = new Set<string>();

    if (campaignsResponse?.type === 'bridge/campaigns' && campaignsResponse.ok) {
      setCampaigns(
        campaignsResponse.campaigns
          .map((row) => row as CampaignSummary)
          .filter((row) => typeof row.name === 'string'),
      );
      for (const row of campaignsResponse.campaigns as CampaignSummary[]) {
        if (typeof row.name === 'string') {
          names.add(row.name);
        }
      }
    } else {
      setCampaigns([]);
    }

    const campaign = names.has(nextStatus.campaign) ? nextStatus.campaign : 'default';
    if (campaign !== nextStatus.campaign) {
      setStatus({ ...nextStatus, campaign });
    }

    const applicationsResponse = await send({
      type: 'bridge/applications',
      campaign,
    });

    setEntries(
      applicationsResponse?.type === 'bridge/applications' && applicationsResponse.ok
        ? (applicationsResponse.entries as ApplicationEntry[])
        : [],
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pickCampaign = useCallback(
    async (campaign: string) => {
      setStatus((prev) => ({ ...prev, campaign }));
      await browser.storage.local.set({ campaign });

      const response = await send({ type: 'bridge/applications', campaign });
      setEntries(
        response?.type === 'bridge/applications' && response.ok
          ? (response.entries as ApplicationEntry[])
          : [],
      );
    },
    [],
  );

  const saveBridgeUrl = useCallback(
    async (url: string) => {
      await send({ type: 'bridge/setBridgeUrl', url });
      await refresh();
    },
    [refresh],
  );

  return { status, campaigns, entries, loading, refresh, pickCampaign, saveBridgeUrl };
}
