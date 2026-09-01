import { describe, expect, it, vi } from 'vitest';
import { Command, CommanderError } from 'commander';
import { runCommand } from '../helpers.js';

describe('runCommand', () => {
  it('returns exitCode 0 for commander.help errors', async () => {
    const cmd = new Command('test');
    const origParse = vi.spyOn(Command.prototype, 'parseAsync');
    origParse.mockRejectedValue({ code: 'commander.help', exitCode: 0 });
    const result = await runCommand(cmd, ['test']);
    expect(result.exitCode).toBe(0);
    origParse.mockRestore();
  });

  it('returns e.exitCode ?? 1 for CommanderError', async () => {
    const cmd = new Command('test');
    const origParse = vi.spyOn(Command.prototype, 'parseAsync');
    const commanderErr = new CommanderError(1, 'ERR_TEST', 'test error');
    origParse.mockRejectedValue(commanderErr);
    const result = await runCommand(cmd, ['test']);
    expect(result.exitCode).toBe(commanderErr.exitCode);
    origParse.mockRestore();
  });

  it('returns 1 when CommanderError has no exitCode', async () => {
    const cmd = new Command('test');
    const origParse = vi.spyOn(Command.prototype, 'parseAsync');
    const commanderErr = new CommanderError(undefined, 'ERR_NO_EXIT', 'test error');
    origParse.mockRejectedValue(commanderErr);
    const result = await runCommand(cmd, ['test']);
    expect(result.exitCode).toBe(1);
    origParse.mockRestore();
  });

  it('returns true from process.stdout.write and process.stderr.write', async () => {
    const cmd = new Command('test');
    const origParse = vi.spyOn(Command.prototype, 'parseAsync');
    origParse.mockResolvedValueOnce(undefined);
    const result = await runCommand(cmd, ['test']);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    origParse.mockRestore();
  });
});
