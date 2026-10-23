import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import type { CampaignSummary } from '@/src/mcp/types';

/** Props for {@link CampaignPicker}. */
interface CampaignPickerProps {
  /** Campaigns available on the bridge. */
  campaigns: CampaignSummary[];
  /** The active campaign. */
  campaign: string;
  /** Called when the user picks a different campaign. */
  onPick: (campaign: string) => void;
}

/**
 * Campaign selector, falling back to a plain label when the bridge is offline.
 *
 * @param props - Component props.
 * @returns The campaign picker UI.
 */
export function CampaignPicker({ campaigns, campaign, onPick }: CampaignPickerProps) {
  if (campaigns.length === 0) {
    return (
      <Label className="text-muted-foreground font-normal">
        Campaign: <span className="font-medium text-foreground">{campaign}</span>
      </Label>
    );
  }

  return (
    <Label className="flex items-center gap-2">
      <span>Campaign</span>
      <select
        className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
        value={campaign}
        onChange={(event) => onPick(event.target.value)}
      >
        {campaigns.map((item) => (
          <option key={item.name} value={item.name}>
            {item.name}
          </option>
        ))}
      </select>
    </Label>
  );
}

/** Props for {@link BridgeUrlField}. */
interface BridgeUrlFieldProps {
  /** The current bridge URL. */
  url: string;
  /** Called with the new URL when the user saves it. */
  onSave: (url: string) => void;
}

/**
 * Editable bridge endpoint, persisted via the background worker.
 *
 * @param props - Component props.
 * @returns The bridge URL field.
 */
export function BridgeUrlField({ url, onSave }: BridgeUrlFieldProps) {
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const field = event.currentTarget.elements.namedItem('bridgeUrl');
        if (field instanceof HTMLInputElement) {
          onSave(field.value);
        }
      }}
    >
      <Label className="flex flex-1 flex-col gap-1">
        <span>MCP bridge URL</span>
        <Input id="bridgeUrl" name="bridgeUrl" defaultValue={url} placeholder="http://127.0.0.1:7331/mcp" />
      </Label>
      <Button type="submit" size="sm">
        Save
      </Button>
    </form>
  );
}
