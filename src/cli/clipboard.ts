import clipboardy from 'clipboardy';
import { UserInputError } from './errors.js';

/**
 * Clipboard utilities for CLI commands.
 */

/**
 * Read text from clipboard. Throws {@link UserInputError} if clipboard is empty.
 */
export async function readClipboard(): Promise<string> {
  const text = await clipboardy.read();
  if (!text || text.trim() === '') {
    throw new UserInputError(
      'clipboard is empty\nhint: copy the job description to your clipboard first',
    );
  }
  return text;
}
