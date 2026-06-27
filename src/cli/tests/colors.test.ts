import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import chalk from 'chalk';
import { initColors, bold, cyan, dim, green, red, yellow } from '../colors.js';

const NO_COLOR_SAVED = process.env.NO_COLOR;

const ESC = '\u001b';

function hasAnsi(text: string): boolean {
  return text.includes(`${ESC}[`);
}

describe('initColors', () => {
  beforeEach(() => {
    delete process.env.NO_COLOR;
  });

  afterEach(() => {
    if (NO_COLOR_SAVED === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = NO_COLOR_SAVED;
    }
  });

  it('enables color by default', () => {
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
