import { Command, Option } from 'commander';
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  looksLikeNaturalLanguage,
  extractPromptAndGlobals,
  PromptParseError,
} from '../../../core/parser/prompt-parser.js';
import { dispatchNaturalLanguage, validateParsedCommand } from '../../nl-dispatch.js';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Build a Commander program carrying the global options real commands expect. */
function makeProgram(): Command {
  const program = new Command('jho').exitOverride();
  program.addOption(new Option('--campaign <name>', 'campaign to operate on'));
  program.addOption(new Option('--verbose', 'verbose'));
  program.addOption(new Option('--quiet', 'quiet'));
  program.addOption(new Option('--yes', 'skip prompts'));
  program.addOption(new Option('--no-color', 'no color'));
  program.addOption(new Option('--log-file <path>', 'log file'));
  return program;
}

describe('natural language heuristics', () => {
  describe('looksLikeNaturalLanguage', () => {
    it('returns true for a quoted plain-English sentence', () => {
      expect(looksLikeNaturalLanguage(['list all applications for js'])).toBe(true);
    });

    it('returns true for a multi-word first arg with spaces', () => {
      expect(looksLikeNaturalLanguage(['create cover letter for application-xyz'])).toBe(true);
    });

    it('returns false for a single known command', () => {
      expect(looksLikeNaturalLanguage(['list'])).toBe(false);
    });

    it('returns false when first token is a flag', () => {
      expect(looksLikeNaturalLanguage(['--campaign', 'default', 'list'])).toBe(false);
    });

    it('returns false for a single slug (no spaces)', () => {
      expect(looksLikeNaturalLanguage(['2026-Jan-15-frontend-acme'])).toBe(false);
    });

    it('returns false for empty args', () => {
      expect(looksLikeNaturalLanguage([])).toBe(false);
    });
  });

  describe('extractPromptAndGlobals', () => {
    it('extracts --yes as a global', () => {
      const { globals, prompt } = extractPromptAndGlobals(['--yes', 'list all apps']);
      expect(globals.yes).toBe(true);
      expect(prompt).toBe('list all apps');
    });

    it('extracts --campaign as a global', () => {
      const { globals, prompt } = extractPromptAndGlobals(['list apps', '--campaign', 'freelance']);
      expect(globals.campaign).toBe('freelance');
      expect(prompt).toBe('list apps');
    });

    it('extracts --verbose as a global', () => {
      const { globals, prompt } = extractPromptAndGlobals(['--verbose', 'show me stats']);
      expect(globals.verbose).toBe(true);
      expect(prompt).toBe('show me stats');
    });

    it('merges multiple globals', () => {
      const { globals, prompt } = extractPromptAndGlobals([
        '--yes',
        '--campaign',
        'x',
        '--verbose',
        'do the thing',
      ]);
      expect(globals.yes).toBe(true);
      expect(globals.campaign).toBe('x');
      expect(globals.verbose).toBe(true);
      expect(prompt).toBe('do the thing');
    });

    it('handles a quoted prompt without globals', () => {
      const { globals, prompt } = extractPromptAndGlobals(['create cover letter for app-xyz']);
      expect(globals.campaign).toBeUndefined();
      expect(prompt).toBe('create cover letter for app-xyz');
    });
  });
});

