import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer } from './helpers.js';
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
    const { server, getHandler } = fakeServer();
    registerExtractJdPrompt(server);
    const handler = getHandler()!;

    const result = await handler({
      campaign: 'default',
      url: 'https://example.com/job',
    });
    expect(result.messages).toBeDefined();
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(message.role).toBe('assistant');
    expect(message.content.type).toBe('text');
    const data = JSON.parse(message.content.text);
    expect(data.title).toBe('test job');
  });

  it('returns JD from text', async () => {
    const { server, getHandler } = fakeServer();
    registerExtractJdPrompt(server);
    const handler = getHandler()!;

    const result = await handler({
      campaign: 'default',
      text: 'test job description',
    });
    expect(result.messages).toBeDefined();
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    const data = JSON.parse(message.content.text);
    expect(data.title).toBe('test job');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(extractJdFromUrl).mockRejectedValue(new Error('test error'));

    const { server, getHandler } = fakeServer();
    registerExtractJdPrompt(server);
    const handler = getHandler()!;

    const result = await handler({
      campaign: 'default',
      url: 'https://example.com/job',
    });
    expect(result.messages).toBeDefined();
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(message.content.text).toContain('Error extracting JD');
    expect(message.content.text).toContain('test error');
  });

  it('returns error when neither url nor text provided', async () => {
    const { server, getHandler } = fakeServer();
    registerExtractJdPrompt(server);
    const handler = getHandler()!;

    const result = await handler({ campaign: 'default' });
    expect(result.messages).toBeDefined();
    expect(result.messages).toHaveLength(1);
    const message = result.messages[0]!;
    expect(message.content.text).toContain('Error extracting JD');
    expect(message.content.text).toContain('Either url or text must be provided');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(extractJdFromUrl).mockRejectedValue('string error');

    const { server, getHandler } = fakeServer();
    registerExtractJdPrompt(server);
    const handler = getHandler()!;

    const result = await handler({
      campaign: 'default',
      url: 'https://example.com/job',
    });
    expect(result.messages).toBeDefined();
    const message = result.messages[0]!;
    expect(message.content.text).toContain('Error extracting JD');
    expect(message.content.text).toContain('string error');
  });
});
