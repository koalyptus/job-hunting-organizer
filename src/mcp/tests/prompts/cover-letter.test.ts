import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestServer, promptText } from './helpers.js';
import { generateCoverLetter } from '../../../workflow/applications/cover-letter.js';
import { registerCoverLetterPrompt } from '../../prompts/cover-letter.js';

vi.mock('../../../lib/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../workflow/applications/cover-letter.js', () => ({
  generateCoverLetter: vi.fn().mockResolvedValue({ content: 'test cover letter' }),
}));

describe('cover_letter prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cover letter message', async () => {
    const { client } = await createTestServer(registerCoverLetterPrompt);
    const result = await client.getPrompt({
      name: 'cover_letter',
      arguments: { campaign: 'default', slug: 'test-app' },
    });
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(message.role).toBe('assistant');
    expect(message.content.type).toBe('text');
    expect(promptText(message)).toBe('test cover letter');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(generateCoverLetter).mockRejectedValue(new Error('test error'));

    const { client } = await createTestServer(registerCoverLetterPrompt);
    const result = await client.getPrompt({
      name: 'cover_letter',
      arguments: { campaign: 'default', slug: 'test-app' },
    });
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(promptText(message)).toContain('Error generating cover letter');
    expect(promptText(message)).toContain('test error');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(generateCoverLetter).mockRejectedValue('string error');

    const { client } = await createTestServer(registerCoverLetterPrompt);
    const result = await client.getPrompt({
      name: 'cover_letter',
      arguments: { campaign: 'default', slug: 'test-app' },
    });
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(promptText(message)).toContain('Error generating cover letter');
    expect(promptText(message)).toContain('string error');
  });
});