describe('dispatchNaturalLanguage', () => {
  it('re-parses a parsed command through a Commander program', async () => {
    const action = vi.fn();
    const subAction = vi.fn();

    const program = makeProgram();
    program.addCommand(new Command('list').action(action));
    const retro = new Command('retro');
    retro.addCommand(new Command('show').argument('[slug]').action(subAction));
    program.addCommand(retro);

    await dispatchNaturalLanguage(
      { command: 'list', args: [], options: {}, confidence: 0.9 },
      {},
      program,
    );
    expect(action).toHaveBeenCalledTimes(1);

    await dispatchNaturalLanguage(
      {
        command: 'retro',
        subcommand: 'show',
        args: ['slug-1'],
        options: {},
        confidence: 0.9,
      },
      {},
      program,
    );
    expect(subAction).toHaveBeenCalledTimes(1);
    const subArg = subAction.mock.calls[0]?.[0];
    expect(subArg).toBe('slug-1');
  });

  it('passes globals and options as argv flags', async () => {
    const action = vi.fn();
    const program = makeProgram();
    program.addCommand(
      new Command('track')
        .argument('[url]')
        .option('--status <s>')
        .action(function (this: Command, url: string | undefined, opts: Record<string, unknown>) {
          action(url, opts, this.parent?.opts());
        }),
    );

    await dispatchNaturalLanguage(
      {
        command: 'track',
        args: ['https://example.com/job'],
        options: { status: 'interview' },
        confidence: 0.9,
      },
      { campaign: 'freelance' },
      program,
    );

    expect(action).toHaveBeenCalledTimes(1);
    const parentOpts = action.mock.calls[0]?.[2] as { campaign?: string } | undefined;
    const opts = action.mock.calls[0]?.[1] as { status?: string };
    expect(opts.status).toBe('interview');
    expect(parentOpts?.campaign).toBe('freelance');
  });

  it('expands array options into repeated flags', async () => {
    const action = vi.fn();
    const program = makeProgram();
    const collect = (val: string, prev: string[] = []) => prev.concat(val);
    program.addCommand(new Command('list').option('--tag <t>', 'tag', collect, []).action(action));

    await dispatchNaturalLanguage(
      {
        command: 'list',
        args: [],
        options: { tag: ['remote', 'contract'] },
        confidence: 0.9,
      },
      {},
      program,
    );

    const opts = action.mock.calls[0]?.[0] as { tag?: string[] };
    expect(opts.tag).toEqual(['remote', 'contract']);
  });

  it('merges LLM-parsed campaign into globals for dispatch', async () => {
    const action = vi.fn();
    const program = makeProgram();
    // list command reads campaign from this.parent?.opts() — same as the real CLI
    program.addCommand(
      new Command('list').option('--status <s>').action(function (
        this: Command,
        opts: Record<string, unknown>,
      ) {
        action(opts, this.parent?.opts());
      }),
    );

    await dispatchNaturalLanguage(
      {
        command: 'list',
        args: [],
        options: { status: 'rejected', campaign: 'javascript-developer' },
        confidence: 0.9,
      },
      {}, // globals is empty — campaign was extracted from NL input, not CLI flags
      program,
    );

    expect(action).toHaveBeenCalledTimes(1);
    const parentOpts = action.mock.calls[0]?.[1] as { campaign?: string } | undefined;
    expect(parentOpts?.campaign).toBe('javascript-developer');
  });

  it('prompts for campaign using CLI yes flag, not LLM-inferred one', async () => {
    const action = vi.fn();
    const program = makeProgram();
    program.addCommand(new Command('list').option('--status <s>').action(action));

    const resolveSpy = vi
      .spyOn(await import('../../campaign.js'), 'resolveCampaign')
      .mockResolvedValue('default');

    // LLM parsed `yes: true` from the natural language, but the user did NOT
    // pass --yes on the CLI. The campaign prompt must still run (yes=false).
    await dispatchNaturalLanguage(
      {
        command: 'list',
        args: [],
        options: { status: 'rejected', yes: true },
        confidence: 0.9,
      },
      {},
      program,
    );

    expect(resolveSpy).toHaveBeenCalledTimes(1);
    const callArg = resolveSpy.mock.calls[0]?.[0] as { yes?: boolean } | undefined;
    expect(callArg?.yes).toBe(false);
  });

  it('passes through CLI yes flag to the campaign prompt', async () => {
    const action = vi.fn();
    const program = makeProgram();
    program.addCommand(new Command('list').option('--status <s>').action(action));

    const resolveSpy = vi
      .spyOn(await import('../../campaign.js'), 'resolveCampaign')
      .mockResolvedValue('default');

    await dispatchNaturalLanguage(
      {
        command: 'list',
        args: [],
        options: { status: 'rejected', yes: true },
        confidence: 0.9,
      },
      { yes: true },
      program,
    );

    expect(resolveSpy).toHaveBeenCalledTimes(1);
    const callArg = resolveSpy.mock.calls[0]?.[0] as { yes?: boolean } | undefined;
    expect(callArg?.yes).toBe(true);
  });

  it('emits all global argv flags when globals are set', async () => {
    const action = vi.fn();
    const program = makeProgram();
    program.addCommand(
      new Command('track').argument('[url]').action(function (
        this: Command,
        url: string | undefined,
        opts: Record<string, unknown>,
      ) {
        action(url, opts, this.parent?.opts());
      }),
    );

    await dispatchNaturalLanguage(
      { command: 'track', args: ['https://example.com/job'], options: {}, confidence: 0.9 },
      {
        campaign: 'freelance',
        verbose: true,
        quiet: true,
        yes: true,
        color: false,
        logFile: '/tmp/j.log',
      },
      program,
    );

    expect(action).toHaveBeenCalledTimes(1);
    const parentOpts = action.mock.calls[0]?.[2] as Record<string, unknown> | undefined;
    expect(parentOpts?.campaign).toBe('freelance');
    expect(parentOpts?.verbose).toBe(true);
    expect(parentOpts?.quiet).toBe(true);
    expect(parentOpts?.yes).toBe(true);
    expect(parentOpts?.color).toBe(false);
    expect(parentOpts?.logFile).toBe('/tmp/j.log');
  });

  it('passes boolean true/false command options through appendOption', async () => {
    const action = vi.fn();
    const program = makeProgram();
    program.addCommand(
      new Command('answer')
        .argument('[slug]')
        .argument('[question]')
        .option('--no-save')
        .option('--save')
        .option('--some-flag')
        .option('--skip')
        .allowUnknownOption()
        .action(function (
          this: Command,
          slug: string | undefined,
          question: string | undefined,
          opts: Record<string, unknown>,
        ) {
          action(slug, question, opts);
        }),
    );

    // `noSave: true` → kebab false-flag; boolean true handled as a flag;
    // `skip: false` is skipped (not pushed as a flag).
    await dispatchNaturalLanguage(
      {
        command: 'answer',
        args: ['app-1', 'why?'],
        options: { noSave: true, someFlag: true, skip: false },
        confidence: 0.9,
      },
      {},
      program,
    );

    expect(action).toHaveBeenCalledTimes(1);
    const opts = action.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(opts.someFlag).toBe(true);
    // `skip: false` is skipped (not pushed as a flag)
    expect(opts.skip).toBeUndefined();
  });
});

