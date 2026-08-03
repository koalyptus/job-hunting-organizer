import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestServer, promptText } from './helpers.js';
import { extractJdFromUrl } from '../../../core/jobs/extract.js';
import { registerExtractJdPrompt } from '../../prompts/extract-jd.js';

vi.mock('../../../core/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/config/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({ global: { llm: { provider: 'openai' } } }),
}));

vi.mock('../../../core/llm.js', () => ({
  defaultLlmConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../core/jobs/extract.js', () => ({
  extractJdFromUrl: vi.fn().mockResolvedValue({ title: 'test job' }),
  extractJdFromText: vi.fn().mockResolvedValue({ title: 'test job' }),
}));

describe('extract_jd prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns JD from URL', async () => {
    const { client } = await createTestServer(registerExtractJdPrompt);
    const result = await client.getPrompt({
      name: 'extract_jd',
      arguments: { campaign: 'default', url: 'https://example.com/job' },
    });
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(message.role).toBe('assistant');
    expect(message.content.type).toBe('text');
    const data = JSON.parse(promptText(message));
    expect(data.title).toBe('test job');
  });

  it('returns JD from text', async () => {
    const { client } = await createTestServer(registerExtractJdPrompt);
    const result = await client.getPrompt({
      name: 'extract_jd',
      arguments: { campaign: 'default', text: 'test job description' },
    });
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    const data = JSON.parse(promptText(message));
    expect(data.title).toBe('test job');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(extractJdFromUrl).mockRejectedValue(new Error('test error'));

    const { client } = await createTestServer(registerExtractJdPrompt);
    const result = await client.getPrompt({
      name: 'extract_jd',
      arguments: { campaign: 'default', url: 'https://example.com/job' },
    });
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(promptText(message)).toContain('Error extracting JD');
    expect(promptText(message)).toContain('test error');
  });

  it('returns error when neither url nor text provided', async () => {
    const { client } = await createTestServer(registerExtractJdPrompt);
    const result = await client.getPrompt({
      name: 'extract_jd',
      arguments: { campaign: 'default' },
    });
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(promptText(message)).toContain('Error extracting JD');
    expect(promptText(message)).toContain('Either url or text must be provided');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(extractJdFromUrl).mockRejectedValue('string error');

    const { client } = await createTestServer(registerExtractJdPrompt);
    const result = await client.getPrompt({
      name: 'extract_jd',
      arguments: { campaign: 'default', url: 'https://example.com/job' },
    });
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(promptText(message)).toContain('Error extracting JD');
    expect(promptText(message)).toContain('string error');
  });
});
