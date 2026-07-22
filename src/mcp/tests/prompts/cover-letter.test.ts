import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer } from './helpers.js';
import { generateCoverLetter } from '../../../core/applications/cover-letter.js';
import { registerCoverLetterPrompt } from '../../prompts/cover-letter.js';

vi.mock('../../../core/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/applications/cover-letter.js', () => ({
  generateCoverLetter: vi.fn().mockResolvedValue({ content: 'test cover letter' }),
}));

describe('cover_letter prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cover letter message', async () => {
    const { server, getHandler } = fakeServer();
    registerCoverLetterPrompt(server);
    const handler = getHandler()!;

    const result = await handler({ campaign: 'default', slug: 'test-app' });
    expect(result.messages).toBeDefined();
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(message.role).toBe('assistant');
    expect(message.content.type).toBe('text');
    expect(message.content.text).toBe('test cover letter');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(generateCoverLetter).mockRejectedValue(new Error('test error'));

    const { server, getHandler } = fakeServer();
    registerCoverLetterPrompt(server);
    const handler = getHandler()!;

    const result = await handler({ campaign: 'default', slug: 'test-app' });
    expect(result.messages).toBeDefined();
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(message.content.text).toContain('Error generating cover letter');
    expect(message.content.text).toContain('test error');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(generateCoverLetter).mockRejectedValue('string error');

    const { server, getHandler } = fakeServer();
    registerCoverLetterPrompt(server);
    const handler = getHandler()!;

    const result = await handler({ campaign: 'default', slug: 'test-app' });
    expect(result.messages).toBeDefined();
    const message = result.messages[0]!;
    expect(message.content.text).toContain('Error generating cover letter');
    expect(message.content.text).toContain('string error');
  });
});