describe('validateParsedCommand', () => {
  it('passes for a valid command', () => {
    const program = makeProgram();
    program.addCommand(new Command('list'));
    expect(() =>
      validateParsedCommand({ command: 'list', args: [], options: {}, confidence: 0.9 }, program),
    ).not.toThrow();
  });

  it('throws PromptParseError for unknown command', () => {
    const program = makeProgram();
    program.addCommand(new Command('list'));
    expect(() =>
      validateParsedCommand(
        { command: 'frobnicate', args: [], options: {}, confidence: 0.9 },
        program,
      ),
    ).toThrow(PromptParseError);
  });

  it('throws PromptParseError for subcommand on command without subcommands', () => {
    const program = makeProgram();
    program.addCommand(new Command('list'));
    expect(() =>
      validateParsedCommand(
        { command: 'list', subcommand: 'show', args: [], options: {}, confidence: 0.9 },
        program,
      ),
    ).toThrow(PromptParseError);
  });

  it('passes for valid subcommand', () => {
    const program = makeProgram();
    const retro = new Command('retro');
    retro.addCommand(new Command('show'));
    program.addCommand(retro);
    expect(() =>
      validateParsedCommand(
        { command: 'retro', subcommand: 'show', args: [], options: {}, confidence: 0.9 },
        program,
      ),
    ).not.toThrow();
  });
});
