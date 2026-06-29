import chalk from 'chalk';

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
  chalk.level = noColor ? 0 : 3;
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
