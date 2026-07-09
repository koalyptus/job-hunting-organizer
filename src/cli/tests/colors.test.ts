import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import chalk from 'chalk';
import {
  initColors,
  bold,
  cyan,
  dim,
  green,
  red,
  yellow,
  statusColor,
  interviewStatusColor,
  interviewTypeColor,
} from '../colors.js';

const NO_COLOR_SAVED = process.env.NO_COLOR;

const ESC = '\u001b';

function hasAnsi(text: string): boolean {
  return text.includes(`${ESC}[`);
}

describe('initColors', () => {
  beforeEach(() => {
    delete process.env.NO_COLOR;
    chalk.level = 3;
    initColors();
  });

  afterEach(() => {
    if (NO_COLOR_SAVED === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = NO_COLOR_SAVED;
    }
  });

  it('enables color by default', () => {
    chalk.level = 3;
    initColors();
    expect(chalk.level).toBeGreaterThan(0);
    expect(hasAnsi(cyan('text'))).toBe(true);
  });

  it('disables color with cliColor = false', () => {
    initColors(false);
    expect(chalk.level).toBe(0);
    expect(cyan('text')).toBe('text');
  });

  it('disables color with configColor = false', () => {
    initColors(undefined, false);
    expect(chalk.level).toBe(0);
    expect(cyan('text')).toBe('text');
  });

  it('cliColor = false wins over configColor = true', () => {
    initColors(false, true);
    expect(chalk.level).toBe(0);
    expect(cyan('text')).toBe('text');
  });

  it('disables color when NO_COLOR env var is set', () => {
    process.env.NO_COLOR = '1';
    initColors();
    expect(chalk.level).toBe(0);
    expect(cyan('text')).toBe('text');
  });

  it('disables color for any non-empty NO_COLOR', () => {
    process.env.NO_COLOR = '0';
    initColors();
    expect(chalk.level).toBe(0);
  });

  it('ignores empty NO_COLOR env var', () => {
    chalk.level = 3;
    process.env.NO_COLOR = '';
    initColors();
    expect(chalk.level).toBeGreaterThan(0);
  });
});

describe('color functions', () => {
  beforeEach(() => {
    delete process.env.NO_COLOR;
    initColors();
  });

  afterEach(() => {
    if (NO_COLOR_SAVED === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = NO_COLOR_SAVED;
    }
  });

  it('dim wraps text', () => {
    expect(hasAnsi(dim('test'))).toBe(true);
  });

  it('bold wraps text', () => {
    expect(hasAnsi(bold('test'))).toBe(true);
  });

  it('cyan wraps text', () => {
    expect(hasAnsi(cyan('test'))).toBe(true);
  });

  it('green wraps text', () => {
    expect(hasAnsi(green('test'))).toBe(true);
  });

  it('yellow wraps text', () => {
    expect(hasAnsi(yellow('test'))).toBe(true);
  });

  it('red wraps text', () => {
    expect(hasAnsi(red('test'))).toBe(true);
  });

  it('returns plain text when color disabled', () => {
    initColors(false);
    expect(dim('test')).toBe('test');
    expect(bold('test')).toBe('test');
    expect(cyan('test')).toBe('test');
  });
});

describe('statusColor', () => {
  beforeEach(() => {
    delete process.env.NO_COLOR;
    chalk.level = 3;
    initColors();
  });

  it('colors interview status yellow', () => {
    expect(hasAnsi(statusColor('interview'))).toBe(true);
    expect(statusColor('interview')).toContain('interview');
  });

  it('colors offer/accepted status green', () => {
    expect(hasAnsi(statusColor('offer'))).toBe(true);
    expect(hasAnsi(statusColor('accepted'))).toBe(true);
  });

  it('colors rejected status red', () => {
    expect(hasAnsi(statusColor('rejected'))).toBe(true);
  });

  it('colors withdrawn/abandoned/ghosted status dim', () => {
    expect(hasAnsi(statusColor('withdrawn'))).toBe(true);
    expect(hasAnsi(statusColor('abandoned'))).toBe(true);
    expect(hasAnsi(statusColor('ghosted'))).toBe(true);
  });

  it('returns unknown statuses unchanged', () => {
    expect(statusColor('unknown')).toBe('unknown');
  });
});

describe('interviewStatusColor', () => {
  beforeEach(() => {
    delete process.env.NO_COLOR;
    chalk.level = 3;
    initColors();
  });

  it('colors scheduled/pending status cyan', () => {
    expect(hasAnsi(interviewStatusColor('scheduled'))).toBe(true);
    expect(hasAnsi(interviewStatusColor('pending'))).toBe(true);
  });

  it('colors completed/passed status green', () => {
    expect(hasAnsi(interviewStatusColor('completed'))).toBe(true);
    expect(hasAnsi(interviewStatusColor('passed'))).toBe(true);
  });

  it('colors failed/no-show status red', () => {
    expect(hasAnsi(interviewStatusColor('failed'))).toBe(true);
    expect(hasAnsi(interviewStatusColor('no-show'))).toBe(true);
  });

  it('colors rescheduled status yellow', () => {
    expect(hasAnsi(interviewStatusColor('rescheduled'))).toBe(true);
  });

  it('returns unknown statuses unchanged', () => {
    expect(interviewStatusColor('unknown')).toBe('unknown');
  });

  it('returns plain text when color disabled', () => {
    initColors(false);
    expect(interviewStatusColor('scheduled')).toBe('scheduled');
    expect(interviewStatusColor('passed')).toBe('passed');
  });
});

describe('interviewTypeColor', () => {
  beforeEach(() => {
    delete process.env.NO_COLOR;
    chalk.level = 3;
    initColors();
  });

  it('colors technical type blue', () => {
    expect(hasAnsi(interviewTypeColor('technical'))).toBe(true);
  });

  it('colors behavioral type green', () => {
    expect(hasAnsi(interviewTypeColor('behavioral'))).toBe(true);
  });

  it('colors system-design type yellow', () => {
    expect(hasAnsi(interviewTypeColor('system-design'))).toBe(true);
  });

  it('colors hr type cyan', () => {
    expect(hasAnsi(interviewTypeColor('hr'))).toBe(true);
  });

  it('colors culture-fit type red', () => {
    expect(hasAnsi(interviewTypeColor('culture-fit'))).toBe(true);
  });

  it('colors other type dim', () => {
    expect(hasAnsi(interviewTypeColor('other'))).toBe(true);
  });

  it('returns unknown types dim', () => {
    expect(hasAnsi(interviewTypeColor('unknown'))).toBe(true);
  });

  it('returns plain text when color disabled', () => {
    initColors(false);
    expect(interviewTypeColor('technical')).toBe('technical');
    expect(interviewTypeColor('hr')).toBe('hr');
  });
});
