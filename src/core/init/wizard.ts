import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { confirm, isCancel, log as clackLog } from '@clack/prompts';
import {
  resolveCampaignRoot,
  resolveDataRoot,
  resolveProfilePath,
  resolveMyVoicePath,
  ensureRoot,
} from '../paths.js';
import { pathExists } from '../fs.js';
import {
  updateGlobalConfig,
  updateCampaignConfig,
  loadGlobalConfig,
  loadCampaignConfig,
} from '../config/config.js';
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
  BACKEND_NAME_OLLAMA,
  BACKEND_NAME_LMSTUDIO,
  DEFAULT_LMSTUDIO_BASE_URL,
  LMSTUDIO_DEFAULT_MODEL,
} from './constants.js';
import { promptLinkedin, promptCvPath, promptKbPath, validateCvWithRetry, loadExistingCampaignValues } from './init-inputs.js';
import { promptGithub } from './github.js';
import { promptLlm, loadExistingConfig, type DetectedLlmSuggestion } from './llm.js';
import { createDirectories } from '../campaign/directories.js';
import { ingestKnowledgeBase } from '../campaign/kb-ingest.js';
import { handleProfile } from '../campaign/profile-builder.js';
import { generateVoiceGuideSkeleton } from './skeleton.js';
import { InitCancelled, InitInvalidNameError } from './errors.js';
import { childLogger } from '../logger/logger.js';
import { detectAgents } from 'detect-local-agents';

/**
 * Run the init wizard. Called from the CLI command.
 * @throws {InitCancelled} if the user cancels any prompt.
 * @throws {InitInvalidNameError} if the campaign name is invalid.
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

  // --- Steps 1-2b: collect inputs ---
  // Load existing configs early for pre-filling prompts.
  const existingConfig = loadExistingConfig();
  const existing = await loadExistingCampaignValues(name, log);

  const linkedinUrl = await promptLinkedin(opts, existing.linkedinUrl);
  const cvPath = await promptCvPath(opts, existing.cvPath);
  const kbPath = await promptKbPath(opts);
  const cvPathResolved = await validateCvWithRetry(cvPath, opts.yes ?? false);

  // --- Step 2: GitHub ---
  const github = await promptGithub(opts.github, opts.yes ?? false, existingConfig);

  // --- Step 2b: Detect local OpenAI-compatible backends ---
  // Supports Ollama and LM Studio. Uses binary presence to check if the backend
  // is actually configured (not just installed).
  let detectedLlmSuggestion: DetectedLlmSuggestion | undefined | undefined;
  if (!opts.yes) {
    try {
      const agents = await detectAgents();
      const ollama = agents.find((a) => a.name === BACKEND_NAME_OLLAMA && a.binary);
      const lmstudio = agents.find((a) => a.name === BACKEND_NAME_LMSTUDIO && a.binary);

      if (ollama) {
        detectedLlmSuggestion = {
          baseUrl: DEFAULT_LLM_BASE_URL,
          model: DEFAULT_LLM_MODEL,
        };
        clackLog.info(
          `Detected Ollama → suggested baseUrl: ${DEFAULT_LLM_BASE_URL}, model: ${DEFAULT_LLM_MODEL} (${ollama.binary} ${ollama.version ?? ''})`,
        );
      } else if (lmstudio) {
        detectedLlmSuggestion = {
          baseUrl: DEFAULT_LMSTUDIO_BASE_URL,
          model: LMSTUDIO_DEFAULT_MODEL,
        };
        clackLog.info(
          `Detected LM Studio → suggested baseUrl: ${DEFAULT_LMSTUDIO_BASE_URL}, model: ${LMSTUDIO_DEFAULT_MODEL} (${lmstudio.binary} ${lmstudio.version ?? ''})`,
        );
      } else {
        clackLog.warn(
          'No local OpenAI-compatible backend detected. Install Ollama (free, private) or enter API key manually.',
        );
      }
    } catch (err) {
      log.debug({ err }, 'detect-local-agents.failed');
      clackLog.warn('Agent detection failed, continuing with manual LLM config');
    }
  }

  // --- Step 3: LLM config ---
  const llm = await promptLlm(opts.yes ?? false, existingConfig, detectedLlmSuggestion);

  const hasLlm = llm.baseUrl && llm.model;
  // apiKey is optional for local LLMs; fall back to default ('no-key') when empty
  const llmConfig: LlmConfig | undefined = hasLlm
    ? {
        baseUrl: llm.baseUrl!,
        apiKey: llm.apiKey || DEFAULT_LLM_API_KEY,
        model: llm.model!,
        timeoutMs: existingConfig?.llm.timeoutMs ?? 1_200_000,
      }
    : undefined;

  // --- Steps 4-7: Directory creation, config writes, profile (locked) ---
  // Ensure campaign root exists before locking (proper-lockfile requires the path).
  await ensureRoot(campaignRoot);
  await acquireLock(
    campaignRoot,
    async () => {
      // --- Step 5: Create directory structure ---
      const { kbDir } = await createDirectories(campaignRoot);

      // --- Step 5b: Ingest optional knowledge-base source ---
      const kbSources: string[] = [];
      if (kbPath) {
        const kbSourceAbs = resolve(campaignRoot, kbPath);
        const copied = await ingestKnowledgeBase(campaignRoot, kbSourceAbs);
        if (copied.length > 0) {
          kbSources.push(kbSourceAbs);
          clackLog.info(`Copied ${copied.length} knowledge-base doc(s) into ${kbDir}`);
        } else {
          clackLog.warn(`No supported docs found at ${kbPath} (expected PDF, DOCX, MD, TXT)`);
        }
      }

      // --- Step 5c: Scaffold the personal voice guide (never overwrite) ---
      const voicePath = resolveMyVoicePath(campaignRoot);
      if (!(await pathExists(voicePath))) {
        try {
          await writeFile(voicePath, generateVoiceGuideSkeleton(), 'utf8');
          clackLog.info(`Created voice guide template at ${voicePath}`);
        } catch (err) {
          // Fail-soft: a read-only KB dir must not abort init before configs are written (Step 6).
          clackLog.warn(
            `Could not create voice guide template at ${voicePath}: ${(err as Error).message}`,
          );
        }
      }

      // --- Step 6: Write configs early (so CV path is saved even if profile build fails) ---
      const profilePath = resolveProfilePath(campaignRoot);

      // Deep-merge logging to preserve user-customised values on re-init.
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
        cv: { path: cvPathResolved ?? '' },
        linkedin: { url: linkedinUrl ?? '' },
        knowledgeBase: { dir: kbDir, sources: kbSources },
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
        cvPath: cvPathResolved,
        githubUser: github.user,
        githubToken: github.token,
        linkedinUrl,
        llmConfig,
        nonInteractive: opts.yes ?? false,
        maxChars: loadCampaignConfig(name).knowledgeBase.maxChars,
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
  ${cvPathResolved ? `CV: ${cvPathResolved}` : 'CV: (not set)'}
  ${github.user ? `GitHub: ${github.user}` : 'GitHub: (not set)'}
  LLM: ${hasLlm ? `${llm.baseUrl} (${llm.model})` : '(not configured)'}

Next steps:
  jho track <job-url>       # record a new application
  jho profile show          # view your profile
  jho campaign config show  # view campaign config
`);
}
