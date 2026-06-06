import { z } from 'zod';
import { resolveGlobalRoot } from './paths.js';

// Global config schema (applies to $JHO_ROOT/config.json)
export const GlobalConfigSchema = z.object({
  version: z.number().int().min(1).default(1),
  root: z.string().default(() => resolveGlobalRoot()), // resolved at runtime
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
  profile: z
    .object({
      path: z.string().default(() => {
        // Will be overridden by campaign config
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
        // Will be overridden by campaign config
        return '';
      }),
    })
    .default({ dir: '' }),
  knowledgeBase: z
    .object({
      dir: z.string().default(() => {
        // Will be overridden by campaign config
        return '';
      }),
    })
    .default({ dir: '' }),
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
  logging: z
    .object({
      level: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
      file: z.string().default(''),
      redactPaths: z.array(z.string()).default([
        '*.apiKey',
        '*.token',
        '*.clientSecret',
        '*.password',
        '*.secret',
        'config.llm.apiKey',
        'config.github.token',
        'config.calendar.outlook.clientSecret',
        // content fields are redacted by default in logger
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

// Campaign config schema (applies to $JHO_ROOT/campaigns/<name>/config.json)
export const CampaignConfigSchema = z.object({
  version: z.number().int().min(1).default(1),
  profile: z
    .object({
      path: z.string().default(''), // Overrides global profile.path
    })
    .default({ path: '' }),
  applied: z
    .object({
      dir: z.string().default(''), // Overrides global applied.dir
    })
    .default({ dir: '' }),
  knowledgeBase: z
    .object({
      dir: z.string().default(''), // Overrides global knowledgeBase.dir
    })
    .default({ dir: '' }),
  // Campaign-specific overrides for cv, github, etc. can be added here if needed
});
