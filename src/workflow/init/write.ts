import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { log as clackLog } from '@clack/prompts';
import type { Logger } from 'pino';
import { pathExists } from '../../core/fs.js';
import {
  updateGlobalConfig,
  updateCampaignConfig,
  loadGlobalConfig,
  loadCampaignConfig,
} from '../../core/config/config.js';
import { resolveProfilePath, resolveMyVoicePath } from '../../core/paths.js';
import { toDateKey } from '../../core/date.js';
import { createDirectories } from '../../core/campaign/directories.js';
import { ingestKnowledgeBase as ingestKbDocs } from '../../core/campaign/kb-ingest.js';
import { handleProfile } from '../../core/campaign/profile-builder.js';
import { generateVoiceGuideSkeleton } from './skeleton.js';
import {
  DEFAULT_LOG_LEVEL,
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_API_KEY,
  DEFAULT_LLM_MODEL,
} from './constants.js';
import type { LlmConfig } from '../../core/types.js';
import type { GithubPrefs, LlmPrefs } from './types.js';

/** Inputs for the locked init write steps (Steps 7-11). */
interface InitWriteOptions {
  campaignRoot: string;
  name: string;
  dataRoot: string;
  kbPath?: string;
  cvPath?: string;
  linkedinUrl?: string;
  github: GithubPrefs;
  llm: LlmPrefs;
  llmConfig?: LlmConfig;
  profileFlag?: string;
  nonInteractive: boolean;
  log: Logger;
}

/**
 * All filesystem/config/profile steps of the init wizard, run under the
 * campaign lock. Configs are written before the profile build so a profile
 * failure still leaves a usable campaign.
 */
export async function runLockedInitSteps(opts: InitWriteOptions): Promise<void> {
  const { campaignRoot, name, log } = opts;

  // --- Step 7: Create directory structure ---
  const { kbDir } = await createDirectories(campaignRoot);

  // --- Step 8: Ingest optional knowledge-base source ---
  const kbSources = await copyAndRecordKbSources(campaignRoot, opts.kbPath, kbDir);

  // --- Step 9: Scaffold the personal voice guide (never overwrite) ---
  await scaffoldVoiceGuide(campaignRoot);

  // --- Step 10: Write configs early (so CV path is saved even if profile build fails) ---
  const profilePath = resolveProfilePath(campaignRoot);
  writeInitGlobalConfig(opts.dataRoot, opts.llm, opts.github);
  writeInitCampaignConfig(name, profilePath, opts.cvPath, opts.linkedinUrl, kbDir, kbSources);

  // --- Step 11: Profile build (may fail — config is already saved) ---
  await backupExistingProfile(campaignRoot, profilePath);
  await handleProfile({
    campaignRoot,
    profileFlag: opts.profileFlag,
    cvPath: opts.cvPath,
    githubUser: opts.github.user,
    githubToken: opts.github.token,
    linkedinUrl: opts.linkedinUrl,
    llmConfig: opts.llmConfig,
    nonInteractive: opts.nonInteractive,
    maxChars: loadCampaignConfig(name).knowledgeBase.maxChars,
    log,
  });
}

/** Ingest the optional knowledge-base source; returns the recorded sources. */
async function copyAndRecordKbSources(
  campaignRoot: string,
  kbPath: string | undefined,
  kbDir: string,
): Promise<string[]> {
  const kbSources: string[] = [];
  if (!kbPath) {
    return kbSources;
  }

  const kbSourceAbs = resolve(campaignRoot, kbPath);
  const copied = await ingestKbDocs(campaignRoot, kbSourceAbs);
  if (copied.length > 0) {
    kbSources.push(kbSourceAbs);
    clackLog.info(`Copied ${copied.length} knowledge-base doc(s) into ${kbDir}`);
  } else {
    clackLog.warn(`No supported docs found at ${kbPath} (expected PDF, DOCX, MD, TXT)`);
  }
  return kbSources;
}

/**
 * Scaffold the personal voice guide template. Fail-soft: a read-only KB dir
 * must not abort init before configs are written.
 */
async function scaffoldVoiceGuide(campaignRoot: string): Promise<void> {
  const voicePath = resolveMyVoicePath(campaignRoot);
  if (await pathExists(voicePath)) {
    return;
  }

  try {
    await writeFile(voicePath, generateVoiceGuideSkeleton(), 'utf8');
    clackLog.info(`Created voice guide template at ${voicePath}`);
  } catch (err) {
    clackLog.warn(
      `Could not create voice guide template at ${voicePath}: ${(err as Error).message}`,
    );
  }
}

/**
 * Write the global config, deep-merging logging to preserve user-customised
 * values on re-init.
 */
function writeInitGlobalConfig(dataRoot: string, llm: LlmPrefs, github: GithubPrefs): void {
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
}

/** Write the campaign config (profile/cv/linkedin/knowledge-base). */
function writeInitCampaignConfig(
  name: string,
  profilePath: string,
  cvPath: string | undefined,
  linkedinUrl: string | undefined,
  kbDir: string,
  kbSources: string[],
): void {
  updateCampaignConfig(name, {
    version: 1,
    profile: { path: profilePath },
    cv: { path: cvPath ?? '' },
    linkedin: { url: linkedinUrl ?? '' },
    knowledgeBase: { dir: kbDir, sources: kbSources },
  });
}

/** Back up an existing profile before overwriting it on re-init. */
async function backupExistingProfile(campaignRoot: string, profilePath: string): Promise<void> {
  if (!(await pathExists(profilePath))) {
    return;
  }

  const backupsDir = join(campaignRoot, 'backups');
  await mkdir(backupsDir, { recursive: true });
  const now = new Date();
  const datePart = toDateKey(now);
  const timePart = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('-');
  const ts = `${datePart}_${timePart}`;
  const backupPath = join(backupsDir, `profile.${ts}.md.bak`);
  await copyFile(profilePath, backupPath);
  clackLog.info(`Previous profile backed up to ${backupPath}`);
}

/** Step 12: print the init summary. */
export function printInitSummary(
  name: string,
  summary: {
    profilePath: string;
    linkedinUrl: string | undefined;
    cvPath: string | undefined;
    githubUser: string | undefined;
    hasLlm: boolean;
    baseUrl: string | undefined;
    model: string | undefined;
  },
  voicePath?: string,
): void {
  clackLog.success(`Campaign "${name}" created`);
  clackLog.info(`
  Profile: ${summary.profilePath}
  ${summary.linkedinUrl ? `LinkedIn: ${summary.linkedinUrl}` : 'LinkedIn: (not set)'}
  ${summary.cvPath ? `CV: ${summary.cvPath}` : 'CV: (not set)'}
  ${summary.githubUser ? `GitHub: ${summary.githubUser}` : 'GitHub: (not set)'}
  LLM: ${summary.hasLlm ? `${summary.baseUrl} (${summary.model})` : '(not configured)'}

Next steps:
  jho track <job-url>              # record a new application
  jho profile show                 # view your profile
  jho campaign config show         # view campaign config
${voicePath ? `  edit ${voicePath}  # personalise your writing voice` : ''}
`);
}
