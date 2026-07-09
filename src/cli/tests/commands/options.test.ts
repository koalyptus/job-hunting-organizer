import { describe, expect, it } from 'vitest';
import type { Command } from 'commander';
import { globalOptions } from '../../options.js';
import { initCommand } from '../../commands/init.js';
import { trackCommand } from '../../commands/track.js';
import { coverLetterCommand } from '../../commands/cover-letter.js';
import { prepareCommand } from '../../commands/prepare.js';
import { retroCommand } from '../../commands/retro.js';
import { statsCommand } from '../../commands/stats.js';
import { interviewCommand } from '../../commands/interview.js';
import { doctorCommand } from '../../commands/doctor.js';
import { repairCommand } from '../../commands/repair.js';

const optionLongs = (cmd: Command) => cmd.options.map((o) => o.long).filter(Boolean);

describe('command option definitions match documentation', () => {
  it('init has --cv, --github', () => {
    expect(optionLongs(initCommand)).toEqual(expect.arrayContaining(['--cv', '--github']));
  });

  it('track has --paste, --stdin, --status, --salary, --tag, --note, --target-role, --yes', () => {
    expect(optionLongs(trackCommand)).toEqual(
      expect.arrayContaining([
        '--paste',
        '--stdin',
        '--status',
        '--salary',
        '--tag',
        '--note',
        '--target-role',
        '--yes',
      ]),
    );
  });

  it('cover-letter has --no-save', () => {
    expect(optionLongs(coverLetterCommand)).toEqual(expect.arrayContaining(['--no-save']));
  });

  it('prepare has --add, --text, --days, --steer, --json', () => {
    expect(optionLongs(prepareCommand)).toEqual(
      expect.arrayContaining(['--add', '--text', '--days', '--steer', '--json']),
    );
  });

  it('prepare --days defaults to "7"', () => {
    const daysOpt = prepareCommand.options.find((o) => o.long === '--days');
    expect(daysOpt?.defaultValue).toBe('7');
  });

  it('retro parent has --interview, --weak-topics, --notes, --steer', () => {
    expect(optionLongs(retroCommand)).toEqual(
      expect.arrayContaining(['--interview', '--weak-topics', '--notes', '--steer']),
    );
  });

  it('retro show has no extra options', () => {
    const subCmd = retroCommand.commands.find((c) => c.name() === 'show')!;
    expect(optionLongs(subCmd)).toEqual([]);
  });

  it('retro append inherits options from parent retroCommand', () => {
    const subCmd = retroCommand.commands.find((c) => c.name() === 'append')!;
    // Options are on parent retroCommand, not on append subcommand
    // (Commander v15 compat: same-named options on parent+child don't propagate to child)
    expect(optionLongs(subCmd)).toEqual([]);
    expect(optionLongs(retroCommand)).toEqual(
      expect.arrayContaining(['--weak-topics', '--notes', '--steer']),
    );
  });

  it('retro aggregate has --role, --include-abandoned', () => {
    const subCmd = retroCommand.commands.find((c) => c.name() === 'aggregate')!;
    expect(optionLongs(subCmd)).toEqual(expect.arrayContaining(['--role', '--include-abandoned']));
  });

  it('stats has --role, --since, --include-notes, --json', () => {
    expect(optionLongs(statsCommand)).toEqual(
      expect.arrayContaining(['--role', '--since', '--include-notes', '--json']),
    );
  });

  it('interview add has --when, --type, --duration, --interviewer, --location, --title', () => {
    const addCmd = interviewCommand.commands.find((c) => c.name() === 'add')!;
    expect(optionLongs(addCmd)).toEqual(
      expect.arrayContaining([
        '--when',
        '--type',
        '--duration',
        '--interviewer',
        '--location',
        '--title',
      ]),
    );
  });

  it('interview mark has --status', () => {
    const markCmd = interviewCommand.commands.find((c) => c.name() === 'mark')!;
    expect(optionLongs(markCmd)).toContain('--status');
  });

  it('interview notes has --append', () => {
    const notesCmd = interviewCommand.commands.find((c) => c.name() === 'notes')!;
    expect(optionLongs(notesCmd)).toContain('--append');
  });

  it('doctor does not have --all', () => {
    expect(optionLongs(doctorCommand)).not.toContain('--all');
  });

  it('repair does not have --all', () => {
    expect(optionLongs(repairCommand)).not.toContain('--all');
  });
});

describe('global options', () => {
  const globalLongs = globalOptions.map((o) => o.long).filter(Boolean);
  const globalShorts = globalOptions.map((o) => o.short).filter(Boolean);

  it('includes --campaign', () => {
    expect(globalLongs).toContain('--campaign');
  });

  it('includes -v, --verbose', () => {
    expect(globalLongs).toContain('--verbose');
    expect(globalShorts).toContain('-v');
  });

  it('includes -q, --quiet', () => {
    expect(globalLongs).toContain('--quiet');
    expect(globalShorts).toContain('-q');
  });

  it('includes -y, --yes', () => {
    expect(globalLongs).toContain('--yes');
    expect(globalShorts).toContain('-y');
  });

  it('includes --no-color', () => {
    expect(globalLongs).toContain('--no-color');
  });

  it('includes --log-file', () => {
    expect(globalLongs).toContain('--log-file');
  });

  it('has exactly 6 options', () => {
    expect(globalOptions).toHaveLength(6);
  });
});
