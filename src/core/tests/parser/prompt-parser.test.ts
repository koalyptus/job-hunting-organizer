import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseNaturalLanguage,
  looksLikeNaturalLanguage,
  deriveKnownCommands,
  extractPromptAndGlobals,
  PromptParseError,
} from '../../parser/prompt-parser.js';
import type { GlobalOpts } from '../../../cli/options.js';

// Mock the modules that talk to the LLM / filesystem.
const chatCompleteMock = vi.fn();
const loadPromptTemplateMock = vi.fn();
const parseJsonResultMock = vi.fn((raw: string) => JSON.parse(raw));

vi.mock('../../llm.js', () => ({
  chatComplete: (...args: unknown[]) => chatCompleteMock(...args),
  defaultLlmConfig: () => ({
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'test',
    model: 'test-model',
    timeoutMs: 300_000,
  }),
  parseJsonResult: (raw: string) => parseJsonResultMock(raw),
  extractJson: (raw: string) => parseJsonResultMock(raw),
}));

vi.mock('../../prompts.js', () => ({
  loadPromptTemplate: (...args: unknown[]) => loadPromptTemplateMock(...args),
}));

vi.mock('../../logger/logger.js', () => ({
  getRootLogger: () => ({
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

const emptyGlobals: GlobalOpts = {};

function mockLlmReturns(content: string): void {
  chatCompleteMock.mockResolvedValueOnce({
    content,
    model: 'test-model',
    finishReason: 'stop',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    durationMs: 0,
  });
}

describe('looksLikeNaturalLanguage', () => {
  it('returns false for empty args', () => {
    expect(looksLikeNaturalLanguage([])).toBe(false);
  });

  it('returns false for known commands', () => {
    expect(looksLikeNaturalLanguage(['list'])).toBe(false);
    expect(looksLikeNaturalLanguage(['track', 'https://example.com'])).toBe(false);
  });

  it('returns false for flags', () => {
    expect(looksLikeNaturalLanguage(['--help'])).toBe(false);
    expect(looksLikeNaturalLanguage(['--campaign', 'default'])).toBe(false);
  });

  it('returns true for multi-word phrases', () => {
    expect(looksLikeNaturalLanguage(['list', 'all', 'applications'])).toBe(false); // first word is "list"
  });

  it('returns true when first arg contains spaces', () => {
    expect(looksLikeNaturalLanguage(['list all applications for default campaign'])).toBe(true);
    expect(looksLikeNaturalLanguage(['create cover letter for app-xyz'])).toBe(true);
  });

  it('returns false for a quoted known command followed by a slug', () => {
    expect(looksLikeNaturalLanguage(['show 2026-Jan-15-react-dev-acme'])).toBe(false);
    expect(looksLikeNaturalLanguage(['track 2025-Dec-01-swe-foo-123'])).toBe(false);
  });

  it('returns true for a quoted known command followed by non-slug text', () => {
    expect(looksLikeNaturalLanguage(['show all my applications'])).toBe(true);
  });

  it('uses a caller-supplied command set over the built-in fallback', () => {
    // A command unknown to the fallback set but present in the live set.
    const live = new Set(['frobnicate']);
    expect(looksLikeNaturalLanguage(['frobnicate', 'all', 'the', 'things'])).toBe(false);
    expect(looksLikeNaturalLanguage(['frobnicate', 'all', 'the', 'things'], live)).toBe(false);

    // Without the live set, "frobnicate" is treated as non-command (not NL here
    // because it's a single token with no spaces).
    expect(looksLikeNaturalLanguage(['frobnicate'])).toBe(false);
  });

  it('treats a quoted command from the live set plus slug as non-NL', () => {
    const live = new Set(['inspect']);
    expect(looksLikeNaturalLanguage(['inspect 2026-Jan-15-react-dev-acme'], live)).toBe(false);
    expect(looksLikeNaturalLanguage(['inspect everything please'], live)).toBe(true);
  });

  it('deriveKnownCommands builds a set from command names', () => {
    expect(deriveKnownCommands(['list', 'track', 'list'])).toEqual(new Set(['list', 'track']));
  });
});

describe('extractPromptAndGlobals', () => {
  it('separates global --campaign flag from prompt', () => {
    const { globals, prompt } = extractPromptAndGlobals([
      '--campaign',
      'freelance',
      'list',
      'all',
      'applications',
    ]);
    expect(globals.campaign).toBe('freelance');
    expect(prompt).toBe('list all applications');
  });

  it('extracts --verbose, --quiet, --yes, --no-color', () => {
    const { globals, prompt } = extractPromptAndGlobals([
      '-v',
      '--quiet',
      '-y',
      '--no-color',
      'show me stats',
    ]);
    expect(globals.verbose).toBe(true);
    expect(globals.quiet).toBe(true);
    expect(globals.yes).toBe(true);
    expect(globals.color).toBe(false);
    expect(prompt).toBe('show me stats');
  });

  it('extracts --log-file with value', () => {
    const { globals, prompt } = extractPromptAndGlobals([
      '--log-file',
      '/tmp/jho.log',
      'list apps',
    ]);
    expect(globals.logFile).toBe('/tmp/jho.log');
    expect(prompt).toBe('list apps');
  });

  it('keeps unknown flags in the prompt', () => {
    const { globals, prompt } = extractPromptAndGlobals(['--foo', 'bar', 'list apps']);
    expect(globals).toEqual({});
    expect(prompt).toBe('--foo bar list apps');
  });
});

describe('parseNaturalLanguage', () => {
  beforeEach(() => {
    loadPromptTemplateMock.mockResolvedValue({
      body: 'You are a command parser.',
      temperature: 0.1,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('parses a list command', async () => {
    mockLlmReturns(
      JSON.stringify({
        command: 'list',
        args: [],
        options: { campaign: 'javascript-developer' },
        confidence: 0.98,
      }),
    );

    const parsed = await parseNaturalLanguage(
      'list all applications for javascript-developer campaign',
      emptyGlobals,
    );

    expect(parsed.command).toBe('list');
    expect(parsed.options.campaign).toBe('javascript-developer');
    expect(parsed.confidence).toBe(0.98);
  });

  it('parses a track command with URL', async () => {
    mockLlmReturns(
      JSON.stringify({
        command: 'track',
        args: ['https://example.com/job/123'],
        options: { status: 'interview' },
        confidence: 0.95,
      }),
    );

    const parsed = await parseNaturalLanguage(
      'track https://example.com/job/123 with status interview',
      emptyGlobals,
    );

    expect(parsed.command).toBe('track');
    expect(parsed.args).toEqual(['https://example.com/job/123']);
    expect(parsed.options.status).toBe('interview');
  });

  it('parses a cover-letter command with subcommand', async () => {
    mockLlmReturns(
      JSON.stringify({
        command: 'cover-letter',
        subcommand: 'show',
        args: ['application-xyz'],
        options: {},
        confidence: 0.95,
      }),
    );

    const parsed = await parseNaturalLanguage(
      'show cover letter for application-xyz',
      emptyGlobals,
    );

    expect(parsed.command).toBe('cover-letter');
    expect(parsed.subcommand).toBe('show');
    expect(parsed.args).toEqual(['application-xyz']);
  });

  it('merges global options over parsed options', async () => {
    mockLlmReturns(
      JSON.stringify({
        command: 'list',
        args: [],
        options: { campaign: 'parsed-campaign' },
        confidence: 0.9,
      }),
    );

    const globals: GlobalOpts = { campaign: 'global-campaign' };
    const parsed = await parseNaturalLanguage('list applications', globals);

    expect(parsed.options.campaign).toBe('global-campaign');
  });

  it('clamps confidence to [0, 1]', async () => {
    mockLlmReturns(
      JSON.stringify({
        command: 'list',
        args: [],
        options: {},
        confidence: 1.5,
      }),
    );
    const high = await parseNaturalLanguage('list', emptyGlobals);
    expect(high.confidence).toBe(1);

    chatCompleteMock.mockResolvedValueOnce({
      content: JSON.stringify({ command: 'list', args: [], options: {}, confidence: -0.5 }),
      model: 'test-model',
      finishReason: 'stop',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      durationMs: 0,
    });
    const low = await parseNaturalLanguage('list', emptyGlobals);
    expect(low.confidence).toBe(0);
  });

  it('throws PromptParseError on invalid JSON', async () => {
    mockLlmReturns('not valid json');
    await expect(parseNaturalLanguage('list', emptyGlobals)).rejects.toThrow(PromptParseError);
  });

  it('throws PromptParseError when command field is missing', async () => {
    mockLlmReturns(JSON.stringify({ args: [], options: {}, confidence: 0.9 }));
    await expect(parseNaturalLanguage('list', emptyGlobals)).rejects.toThrow(PromptParseError);
  });

  it('throws PromptParseError when args is not an array', async () => {
    mockLlmReturns(
      JSON.stringify({ command: 'list', args: 'not-array', options: {}, confidence: 0.9 }),
    );
    await expect(parseNaturalLanguage('list', emptyGlobals)).rejects.toThrow(PromptParseError);
  });

  it('defaults confidence to 0.5 when missing', async () => {
    mockLlmReturns(JSON.stringify({ command: 'list', args: [], options: {} }));
    const parsed = await parseNaturalLanguage('list', emptyGlobals);
    expect(parsed.confidence).toBe(0.5);
  });

  it('throws PromptParseError when options is null', async () => {
    mockLlmReturns(JSON.stringify({ command: 'list', args: [], options: null, confidence: 0.9 }));
    await expect(parseNaturalLanguage('list', emptyGlobals)).rejects.toThrow(PromptParseError);
  });

  it('throws PromptParseError when options is not an object', async () => {
    mockLlmReturns(JSON.stringify({ command: 'list', args: [], options: 'nope', confidence: 0.9 }));
    await expect(parseNaturalLanguage('list', emptyGlobals)).rejects.toThrow(PromptParseError);
  });

  it('handles non-Error thrown during JSON parse', async () => {
    // parseJsonResult throws a string (not an Error) to exercise the
    // `String(err)` branch of the catch handler.
    parseJsonResultMock.mockImplementationOnce(() => {
      throw 'boom';
    });
    mockLlmReturns('{"command":"list"}');
    await expect(parseNaturalLanguage('list', emptyGlobals)).rejects.toThrow(/boom/);
  });

  it('throws PromptParseError when the LLM call fails with a timeout', async () => {
    chatCompleteMock.mockRejectedValueOnce(new Error('request timed out after 30000ms'));
    await expect(parseNaturalLanguage('list', emptyGlobals)).rejects.toThrow(/timed out/i);
  });

  it('throws PromptParseError when the LLM call fails with a generic error', async () => {
    chatCompleteMock.mockRejectedValueOnce(new Error('service unavailable'));
    await expect(parseNaturalLanguage('list', emptyGlobals)).rejects.toThrow(
      /service unavailable/i,
    );
  });

  it('throws PromptParseError when the LLM call fails with a non-Error', async () => {
    chatCompleteMock.mockRejectedValueOnce('connection lost');
    await expect(parseNaturalLanguage('list', emptyGlobals)).rejects.toThrow(/connection lost/i);
  });
});
