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

  const whenSlug = when.replace(/[:\s]/g, '-');
  const typeSlug = type.replace(/\s+/g, '-');
  const uid = `interview-${index}-${whenSlug}-${typeSlug}@jho`;

  // Compute end = start + duration in floating local time
  const startDate = new Date(start[0], start[1] - 1, start[2], start[3], start[4]);
  startDate.setMinutes(startDate.getMinutes() + duration);
  const end: [number, number, number, number, number] = [
    startDate.getFullYear(),
    startDate.getMonth() + 1,
    startDate.getDate(),
    startDate.getHours(),
    startDate.getMinutes(),
  ];

  const { error, value } = createEvent({
    start,
    end,
    title: eventTitle,
    description: `Interview type: ${type}`,
    location: location || undefined,
    status: 'CONFIRMED',
    busyStatus: 'BUSY',
    uid,
    productId: '-//jho//interview//EN',
    method: undefined,
    startOutputType: 'local',
  });

  if (error) {
    throw new Error(`Failed to create ICS event: ${error}`);
  }

  if (!value) {
    throw new Error('Failed to create ICS event: no value returned');
  }

  // Create filename: interview-{index}-{datetime}-{type}.ics (index guarantees uniqueness)
  const filename = `interview-${index}-${whenSlug}-${typeSlug}.ics`;
  const filePath = join(appFolder, filename);

  await writeFile(filePath, value, 'utf8');
  return filePath;
}
