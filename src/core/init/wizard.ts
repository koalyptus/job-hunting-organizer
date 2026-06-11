import { text, confirm, isCancel, log as clackLog } from '@clack/prompts';
import { resolveCampaignRoot, resolveDataRoot, resolveProfilePath } from '../paths.js';
import { pathExists } from '../fs.js';
import {
  updateGlobalConfig,
  updateCampaignConfig,
  loadGlobalConfig,
  loadCampaignConfig,
} from '../config.js';
import { validateName } from '../validate.js';
import type { InitOptions, LlmConfig } from '../types.js';
import {
  DEFAULT_CAMPAIGN,
  DEFAULT_LOG_LEVEL,
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_API_KEY,
  DEFAULT_LLM_MODEL,
  MSG_CANCELLED,
} from './constants.js';
import { validateCvPath } from './cv.js';
import { promptGithub } from './github.js';
import { promptLlm, loadExistingConfig } from './llm.js';
import { promptCalendar } from './calendar.js';
import { createDirectories } from './directories.js';
import { handleProfile } from './profile.js';

/**
 * Run the init wizard. Called from the CLI command.
 */
export async function runInit(opts: InitOptions): Promise<void> {
  const name = opts.name ?? DEFAULT_CAMPAIGN;

  const validationError = validateName(name);

  if (validationError) {
    process.stderr.write(`error: invalid campaign name "${name}"\nhint: ${validationError}\n`);
    process.exit(1);
  }

  const campaignRoot = resolveCampaignRoot(name);
  const dataRoot = resolveDataRoot();

  // Re-init check
  if (await pathExists(campaignRoot)) {
    if (opts.yes) {
      clackLog.info(`Campaign "${name}" already exists, reinitializing...`);
    } else {
      const overwrite = await confirm({
        message: `Campaign "${name}" already exists. Overwrite?`,
        initialValue: false,
      });

      if (isCancel(overwrite) || !overwrite) {
        clackLog.info(MSG_CANCELLED);
        return;
      }
    }
  }

  // --- Step 1: CV path ---
  // Load existing configs early for pre-filling prompts.
  const existingConfig = loadExistingConfig();
  let existingCvPath: string | undefined;
  try {
    const campaignConfig = loadCampaignConfig(name);
    existingCvPath = campaignConfig.cv?.path || undefined;
  } catch {
    // Campaign config doesn't exist yet on first init.
  }

  let cvPath = opts.cv ?? existingCvPath;

  if (!cvPath && !opts.yes) {
    const input = await text({
      message: 'Path to your CV file (PDF, DOCX, MD, TXT)? (optional, press Enter to skip)',
      initialValue: existingCvPath || undefined,
      placeholder: '',
    });

    if (isCancel(input)) {
      clackLog.info(MSG_CANCELLED);
      return;
    }

    cvPath = input || undefined;
  }

  // Validate CV path with retry loop
  while (cvPath) {
    const result = await validateCvPath(cvPath);

    if (result.ok) {
      break;
    }

    clackLog.warn(result.error ?? 'Invalid CV path');
    const retry = await text({
      message: 'Enter a different CV path, or press Enter to skip:',
      defaultValue: '',
    });

    if (isCancel(retry) || retry === '') {
      cvPath = undefined;
    } else {
      cvPath = retry;
    }
  }

  // --- Step 2: GitHub ---
  const github = await promptGithub(opts.github, opts.yes ?? false, existingConfig);

  // --- Step 3: LLM config ---
  const llm = await promptLlm(opts.yes ?? false, existingConfig);

  const hasLlm = llm.baseUrl && llm.model;
  // apiKey is optional for local LLMs that don't require it
  const llmConfig: LlmConfig | undefined = hasLlm
    ? { baseUrl: llm.baseUrl!, apiKey: llm.apiKey ?? '', model: llm.model! }
    : undefined;

  // --- Step 4: Calendar ---
  const calendarProvider = await promptCalendar(opts.yes ?? false, existingConfig);

  // --- Step 5: Create directory structure ---
  const { appliedDir, kbDir } = await createDirectories(campaignRoot);

  // --- Step 6: Profile ---
  const profilePath = resolveProfilePath(campaignRoot);
  await handleProfile({
    campaignRoot,
    profileFlag: opts.profile,
    cvPath,
    githubUser: github.user,
    githubToken: github.token,
    llmConfig,
    nonInteractive: opts.yes ?? false,
  });

  // --- Step 7: Write global config ---
  // Deep-merge calendar to preserve outlook credentials on re-init.
  const currentConfig = loadGlobalConfig();
  updateGlobalConfig({
    version: 1,
    dataRoot,
    llm: {
      baseUrl: llm.baseUrl || DEFAULT_LLM_BASE_URL,
      apiKey: llm.apiKey || DEFAULT_LLM_API_KEY,
      model: llm.model || DEFAULT_LLM_MODEL,
    },
    github: {
      user: github.user ?? '',
      token: github.token ?? '',
      repos: [],
    },
    calendar: {
      ...currentConfig.calendar,
      defaultProvider: calendarProvider as 'ics' | 'outlook' | 'none',
    },
    logging: {
      level: DEFAULT_LOG_LEVEL,
      file: '',
      redactPaths: [],
    },
  });

  // --- Step 8: Write per-campaign config ---
  updateCampaignConfig(name, {
    version: 1,
    profile: { path: profilePath },
    cv: { path: cvPath ?? '' },
    applied: { dir: appliedDir },
    knowledgeBase: { dir: kbDir },
  });

  // --- Step 9: Summary ---
  clackLog.success(`Campaign "${name}" created`);
  clackLog.info(`
  Profile: ${profilePath}
  ${cvPath ? `CV: ${cvPath}` : 'CV: (not set)'}
  ${github.user ? `GitHub: ${github.user}` : 'GitHub: (not set)'}
  LLM: ${hasLlm ? `${llm.baseUrl} (${llm.model})` : '(not configured)'}
  Calendar: ${calendarProvider}

Next steps:
  jho track <job-url>       # record a new application
  jho profile show          # view your profile
  jho campaign config show  # view campaign config
`);
}
