import { Command } from 'commander';

/**
 * Run a commander command via `parseAsync` with mocked stdout, stderr,
 * and `process.exit`. Returns captured output and exit code.
 *
 * @param cmd - The commander command to test.
 * @param argv - Arguments to pass (e.g. `['show', '--reveal']`).
 * @param parentSetup - Optional callback to configure the parent command
 *   (e.g. to add `--campaign`).
 * @returns Captured stdout, stderr, and exit code.
 */
export async function runCommand(
  cmd: Command,
  argv: string[],
  parentSetup?: (parent: Command) => void,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  const origStdout = process.stdout.write;
  const origStderr = process.stderr.write;
  const origExit = process.exit;

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    return true;
  }) as typeof process.stderr.write;
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`EXIT_${exitCode}`);
  }) as never;

  const parent = new Command('test-parent');
  parentSetup?.(parent);
  parent.addCommand(cmd);

  try {
    await parent.parseAsync(['node', 'test-parent', ...argv]);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.startsWith('EXIT_')) {
      exitCode = parseInt(e.message.replace('EXIT_', ''), 10);
    } else {
      throw e;
    }
  } finally {
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
    process.exit = origExit;
  }

  return { stdout, stderr, exitCode };
}
