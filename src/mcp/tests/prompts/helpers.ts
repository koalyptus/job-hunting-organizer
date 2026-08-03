import type { PromptMessage } from '@modelcontextprotocol/server';

export { createTestServer } from '../helpers.js';

/**
 * Extracts the text from a prompt message, throwing if the message carries
 * non-text content (image/audio). Prompt tests assert on the text body of
 * assistant messages.
 *
 * @param message - the prompt message to read
 * @returns the text content of the message
 */
export function promptText(message: PromptMessage): string {
  if (message.content.type !== 'text') {
    throw new Error('expected text prompt content');
  }
  return message.content.text;
}
