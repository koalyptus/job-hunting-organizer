/**
 * Test cases for natural-language command parsing evals.
 * Each case provides a natural-language prompt, the expected parsed command,
 * and a confidence threshold that the LLM must meet.
 */
export interface NlCommandCase {
  /** Human-readable test name. */
  readonly name: string;
  /** Why this case exists. */
  readonly description: string;
  /** Tags for filtering. */
  readonly tags: readonly string[];
  /** If true, reserved for validation only. */
  readonly holdout: boolean;
  /** Prompt version this case was written for. */
  readonly promptVersion: number;
  /** The natural-language input. */
  readonly input: string;
  /** Expected parsed command. */
  readonly expected: {
    /** Expected main command. */
    readonly command: string;
    /** Expected subcommand (if any). */
    readonly subcommand?: string;
    /** Expected positional args. */
    readonly args?: readonly string[];
    /** Expected options (key subset — extra harmless options allowed). */
    readonly options?: Record<string, unknown>;
  };
  /** Minimum confidence the parser must report. */
  readonly minConfidence: number;
}

export const cases: NlCommandCase[] = [
  {
    name: 'list applications for campaign',
    description: 'Maps "list all applications for <campaign> campaign" to list command',
    tags: ['happy-path', 'list'],
    holdout: false,
    promptVersion: 1,
    input: 'list all applications for javascript-developer campaign',
    expected: { command: 'list', args: [], options: { campaign: 'javascript-developer' } },
    minConfidence: 0.8,
  },
  {
    name: 'list applications default campaign',
    description: 'Maps "show me all applications" to list with default campaign',
    tags: ['happy-path', 'list'],
    holdout: false,
    promptVersion: 1,
    input: 'show me all applications',
    expected: { command: 'list', args: [] },
    minConfidence: 0.8,
  },
  {
    name: 'list with status and tag filters',
    description: 'Maps status + tag filters to list options',
    tags: ['list', 'filters'],
    holdout: false,
    promptVersion: 1,
    input: 'list applications with status interview and tag remote',
    expected: {
      command: 'list',
      args: [],
      options: { status: 'interview', tag: ['remote'] },
    },
    minConfidence: 0.8,
  },
  {
    name: 'track URL with status',
    description: 'Maps "track <url> with status interview"',
    tags: ['happy-path', 'track'],
    holdout: false,
    promptVersion: 1,
    input: 'track https://example.com/job/123 with status interview',
    expected: {
      command: 'track',
      args: ['https://example.com/job/123'],
      options: { status: 'interview' },
    },
    minConfidence: 0.8,
  },
  {
    name: 'track paste mode',
    description: 'Maps "track <url> --paste"',
    tags: ['track'],
    holdout: false,
    promptVersion: 1,
    input: 'track https://example.com/job --paste',
    expected: {
      command: 'track',
      args: ['https://example.com/job'],
      options: { paste: true },
    },
    minConfidence: 0.8,
  },
  {
    name: 'create cover letter',
    description: 'Maps "create cover letter for <slug>"',
    tags: ['happy-path', 'cover-letter'],
    holdout: false,
    promptVersion: 1,
    input: 'create cover letter for application-xyz',
    expected: { command: 'cover-letter', args: ['application-xyz'] },
    minConfidence: 0.8,
  },
  {
    name: 'show cover letter',
    description: 'Maps "show cover letter for <slug>" to cover-letter show',
    tags: ['cover-letter', 'subcommand'],
    holdout: false,
    promptVersion: 1,
    input: 'show cover letter for application-xyz',
    expected: { command: 'cover-letter', subcommand: 'show', args: ['application-xyz'] },
    minConfidence: 0.8,
  },
  {
    name: 'answer question',
    description: 'Maps "answer <question> for <slug>"',
    tags: ['happy-path', 'answer'],
    holdout: false,
    promptVersion: 1,
    input: "answer 'why do you want this job' for application-xyz",
    expected: {
      command: 'answer',
      args: ['application-xyz', 'why do you want this job'],
      options: {},
    },
    minConfidence: 0.8,
  },
  {
    name: 'show answer',
    description: 'Maps "show answer for <slug>" to answer show',
    tags: ['answer', 'subcommand'],
    holdout: false,
    promptVersion: 1,
    input: 'show answers for application-xyz',
    expected: { command: 'answer', subcommand: 'show', args: ['application-xyz'] },
    minConfidence: 0.8,
  },
  {
    name: 'add interview',
    description: 'Maps "add interview for <slug> tomorrow at 2pm"',
    tags: ['happy-path', 'interview'],
    holdout: false,
    promptVersion: 1,
    input: 'add interview for application-xyz tomorrow at 2pm',
    expected: {
      command: 'interview',
      subcommand: 'add',
      args: ['application-xyz'],
      options: { when: 'tomorrow at 2pm' },
    },
    minConfidence: 0.8,
  },
  {
    name: 'mark interview',
    description: 'Maps "mark interview <id> as done for <slug>"',
    tags: ['interview', 'subcommand'],
    holdout: false,
    promptVersion: 1,
    input: 'mark interview iv-1 as completed for application-xyz',
    expected: {
      command: 'interview',
      subcommand: 'mark',
      args: ['application-xyz'],
      options: { n: 'iv-1', status: 'completed' },
    },
    minConfidence: 0.7,
  },
  {
    name: 'show retro',
    description: 'Maps "show retro for <slug>"',
    tags: ['happy-path', 'retro'],
    holdout: false,
    promptVersion: 1,
    input: 'show retro for application-xyz',
    expected: { command: 'retro', subcommand: 'show', args: ['application-xyz'] },
    minConfidence: 0.8,
  },
  {
    name: 'retro with interview',
    description: 'Maps "create retro for <slug> for interview 2"',
    tags: ['retro', 'option'],
    holdout: false,
    promptVersion: 1,
    input: 'create retro for application-xyz for interview 2',
    expected: {
      command: 'retro',
      args: ['application-xyz'],
      options: { interview: '2' },
    },
    minConfidence: 0.8,
  },
  {
    name: 'retro aggregate',
    description: 'Maps "aggregate retros by role"',
    tags: ['retro', 'subcommand'],
    holdout: false,
    promptVersion: 1,
    input: 'aggregate retros for role backend',
    expected: {
      command: 'retro',
      subcommand: 'aggregate',
      options: { role: 'backend' },
    },
    minConfidence: 0.7,
  },
  {
    name: 'prepare for interview',
    description: 'Maps "prepare for interview for <slug>"',
    tags: ['happy-path', 'prepare'],
    holdout: false,
    promptVersion: 1,
    input: 'prepare for interview for application-xyz',
    expected: { command: 'prepare', args: ['application-xyz'] },
    minConfidence: 0.8,
  },
  {
    name: 'prepare from text',
    description: 'Maps "prepare from text <text>"',
    tags: ['prepare'],
    holdout: false,
    promptVersion: 1,
    input: 'prepare interview from text "We will ask about system design"',
    expected: {
      command: 'prepare',
      options: { text: 'We will ask about system design' },
    },
    minConfidence: 0.7,
  },
  {
    name: 'rebuild profile',
    description: 'Maps "rebuild my profile"',
    tags: ['happy-path', 'profile'],
    holdout: false,
    promptVersion: 1,
    input: 'rebuild my profile',
    expected: { command: 'profile', subcommand: 'rebuild', args: [] },
    minConfidence: 0.8,
  },
  {
    name: 'show stats this month',
    description: 'Maps "show stats for this month"',
    tags: ['happy-path', 'stats'],
    holdout: false,
    promptVersion: 1,
    input: 'show stats for this month',
    expected: { command: 'stats', args: [], options: { since: '30d' } },
    minConfidence: 0.8,
  },
  {
    name: 'stats with employment type',
    description: 'Maps "stats for contract roles"',
    tags: ['stats'],
    holdout: false,
    promptVersion: 1,
    input: 'show stats for contract employment type',
    expected: {
      command: 'stats',
      args: [],
      options: { employmentType: 'contract' },
    },
    minConfidence: 0.7,
  },
  {
    name: 'run doctor',
    description: 'Maps "run doctor on campaign default"',
    tags: ['happy-path', 'doctor'],
    holdout: false,
    promptVersion: 1,
    input: 'run doctor on campaign default',
    expected: { command: 'doctor', args: [], options: { campaign: 'default' } },
    minConfidence: 0.8,
  },
  {
    name: 'repair all',
    description: 'Maps "repair all applications"',
    tags: ['happy-path', 'repair'],
    holdout: false,
    promptVersion: 1,
    input: 'repair all applications',
    expected: { command: 'repair', args: [], options: { all: true } },
    minConfidence: 0.8,
  },
  {
    name: 'show logs tail',
    description: 'Maps "show logs last 50 lines"',
    tags: ['happy-path', 'logs'],
    holdout: false,
    promptVersion: 1,
    input: 'show logs last 50 lines',
    expected: { command: 'logs', args: [], options: { tail: 50 } },
    minConfidence: 0.8,
  },
  {
    name: 'create campaign',
    description: 'Maps "create campaign freelance"',
    tags: ['happy-path', 'campaign'],
    holdout: false,
    promptVersion: 1,
    input: 'create campaign freelance',
    expected: { command: 'init', args: ['freelance'], options: {} },
    minConfidence: 0.8,
  },
  {
    name: 'rename campaign',
    description: 'Maps "rename campaign default to freelance"',
    tags: ['happy-path', 'rename-campaign'],
    holdout: false,
    promptVersion: 1,
    input: 'rename campaign default to freelance',
    expected: {
      command: 'rename-campaign',
      args: ['freelance'],
      options: { from: 'default' },
    },
    minConfidence: 0.8,
  },
  {
    name: 'remove campaign',
    description: 'Maps "delete campaign freelance"',
    tags: ['happy-path', 'remove-campaign'],
    holdout: false,
    promptVersion: 1,
    input: 'delete campaign freelance',
    expected: {
      command: 'remove-campaign',
      args: ['freelance'],
      options: { yes: true },
    },
    minConfidence: 0.8,
  },
  {
    name: 'rename application',
    description: 'Maps "rename application old-slug to new-slug"',
    tags: ['happy-path', 'rename-application'],
    holdout: false,
    promptVersion: 1,
    input: 'rename application old-slug to new-slug',
    expected: {
      command: 'rename-application',
      args: ['new-slug'],
      options: { from: 'old-slug' },
    },
    minConfidence: 0.8,
  },
  {
    name: 'show application',
    description: 'Maps "show application <slug>"',
    tags: ['happy-path', 'show'],
    holdout: false,
    promptVersion: 1,
    input: 'show application 2026-Jan-15-frontend-acme',
    expected: { command: 'show', args: ['2026-Jan-15-frontend-acme'] },
    minConfidence: 0.8,
  },
  {
    name: 'help for command',
    description: 'Maps "help for track command"',
    tags: ['happy-path', 'help'],
    holdout: false,
    promptVersion: 1,
    input: 'help for track command',
    expected: { command: 'help', args: ['track'] },
    minConfidence: 0.8,
  },
  {
    name: 'init campaign',
    description: 'Maps "initialize new campaign called freelance"',
    tags: ['happy-path', 'init'],
    holdout: false,
    promptVersion: 1,
    input: 'initialize new campaign called freelance',
    expected: { command: 'init', args: ['freelance'] },
    minConfidence: 0.8,
  },
  {
    name: 'show ownership',
    description: 'Maps "show file ownership"',
    tags: ['happy-path', 'ownership'],
    holdout: false,
    promptVersion: 1,
    input: 'show file ownership',
    expected: { command: 'ownership', args: [] },
    minConfidence: 0.8,
  },
  {
    name: 'start mcp',
    description: 'Maps "start mcp server"',
    tags: ['happy-path', 'mcp'],
    holdout: false,
    promptVersion: 1,
    input: 'start mcp server',
    expected: { command: 'mcp', args: [] },
    minConfidence: 0.8,
  },
  {
    name: 'synonym: show -> list',
    description: 'Synonym handling: "display" should map to list',
    tags: ['variation', 'synonym'],
    holdout: false,
    promptVersion: 1,
    input: 'display all applications in the freelance campaign',
    expected: { command: 'list', args: [], options: { campaign: 'freelance' } },
    minConfidence: 0.7,
  },
  {
    name: 'synonym: write -> cover-letter',
    description: 'Synonym handling: "write" should map to cover-letter',
    tags: ['variation', 'synonym'],
    holdout: false,
    promptVersion: 1,
    input: 'write a cover letter for app-xyz',
    expected: { command: 'cover-letter', args: ['app-xyz'] },
    minConfidence: 0.7,
  },
  {
    name: 'ambiguous input — low confidence',
    description: 'Vague input should still parse but with lower confidence',
    tags: ['edge-case', 'ambiguous'],
    holdout: false,
    promptVersion: 1,
    input: 'do the thing with the job',
    expected: { command: 'list' },
    minConfidence: 0.3,
  },
];

/**
 * Load all cases.
 */
export function loadCases(): NlCommandCase[] {
  return cases;
}
