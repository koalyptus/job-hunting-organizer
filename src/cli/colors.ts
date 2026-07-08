import chalk from 'chalk';
import type { Colorize } from '../core/types.js';

let noColor = false;

export function initColors(cliColor?: boolean, configColor?: boolean): void {
  if (cliColor === false) {
    noColor = true;
  } else if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') {
    noColor = true;
  } else if (configColor === false) {
    noColor = true;
  } else {
    noColor = false;
  }
  if (noColor) {
    chalk.level = 0;
  }
}

export const dim = (text: string): string => (noColor ? text : chalk.dim(text));
export const bold = (text: string): string => (noColor ? text : chalk.bold(text));
export const cyan = (text: string): string => (noColor ? text : chalk.cyan(text));
export const green = (text: string): string => (noColor ? text : chalk.green(text));
export const yellow = (text: string): string => (noColor ? text : chalk.yellow(text));
export const red = (text: string): string => (noColor ? text : chalk.red(text));
export const blue = (text: string): string => (noColor ? text : chalk.blue(text));

/**
 * Apply a colour to an application status string for terminal output.
 * @param s - The status value (e.g. `'interview'`, `'rejected'`).
 * @returns The status wrapped in the appropriate chalk colour.
 */
export function statusColor(s: string): string {
  switch (s) {
    case 'interview':
      return yellow(s);
    case 'offer':
    case 'accepted':
      return green(s);
    case 'rejected':
      return red(s);
    case 'withdrawn':
    case 'abandoned':
    case 'ghosted':
      return dim(s);
    default:
      return s;
  }
}

/**
 * Apply a colour to an interview status string for terminal output.
 * @param s - The interview status value (e.g. `'scheduled'`, `'passed'`).
 * @returns The status wrapped in the appropriate chalk colour.
 */
export function interviewStatusColor(s: string): string {
  switch (s) {
    case 'scheduled':
    case 'pending':
      return cyan(s);
    case 'completed':
    case 'passed':
      return green(s);
    case 'failed':
    case 'no-show':
      return red(s);
    case 'rescheduled':
      return yellow(s);
    default:
      return s;
  }
}

/** Pre-built `Colorize` object using the CLI's colour helpers. */
export const cliColorize: Colorize = { bold, cyan, dim, green, yellow, red, statusColor };
