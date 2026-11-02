import { z } from 'zod';
import { resolveDataRoot } from '../paths.js';
import { ALL_LOG_LEVELS, type LogLevel } from '../constants.js';

export const CURRENT_GLOBAL_CONFIG_VERSION = 1;
export const CURRENT_CAMPAIGN_CONFIG_VERSION = 1;

function versionMismatchMessage(expected: number): string {
  return (
    `Config schema v${expected} expected; this file declares a different version. ` +
    `This usually means a migration function is missing in config.migrations.ts. ` +
    `Delete the config file and re-run \`jho init\`, or add the missing migration.`
  );
}

const llmSchema = z.object({
  baseUrl: z.string().url().default('http://localhost:11434/v1'),
  apiKey: z.string().default('no-key'),
  model: z.string().default('llama3.1'),
  timeoutMs: z.number().int().min(30_000).max(3_600_000).default(1_200_000),
  tags: z.array(z.string()).optional(),
});

export const GlobalConfigSchema = z.object({
  version: z
    .number()
    .int()
    .refine((v) => v === CURRENT_GLOBAL_CONFIG_VERSION, {
      message: versionMismatchMessage(CURRENT_GLOBAL_CONFIG_VERSION),
    })
    .default(CURRENT_GLOBAL_CONFIG_VERSION),
  dataRoot: z.string().default(() => resolveDataRoot()),
  llm: z.union([llmSchema, z.array(llmSchema)]).default({
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'no-key',
    model: 'llama3.1',
    timeoutMs: 1_200_000,
  }),
  github: z
    .object({
      user: z.string().default(''),
      token: z.string().default(''),
      repos: z.array(z.string()).default([]),
    })
    .default({ user: '', token: '', repos: [] }),
  fetch: z
    .object({
      timeoutMs: z.number().int().min(5_000).max(120_000).default(30_000),
    })
    .default({ timeoutMs: 30_000 }),
  logging: z
    .object({
      level: z.enum(ALL_LOG_LEVELS as [LogLevel, ...LogLevel[]]).default('info'),
      disableFileLogging: z.boolean().default(false),
      file: z.string().optional(),
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
        ]),
    })
    .default({
      level: 'info',
      disableFileLogging: false,
      redactPaths: [
        '*.apiKey',
        '*.token',
        '*.clientSecret',
        '*.password',
        '*.secret',
        'config.llm.apiKey',
        'config.github.token',
      ],
    }),
});

export const CampaignConfigSchema = z.object({
  version: z
    .number()
    .int()
    .refine((v) => v === CURRENT_CAMPAIGN_CONFIG_VERSION, {
      message: versionMismatchMessage(CURRENT_CAMPAIGN_CONFIG_VERSION),
    })
    .default(CURRENT_CAMPAIGN_CONFIG_VERSION),
  profile: z
    .object({
      path: z.string().default(''),
    })
    .default({ path: '' }),
  cv: z
    .object({
      path: z.string().default(''),
    })
    .default({ path: '' }),
  linkedin: z
    .object({
      url: z.string().default(''),
    })
    .default({ url: '' }),
  applied: z
    .object({
      dir: z.string().default(''),
    })
    .default({ dir: '' }),
  knowledgeBase: z
    .object({
      dir: z.string().default(''),
      maxChars: z.number().int().positive().optional(),
      sources: z.array(z.string()).default([]),
    })
    .default({ dir: '', sources: [] }),
});
