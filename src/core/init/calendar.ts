import { select, isCancel, log as clackLog } from '@clack/prompts';
import { getConfigValue } from '../config.js';
import type { GlobalConfig } from '../types.js';
import { DEFAULT_CALENDAR_PROVIDER, MSG_CANCELLED } from './constants.js';

/**
 * Prompt for calendar provider selection.
 * Returns the provider key ('ics', 'outlook', or 'none').
 */
export async function promptCalendar(
  nonInteractive: boolean,
  existingConfig: GlobalConfig | null,
): Promise<string> {
  const defaultProvider = getConfigValue(
    existingConfig?.calendar?.defaultProvider,
    undefined,
    DEFAULT_CALENDAR_PROVIDER,
  );

  if (nonInteractive) {
    return defaultProvider;
  }

  const selected = await select({
    message: 'Calendar provider?',
    options: [
      { value: 'ics', label: 'ICS (default, no setup)' },
      { value: 'outlook', label: 'Microsoft Outlook (requires setup)' },
      { value: 'none', label: 'None (skip calendar integration)' },
    ],
    initialValue: defaultProvider,
  });

  if (isCancel(selected)) {
    clackLog.info(MSG_CANCELLED);
    process.exit(0);
  }

  return selected;
}
