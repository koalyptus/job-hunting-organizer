import { describe, expect, it } from 'vitest';
import type { Command } from 'commander';
import { showCommand } from '../../commands/show.js';
import { coverLetterCommand } from '../../commands/cover-letter.js';
import { answerCommand } from '../../commands/answer.js';
import { interviewCommand } from '../../commands/interview.js';
import { retroCommand } from '../../commands/retro.js';
import { prepareCommand } from '../../commands/prepare.js';
import { doctorCommand } from '../../commands/doctor.js';
import { repairCommand } from '../../commands/repair.js';

describe('command help text mentions cwd inference for slug commands', () => {
  const slugCommands: [string, Command][] = [
    ['show', showCommand],
    ['cover-letter', coverLetterCommand],
    ['answer', answerCommand],
    ['retro', retroCommand],
    ['prepare', prepareCommand],
    ['doctor', doctorCommand],
    ['repair', repairCommand],
  ];

  for (const [name, cmd] of slugCommands) {
    it(`${name} help mentions cwd inference`, () => {
      expect(cmd.helpInformation()).toContain('inferred from cwd');
    });
  }

  it('interview help mentions cwd inference', () => {
    expect(interviewCommand.helpInformation()).toContain('inferred from cwd');
  });
});
