import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { text, confirm, isCancel, log as clackLog } from '@clack/prompts';
import { resolveCampaignRoot, resolveDataRoot, resolveProfilePath, ensureRoot } from '../paths.js';
import { pathExists } from '../fs.js';
import {
  updateGlobalConfig,
  updateCampaignConfig,
  loadGlobalConfig,
  loadCampaignConfig,
} from '../config.js';
import { validateName } from '../validate.js';
import { acquireLock } from '../locks.js';
import type { InitOptions } from './types.js';
import type { LlmConfig } from '../types.js';
import {
  DEFAULT_CAMPAIGN,
  DEFAULT_LOG_LEVEL,
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_API_KEY,
  DEFAULT_LLM_MODEL,
  JHO_LINKEDIN_URL,
} from './constants.js';
import { validateCvPath } from '../cv.js';
import { promptGithub } from './github.js';
import { promptLlm, loadExistingConfig } from './llm.js';
import { promptCalendar } from './calendar.js';
import { createDirectories } from '../directories.js';
import { handleProfile } from '../profile-builder.js';
import { InitCancelled, InitError, InitInvalidNameError } from './errors.js';
import { childLogger } from '../logger/logger.js';

/**
 * Run the init wizard. Called from the CLI command.
 * @throws {InitCancelled} if the user cancels any prompt.
 * @throws {InitError} on validation or file errors.
 */
