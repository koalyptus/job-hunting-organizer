import { z } from 'zod';
import { resolveGlobalRoot } from './paths.js';

/**
 * Zod schema for `<globalRoot>/config.json`. The parsed result is
 * always fully populated — every nested object has a `.default(...)`
 * so a missing or partial file still yields a known-good shape.
 *
 * Defaults are chosen for the common Ollama setup (local, no auth)
 * because that is the lowest-friction starting point. The `profile`,
 * `applied`, and `knowledgeBase` paths are intentionally empty at the
 * global layer: those are owned by the campaign config and resolved
 * relative to `<globalRoot>/campaigns/<name>/` in {@link config.ts}.
 */
export const GlobalConfigSchema = z.object({
  /** Schema version. Bumped on backwards-incompatible changes. */
  version: z.number().int().min(1).default(1),
  /**
   * Absolute path of the global root. Computed at parse time via
   * {@link resolveGlobalRoot} so the value tracks `$JHO_ROOT` /
   * `~/job-hunting-organizer/` without writing it to the file.
   */
  root: z.string().default(() => resolveGlobalRoot()),
  /** OpenAI-compatible LLM endpoint settings. */
  llm: z
    .object({
      baseUrl: z.string().url().default('http://localhost:11434/v1'),
      apiKey: z.string().default('ollama'),
      model: z.string().default('llama3.1'),
    })
    .default({
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'ollama',
      model: 'llama3.1',
    }),
  /** Profile / CV / GitHub source paths. Empty `path` means "no value". */
  profile: z
    .object({
      path: z.string().default(() => {
        return '';
      }),
    })
    .default({ path: '' }),
  cv: z
    .object({
      path: z.string().default(''),
    })
    .default({ path: '' }),
  github: z
    .object({
      user: z.string().default(''),
      token: z.string().default(''),
      repos: z.array(z.string()).default([]),
    })
    .default({ user: '', token: '', repos: [] }),
  applied: z
    .object({
      dir: z.string().default(() => {
        return '';
      }),
    })
    .default({ dir: '' }),
  knowledgeBase: z
    .object({
      dir: z.string().default(() => {
        return '';
      }),
    })
    .default({ dir: '' }),
  /** Calendar integration. ICS is the zero-config default. */
  calendar: z
    .object({
      defaultProvider: z.enum(['ics', 'outlook']).default('ics'),
      outlook: z
        .object({
          tenantId: z.string().default(''),
          clientId: z.string().default(''),
          clientSecret: z.string().default(''),
        })
        .default({ tenantId: '', clientId: '', clientSecret: '' }),
    })
    .default({
      defaultProvider: 'ics',
      outlook: { tenantId: '', clientId: '', clientSecret: '' },
    }),
  /**
   * Logging knobs. `redactPaths` mirrors the secrets the logger must
   * mask before writing to disk; the user can extend the list to
   * cover custom secret fields without forking.
   */
  logging: z
    .object({
      level: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
      file: z.string().default(''),
      redactPaths: z
        .array(z.string())
        .default([
          '*.apiKey',
          '*.token',
          '*.clientSecret',
          '*.password',
          '*.secret',
          'config.llm.apiKey',
          'config.github.token',
          'config.calendar.outlook.clientSecret',
        ]),
    })
    .default({
      level: 'info',
      file: '',
      redactPaths: [
        '*.apiKey',
        '*.token',
        '*.clientSecret',
        '*.password',
        '*.secret',
        'config.llm.apiKey',
        'config.github.token',
        'config.calendar.outlook.clientSecret',
      ],
    }),
});

/**
 * Zod schema for `<globalRoot>/campaigns/<name>/config.json`. A
 * strict subset of {@link GlobalConfigSchema}: only the fields a
 * campaign is allowed to override. Missing or partial files yield a
 * fully-defaulted object, same as the global schema.
 */
export const CampaignConfigSchema = z.object({
  version: z.number().int().min(1).default(1),
  /** Overrides `global.profile.path`. */
  profile: z
    .object({
      path: z.string().default(''),
    })
    .default({ path: '' }),
  /** Overrides `global.applied.dir`. */
  applied: z
    .object({
      dir: z.string().default(''),
    })
    .default({ dir: '' }),
  /** Overrides `global.knowledgeBase.dir`. */
  knowledgeBase: z
    .object({
      dir: z.string().default(''),
    })
    .default({ dir: '' }),
});
