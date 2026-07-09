import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as clack from '@clack/prompts';
import * as pathsModule from '../paths.js';
import type * as PathsModule from '../paths.js';

vi.mock('@clack/prompts', () => ({
  select: vi.fn(),
  isCancel: vi.fn(() => false),
  log: { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock listCampaigns so the picker never touches the filesystem.
vi.mock('../paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof PathsModule>();
  return {
    ...actual,
    listCampaigns: vi.fn(),
  };
});

import { resolveCampaignInteractive, CampaignPickerCancelled } from '../campaign.js';

describe('resolveCampaignInteractive', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns the explicit name without prompting', async () => {
    const result = await resolveCampaignInteractive('freelance');
    expect(result).toBe('freelance');
    expect(pathsModule.listCampaigns).not.toHaveBeenCalled();
    expect(clack.select).not.toHaveBeenCalled();
  });

  it('auto-selects the sole campaign without prompting', async () => {
    vi.mocked(pathsModule.listCampaigns).mockResolvedValue([{ name: 'solo', applicationCount: 3 }]);
    const result = await resolveCampaignInteractive(undefined, { tty: true });
    expect(result).toBe('solo');
    expect(clack.select).not.toHaveBeenCalled();
  });

  it('prompts when more than one campaign exists and on a TTY', async () => {
    vi.mocked(pathsModule.listCampaigns).mockResolvedValue([
      { name: 'default', applicationCount: 1 },
      { name: 'freelance', applicationCount: 4 },
    ]);
    vi.mocked(clack.select).mockResolvedValue('freelance');

    const result = await resolveCampaignInteractive(undefined, { tty: true });

    expect(result).toBe('freelance');
    expect(clack.select).toHaveBeenCalledOnce();
    const options = vi.mocked(clack.select).mock.calls[0]![0].options as Array<{
      value: string;
      hint?: string;
    }>;
    expect(options[0]).toMatchObject({ value: 'default', hint: '1 app' });
    expect(options[1]).toMatchObject({ value: 'freelance', hint: '4 apps' });
  });

  it('falls back to default under --yes even with multiple campaigns', async () => {
    vi.mocked(pathsModule.listCampaigns).mockResolvedValue([
      { name: 'default', applicationCount: 1 },
      { name: 'freelance', applicationCount: 4 },
    ]);
    const result = await resolveCampaignInteractive(undefined, { yes: true });
    expect(result).toBe('default');
    expect(clack.select).not.toHaveBeenCalled();
  });

  it('falls back to default when not a TTY even with multiple campaigns', async () => {
    vi.mocked(pathsModule.listCampaigns).mockResolvedValue([
      { name: 'default', applicationCount: 1 },
      { name: 'freelance', applicationCount: 4 },
    ]);
    const result = await resolveCampaignInteractive(undefined, { tty: false });
    expect(result).toBe('default');
    expect(clack.select).not.toHaveBeenCalled();
  });

  it('throws CampaignPickerCancelled when the prompt is cancelled', async () => {
    vi.mocked(pathsModule.listCampaigns).mockResolvedValue([
      { name: 'default', applicationCount: 1 },
      { name: 'freelance', applicationCount: 4 },
    ]);
    vi.mocked(clack.select).mockResolvedValue('x');
    vi.mocked(clack.isCancel).mockReturnValue(true);

    await expect(resolveCampaignInteractive(undefined, { tty: true })).rejects.toBeInstanceOf(
      CampaignPickerCancelled,
    );
  });
});
