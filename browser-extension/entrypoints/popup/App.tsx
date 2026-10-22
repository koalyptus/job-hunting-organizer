import { useCallback, useEffect, useState } from 'react';
import { useBridge } from '@/src/hooks/useBridge';
import { ApplicationList } from '@/src/components/ApplicationList';
import { BridgeUrlField, CampaignPicker } from '@/src/components/CampaignPicker';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Separator } from '@/src/components/ui/separator';
import { DEFAULT_BRIDGE_URL } from '@/src/bridge/settings';

/**
 * Extension popup: bridge status, campaign picker and the campaign's
 * applications, all read through the background worker's MCP session.
 *
 * @returns The popup UI.
 */
function App() {
  const { status, campaigns, entries, loading, refresh, pickCampaign, saveBridgeUrl } =
    useBridge();
  const [url, setUrl] = useState(DEFAULT_BRIDGE_URL);

  useEffect(() => {
    setUrl(status.url === '' ? DEFAULT_BRIDGE_URL : status.url);
  }, [status.url]);

  const onSave = useCallback(
    async (next: string) => {
      setUrl(next);
      await saveBridgeUrl(next);
    },
    [saveBridgeUrl],
  );

  return (
    <div className="bg-background text-foreground min-w-80 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>JHO</span>
            <Badge variant={status.ok ? 'default' : 'outline'}>
              {status.ok ? 'Bridge connected' : 'Bridge offline'}
            </Badge>
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {status.error === undefined ? null : (
            <p className="text-destructive text-xs">{status.error}</p>
          )}

          <CampaignPicker
            campaigns={campaigns}
            campaign={status.campaign}
            onPick={pickCampaign}
          />

          <Separator />

          <BridgeUrlField url={url} onSave={onSave} />

          <Separator />

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">
              {entries.length} application{entries.length === 1 ? '' : 's'}
            </span>
            <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>

          <ApplicationList entries={entries} loading={loading} />
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
