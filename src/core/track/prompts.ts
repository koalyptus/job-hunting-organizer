import { confirm, isCancel, log as clackLog } from '@clack/prompts';
import type { ExtractedJd, RoleSuggestion } from '../jobs/types.js';
import type { TargetRole } from '../types.js';
import type { ApplicationStatus } from '../applications/types.js';

/**
 * Format and display a summary of the extracted JD and suggested role,
 * then ask the user to confirm creation.
 *
 * @param jd - The extracted job description.
 * @param suggestion - The LLM role suggestion.
 * @param targetRoles - All target roles from the profile (for display).
 * @param campaign - The campaign name to display in the confirmation.
 * @returns `true` if the user confirmed, `false` if cancelled.
 */
export async function confirmTrackSummary(
  jd: ExtractedJd,
  suggestion: RoleSuggestion,
  targetRoles: TargetRole[],
  campaign: string,
): Promise<boolean> {
  clackLog.info('Extracted job description:');
  process.stdout.write(`  Title:    ${jd.title}\n`);
  process.stdout.write(`  Company:  ${jd.company}\n`);
  if (jd.location) {
    process.stdout.write(`  Location: ${jd.location}\n`);
  }
  if (jd.salary) {
    process.stdout.write(`  Salary:   ${jd.salary}\n`);
  }
  if (jd.tags?.length) {
    process.stdout.write(`  Tags:     ${jd.tags.join(', ')}\n`);
  }

  if (suggestion.roleSlug) {
    const role = targetRoles.find((r) => r.slug === suggestion.roleSlug);
    const title = role?.title ?? suggestion.roleSlug;
    const confidence = Math.round(suggestion.confidence * 100);
    process.stdout.write(`\n  Suggested role: ${title} (${confidence}% confidence)\n`);
    process.stdout.write(`  Reasoning: ${suggestion.reasoning}\n`);
  } else {
    process.stdout.write('\n  No matching target role found.\n');
  }

  const confirmed = await confirm({
    message: `Track this application? Will save to campaign "${campaign}".`,
    initialValue: true,
  });

  if (isCancel(confirmed) || !confirmed) {
    return false;
  }

  return true;
}

/**
 * Show the current application state and proposed changes, then ask
 * the user to confirm the update.
 *
 * @param slug - The application slug.
 * @param currentStatus - The current status.
 * @param changes - A human-readable summary of what will change.
 * @returns `true` if the user confirmed, `false` if cancelled.
 */
export async function confirmTrackUpdate(
  slug: string,
  currentStatus: ApplicationStatus,
  changes: string[],
): Promise<boolean> {
  clackLog.info(`Application: ${slug} (status: ${currentStatus})`);
  process.stdout.write('  Changes:\n');
  for (const change of changes) {
    process.stdout.write(`    ${change}\n`);
  }

  const confirmed = await confirm({
    message: 'Apply these changes?',
    initialValue: true,
  });

  if (isCancel(confirmed) || !confirmed) {
    return false;
  }

  return true;
}
