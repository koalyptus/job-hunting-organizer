import { Command } from 'commander';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { resolveSlug } from '../slug.js';
import { diagnoseCampaign, diagnoseApp, DoctorError } from '../../core/doctor/index.js';
import type { DoctorIssue } from '../../core/doctor/types.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';
import { userError, userOutput } from '../output.js';
import { withSpinner } from '../../core/spinner.js';
import type { GlobalOpts } from '../options.js';
import { resolveCampaign } from '../campaign.js';
import { detectAgents } from 'detect-local-agents';
import {
  BACKEND_NAME_OLLAMA,
  BACKEND_NAME_LMSTUDIO,
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_MODEL,
  DEFAULT_LMSTUDIO_BASE_URL,
  LMSTUDIO_DEFAULT_MODEL,
  DETECT_AGENTS_TIMEOUT_MS,
} from '../../core/init/constants.js';

/**
 * Run a promise with a timeout. Rejects with error if timeout exceeded.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Detection timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * Get the default base URL for a detected backend.
 */
function getBackendBaseUrl(name: string): string {
  return name === BACKEND_NAME_OLLAMA ? DEFAULT_LLM_BASE_URL : DEFAULT_LMSTUDIO_BASE_URL;
}

/**
 * Get the default model for a detected backend.
 */
function getBackendModel(name: string): string {
  return name === BACKEND_NAME_OLLAMA ? DEFAULT_LLM_MODEL : LMSTUDIO_DEFAULT_MODEL;
}

/**
 * `jho doctor --detect-agents` — detect local OpenAI-compatible backends and display results.
 * This is a global operation, not campaign-specific.
 */
async function detectAndDisplayAgents(): Promise<void> {
  userOutput('Detecting local OpenAI-compatible backends...');

  try {
    const agents = await withTimeout(detectAgents(), DETECT_AGENTS_TIMEOUT_MS);
    const backends = agents.filter(
      (a) =>
        (a.name === BACKEND_NAME_OLLAMA || a.name === BACKEND_NAME_LMSTUDIO) &&
        a.isConfigured,
    );

    if (backends.length === 0) {
      userOutput('No local OpenAI-compatible backend detected.');
      userOutput('Install Ollama (free, private): curl -fsSL ollama.com/install.sh');
      userOutput('Or enter your OpenAI API key manually during `jho init`.');
      return;
    }

    userOutput('Local OpenAI-compatible backends:');
    for (const b of backends) {
      userOutput(`  ✅ ${b.name} — ${b.binary} ${b.version ?? ''}`);
      userOutput(`     baseUrl: ${getBackendBaseUrl(b.name)}`);
    }

    // Suggest the first detected backend
    const suggestedBackend = backends[0]!;
    userOutput('');
    userOutput('Suggested LLM config for jho:');
    userOutput(`  baseUrl: ${getBackendBaseUrl(suggestedBackend.name)}`);
    userOutput(`  model: ${getBackendModel(suggestedBackend.name)}`);
  } catch {
    userError('Agent detection failed');
    process.exit(1);
  }
}

/**
 * Severity icon for doctor issues.
 */
function severityIcon(severity: string): string {
  switch (severity) {
    case 'error':
      return 'ERROR';
    case 'warn':
      return 'WARN';
    case 'info':
      return 'INFO';
    default:
      return severity.toUpperCase();
  }
}

/**
 * Format doctor issues as readable output.
 */
function formatIssues(label: string, issues: DoctorIssue[]): string {
  if (issues.length === 0) {
    return `${label} — healthy`;
  }

  const lines = [`${label} — ${issues.length} issue(s) found`, ''];

  for (const issue of issues) {
    const slugPart = issue.slug ? ` (${issue.slug})` : '';
    lines.push(`  [${issue.check}] ${severityIcon(issue.severity)} ${issue.message}${slugPart}`);
    lines.push(`    ${issue.remediation}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * `jho doctor [<slug>]` — diagnose the campaign or a single application.
 */
export const doctorCommand = new Command('doctor')
  .description('Diagnose the campaign or a single application (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .option(
    '--detect-agents',
    'detect local OpenAI-compatible backends and show recommended LLM config (global, not campaign-specific)',
  )
  .action(async function (slug: string | undefined) {
    const opts = this.opts() as { detectAgents?: boolean };

    // --detect-agents is a global command, bypass campaign selection
    if (opts.detectAgents) {
      await detectAndDisplayAgents();
      return;
    }

    const globals = this.parent?.opts() as GlobalOpts | undefined;
    const campaign = await resolveCampaign(globals);
    const log = getRootLogger().child({ cmd: 'doctor', campaign });

    try {
      const campaignRoot = resolveCampaignRoot(campaign);

      if (slug) {
        // Single app diagnosis
        const resolvedSlug = resolveSlug(slug, campaign);
        const appliedDir = resolveAppliedDir(campaignRoot);

        const issues = await withSpinner(
          `Diagnosing ${resolvedSlug}...`,
          'Diagnosis complete',
          () => diagnoseApp(appliedDir, resolvedSlug),
          'Diagnosis failed',
        );

        userOutput(formatIssues(`Application: ${resolvedSlug}`, issues));
        log.info({ slug: resolvedSlug, issueCount: issues.length }, 'doctor.app.completed');
      } else {
        // Campaign-wide diagnosis
        const issues = await withSpinner(
          'Diagnosing campaign...',
          'Diagnosis complete',
          () => diagnoseCampaign(campaignRoot),
          'Diagnosis failed',
        );

        userOutput(formatIssues(`Campaign: ${campaign}`, issues));
        log.info({ campaign, issueCount: issues.length }, 'doctor.campaign.completed');
      }
    } catch (err) {
      if (err instanceof DoctorError) {
        logError(log, err, 'doctor.failed', { campaign });
        log.flush();
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

doctorCommand.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory
— run from inside an application folder (e.g. cd applied/<slug>) to skip it,
or omit it to diagnose the entire campaign.

Examples:
  $ jho doctor                                        # diagnose the campaign
  $ jho doctor 2026-Jan-15-frontend-acme-12345         # diagnose one application
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho doctor  # infer from cwd
  $ jho doctor --detect-agents                         # detect local LLM backends
`,
);
