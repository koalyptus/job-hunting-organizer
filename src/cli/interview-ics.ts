import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createEvent } from 'ics';
import { parseDatetime } from '../core/date.js';

/**
 * Interview details shared between the wizard and flag-based flows.
 */
export interface InterviewDetails {
  when: string;
  type: string;
  duration: number;
  interviewer?: string;
  location?: string;
  title?: string;
}

/**
 * Generate an ICS file for the interview.
 * @returns The absolute path to the written ICS file.
 */
export async function generateIcsFile(
  appFolder: string,
  index: number,
  when: string,
  type: string,
  duration: number,
  title?: string,
  location?: string,
): Promise<string> {
  const start = parseDatetime(when);
  const eventTitle = title || `Interview #${index} (${type})`;

  const { error, value } = createEvent({
    start,
    duration: { minutes: duration },
    title: eventTitle,
    description: `Interview type: ${type}`,
    location: location || undefined,
    status: 'CONFIRMED',
    busyStatus: 'BUSY',
  });

  if (error) {
    throw new Error(`Failed to create ICS event: ${error}`);
  }

  if (!value) {
    throw new Error('Failed to create ICS event: no value returned');
  }

  // Create filename: interview-{index}-{datetime}-{type}.ics (index guarantees uniqueness)
  const whenSlug = when.replace(/[:\s]/g, '-');
  const typeSlug = type.replace(/\s+/g, '-');
  const filename = `interview-${index}-${whenSlug}-${typeSlug}.ics`;
  const filePath = join(appFolder, filename);

  await writeFile(filePath, value, 'utf8');
  return filePath;
}