export async function runInit(opts: InitOptions): Promise<void> {
  const name = opts.name ?? DEFAULT_CAMPAIGN;
  const log = opts.log ?? childLogger({ cmd: 'init' });

  const validationError = validateName(name);

  if (validationError) {
    throw new InitInvalidNameError(name, validationError);
  }

  log.info({ campaign: name }, 'init.wizard.started');

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
        throw new InitCancelled();
      }
    }
  }

  // --- Step 1: LinkedIn profile URL ---
  // Load existing configs early for pre-filling prompts.
  const existingConfig = loadExistingConfig();
  let existingCvPath: string | undefined;
  let existingLinkedinUrl: string | undefined;
  try {
    const campaignConfig = loadCampaignConfig(name);
    existingCvPath = campaignConfig.cv?.path || undefined;
    existingLinkedinUrl = campaignConfig.linkedin?.url || undefined;
  } catch (err) {
    log.debug({ err }, 'campaign.config.load.failed');
    // Campaign directory doesn't exist yet (first init).
  }

  const envLinkedinUrl = process.env[JHO_LINKEDIN_URL];
  let linkedinUrl = (opts.linkedin ?? envLinkedinUrl)?.trim() || undefined;

  if (!linkedinUrl && !opts.yes) {
    const input = await text({
      message: 'LinkedIn profile URL? (optional, press Enter to skip)',
      initialValue: existingLinkedinUrl || undefined,
      placeholder: '',
    });

    if (isCancel(input)) {
      throw new InitCancelled();
    }

    linkedinUrl = input?.trim() || undefined;
  } else if (!linkedinUrl && existingLinkedinUrl) {
    linkedinUrl = existingLinkedinUrl;
  }

  // --- Step 2: CV path ---
  const envCvPath = process.env['JHO_CV_PATH'];
  let cvPath = (opts.cv ?? envCvPath)?.trim() || undefined;

  if (!cvPath && !opts.yes) {
    const input = await text({
      message: 'Path to your CV file (PDF, DOCX, MD, TXT)? (optional, press Enter to skip)',
      initialValue: existingCvPath || undefined,
      placeholder: '',
    });

    if (isCancel(input)) {
      throw new InitCancelled();
    }

    cvPath = input?.trim() || undefined;
  } else if (!cvPath && existingCvPath) {
    cvPath = existingCvPath;
  }

  // Validate CV path with retry loop
  while (cvPath) {
    const result = await validateCvPath(cvPath);

    if (result.ok) {
      break;
    }

    // In --yes mode, silently skip invalid CV instead of prompting
    if (opts.yes) {
      clackLog.warn(`CV path invalid in non-interactive mode, skipping: ${result.error}`);
      cvPath = undefined;
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
      cvPath = retry.trim();
    }
  }

  // --- Step 2: GitHub ---
  const github = await promptGithub(opts.github, opts.yes ?? false, existingConfig);

  // --- Step 3: LLM config ---
  const llm = await promptLlm(opts.yes ?? false, existingConfig);

  const hasLlm = llm.baseUrl && llm.model;
  // apiKey is optional for local LLMs; fall back to default ('no-key') when empty
  const llmConfig: LlmConfig | undefined = hasLlm
    ? {
        baseUrl: llm.baseUrl!,
        apiKey: llm.apiKey || DEFAULT_LLM_API_KEY,
        model: llm.model!,
        timeoutMs: existingConfig?.llm.timeoutMs ?? 600_000,
      }
    : undefined;

  // --- Step 4: Calendar ---
  const calendarProvider = await promptCalendar(opts.yes ?? false, existingConfig);

  // --- Steps 5-8: Directory creation, config writes, profile (locked) ---
  // Ensure campaign root exists before locking (proper-lockfile requires the path).
  await ensureRoot(campaignRoot);
  await acquireLock(
    campaignRoot,
    async () => {
      // --- Step 5: Create directory structure ---
      const { kbDir } = await createDirectories(campaignRoot);

      // --- Step 6: Write configs early (so CV path is saved even if profile build fails) ---
      const profilePath = resolveProfilePath(campaignRoot);

      // Deep-merge calendar and logging to preserve user-customised values on re-init.
      const currentConfig = loadGlobalConfig();
      updateGlobalConfig({
        version: 1,
        dataRoot,
        llm: {
          baseUrl: llm.baseUrl || DEFAULT_LLM_BASE_URL,
          apiKey: llm.apiKey || DEFAULT_LLM_API_KEY,
          model: llm.model || DEFAULT_LLM_MODEL,
          timeoutMs: currentConfig.llm.timeoutMs,
        },
        github: {
          user: github.user ?? '',
          token: github.token ?? '',
          repos: [],
        },
        calendar: {
          ...currentConfig.calendar,
          defaultProvider: calendarProvider,
        },
        logging: {
          ...currentConfig.logging,
          level: DEFAULT_LOG_LEVEL,
          disableFileLogging: currentConfig.logging?.disableFileLogging ?? false,
          redactPaths: currentConfig.logging?.redactPaths ?? [],
        },
      });

      updateCampaignConfig(name, {
        version: 1,
        profile: { path: profilePath },
        cv: { path: cvPath ?? '' },
        linkedin: { url: linkedinUrl ?? '' },
        knowledgeBase: { dir: kbDir },
      });

      // --- Step 7: Profile build (may fail — config is already saved) ---
      // Backup existing profile before overwriting on re-init.
      if (await pathExists(profilePath)) {
        const backupsDir = join(campaignRoot, 'backups');
        await mkdir(backupsDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
        const backupPath = join(backupsDir, `profile.${ts}.md.bak`);
        await copyFile(profilePath, backupPath);
        clackLog.info(`Previous profile backed up to ${backupPath}`);
      }

      await handleProfile({
        campaignRoot,
        profileFlag: opts.profile,
        cvPath,
        githubUser: github.user,
        githubToken: github.token,
        linkedinUrl,
        llmConfig,
        nonInteractive: opts.yes ?? false,
        log,
      });
    },
    { retries: 3 },
  );

  // --- Step 9: Summary ---
  log.info({ campaign: name }, 'init.wizard.completed');
  clackLog.success(`Campaign "${name}" created`);
  clackLog.info(`
  Profile: ${resolveProfilePath(campaignRoot)}
  ${linkedinUrl ? `LinkedIn: ${linkedinUrl}` : 'LinkedIn: (not set)'}
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
