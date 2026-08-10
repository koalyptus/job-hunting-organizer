import { confirm, isCancel, log as clackLog } from '@clack/prompts';
import { resolveCampaignRoot, resolveDataRoot, resolveProfilePath, ensureRoot } from '../paths.js';
import { pathExists } from '../fs.js';
import { validateName } from '../validate.js';
import { acquireLock } from '../locks.js';
import type { InitOptions } from './types.js';
import { DEFAULT_CAMPAIGN } from './constants.js';
import {
  promptLinkedin,
  promptCvPath,
  promptKbPath,
  validateCvWithRetry,
  loadExistingCampaignValues,
} from './init-inputs.js';
import { promptGithub } from './github.js';
import { promptLlm, loadExistingConfig, detectLocalBackend, buildLlmConfig } from './llm.js';
import { runLockedInitSteps, printInitSummary } from './init-write.js';
import { InitCancelled, InitInvalidNameError } from './errors.js';
import { childLogger } from '../logger/logger.js';

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
  const detectedLlmSuggestion = opts.yes ? undefined : await detectLocalBackend(log);

  // --- Step 3: LLM config ---
  const llm = await promptLlm(opts.yes ?? false, existingConfig, detectedLlmSuggestion);

  const llmConfig = buildLlmConfig(llm, existingConfig);

  // --- Steps 4-7: Directory creation, config writes, profile (locked) ---
  // Ensure campaign root exists before locking (proper-lockfile requires the path).
  await ensureRoot(campaignRoot);
  await acquireLock(
    campaignRoot,
    () =>
      runLockedInitSteps({
        campaignRoot,
        name,
        dataRoot,
        kbPath,
        cvPath: cvPathResolved,
        linkedinUrl,
        github,
        llm,
        llmConfig,
        profileFlag: opts.profile,
        nonInteractive: opts.yes ?? false,
        log,
      }),
    { retries: 3 },
  );

  // --- Step 9: Summary ---
  log.info({ campaign: name }, 'init.wizard.completed');
  printInitSummary(name, {
    profilePath: resolveProfilePath(campaignRoot),
    linkedinUrl,
    cvPath: cvPathResolved,
    githubUser: github.user,
    hasLlm: Boolean(llm.baseUrl && llm.model),
    baseUrl: llm.baseUrl,
    model: llm.model,
  });
}
