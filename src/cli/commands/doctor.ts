import { Command } from 'commander';
import { resolveCampaignName, resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { resolveSlug } from '../slug.js';
import { diagnoseCampaign, diagnoseApp, DoctorError } from '../../core/doctor/index.js';
import type { DoctorIssue } from '../../core/doctor/types.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';
import { userError, userOutput } from '../output.js';
import { withSpinner } from '../../core/spinner.js';
import type { GlobalOpts } from '../options.js';

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
  .action(async function (slug: string | undefined) {
    const globals = this.parent?.opts() as GlobalOpts | undefined;
    const campaign = resolveCampaignName(globals?.campaign);
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
  $ jho doctor                                                # diagnose the campaign
  $ jho doctor 2026-Jan-15-frontend-acme-12345                # diagnose one application
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho doctor  # infer from cwd
`,
);
