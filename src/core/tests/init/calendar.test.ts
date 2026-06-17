import { describe, expect, it, vi, beforeEach } from 'vitest';
import { select } from '@clack/prompts';
import { promptCalendar } from '../../init/calendar.js';
import type { GlobalConfig } from '../../types.js';

vi.mock('@clack/prompts', () => ({
  select: vi.fn(),
  isCancel: vi.fn(() => false),
  log: {
    info: vi.fn(),
  },
}));

describe('promptCalendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns default provider in non-interactive mode', async () => {
    const result = await promptCalendar(true, null);
    expect(result).toBe('ics');
  });

  it('returns existing config provider in non-interactive mode', async () => {
    const result = await promptCalendar(true, {
      calendar: { defaultProvider: 'outlook' },
    } as GlobalConfig);
    expect(result).toBe('outlook');
  });

  it('prompts for provider in interactive mode', async () => {
    vi.mocked(select).mockResolvedValue('none');

    const result = await promptCalendar(false, null);

    expect(result).toBe('none');
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ message: 'Calendar provider?' }));
  });

  it('pre-fills from existing config', async () => {
    vi.mocked(select).mockResolvedValue('outlook');

    await promptCalendar(false, {
      calendar: { defaultProvider: 'outlook' },
    } as GlobalConfig);

    expect(select).toHaveBeenCalledWith(expect.objectContaining({ initialValue: 'outlook' }));
  });

  it('offers ics, outlook, and none options', async () => {
    vi.mocked(select).mockResolvedValue('ics');

    await promptCalendar(false, null);

    const call = vi.mocked(select).mock.calls[0]?.[0] as { options: Array<{ value: string }> };
    expect(call.options).toHaveLength(3);
    expect(call.options.map((o) => o.value)).toEqual(['ics', 'outlook', 'none']);
  });
});
