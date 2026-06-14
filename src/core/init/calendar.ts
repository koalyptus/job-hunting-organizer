import { select, isCancel } from '@clack/prompts';
import { getConfigValue } from '../config.js';
import type { GlobalConfig } from '../types.js';
import { DEFAULT_CALENDAR_PROVIDER } from './constants.js';
import { InitCancelled } from './errors.js';

/** Supported calendar provider keys. */
export type CalendarProvider = 'ics' | 'outlook' | 'none';

/**
 * Prompt for calendar provider selection.
 * Returns the provider key ('ics', 'outlook', or 'none').
 * @throws {InitCancelled} if the user cancels the prompt.
 */
export async function promptCalendar(
  nonInteractive: boolean,
  existingConfig: GlobalConfig | null,
): Promise<CalendarProvider> {
  const defaultProvider = getConfigValue(
    existingConfig?.calendar?.defaultProvider,
    undefined,
    DEFAULT_CALENDAR_PROVIDER,
  ) as CalendarProvider;

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
    throw new InitCancelled();
  }

  return selected;
}
