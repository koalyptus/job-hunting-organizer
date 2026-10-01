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
    const commanderErr = new CommanderError(1, 'ERR_NO_EXIT', 'test error');
    Object.assign(commanderErr, { exitCode: undefined });
    origParse.mockRejectedValue(commanderErr);
    const result = await runCommand(cmd, ['test']);
    expect(result.exitCode).toBe(1);
    origParse.mockRestore();
  });

  it('returns true from process.stdout.write and process.stderr.write', async () => {
    const cmd = new Command('test');
    const origParse = vi.spyOn(Command.prototype, 'parseAsync');
    origParse.mockResolvedValueOnce(undefined as unknown as Command);
    const result = await runCommand(cmd, ['test']);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    origParse.mockRestore();
  });

  it('decodes Uint8Array stdout/stderr chunks', async () => {
    const cmd = new Command('echo-bin').description('write binary chunks').action(() => {
      process.stdout.write(new TextEncoder().encode('hello-bin'));
      process.stderr.write(new TextEncoder().encode('err-bin'));
    });
    const result = await runCommand(cmd, ['echo-bin']);
    expect(result.stdout).toContain('hello-bin');
    expect(result.stderr).toContain('err-bin');
    expect(result.exitCode).toBe(0);
  });

  it('defaults to exit code 0 when process.exit has no code', async () => {
    const cmd = new Command('exit-nocode')
      .description('exit without code')
      .action(() => {
        process.exit();
      });
    const result = await runCommand(cmd, ['exit-nocode']);
    expect(result.exitCode).toBe(0);
  });

  it('rethrows unknown errors', async () => {
    const cmd = new Command('boom')
      .description('throw unknown')
      .action(() => {
        throw new Error('unexpected-boom');
      });
    await expect(runCommand(cmd, ['boom'])).rejects.toThrow('unexpected-boom');
  });
});
