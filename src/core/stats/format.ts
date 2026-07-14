import type { CampaignStats, Colorize } from '../types.js';
import { resolveStyle } from '../types.js';

/**
 * Render a full campaign stats block as a string.
 * When `colorize` is provided the output includes ANSI styling;
 * otherwise plain text is returned.
 *
 * @param campaignName - The campaign name or label.
 * @param stats - The computed stats.
 * @param colorize - Optional colour functions for console output.
 * @returns The rendered stats block, without a trailing newline.
 */
export function renderFullStats(
  campaignName: string,
  stats: CampaignStats,
  colorize?: Colorize,
): string {
  const style = resolveStyle(colorize);
  const lines: string[] = [];

  // Header
  const sinceLabel = stats.since ? `, since ${stats.since}` : '';
  const header = `Campaign: ${style.cyan(campaignName)}  (${stats.total} application${stats.total === 1 ? '' : 's'}${sinceLabel})`;
  lines.push(style.bold(header));

  // By status
  lines.push('');
  lines.push(style.bold('By status:'));
  for (const [status, count] of Object.entries(stats.byStatus)) {
    if (count > 0) {
      lines.push(`${style.statusColor(status.padEnd(14))} ${count}`);
    }
  }

  // By target role
  lines.push('');
  lines.push(style.bold('By target role:'));
  const roleEntries = Object.entries(stats.byRole).sort((a, b) => b[1] - a[1]);
  for (const [role, count] of roleEntries) {
    const pct = Math.round((count / stats.total) * 100);
    const label = role || '(unassigned)';
    const percentLabel = style.dim(`(${pct}%)`);
    lines.push(`${style.cyan(label.padEnd(14))} ${String(count).padStart(3)}   ${percentLabel}`);
  }

  // By site
  lines.push('');
  lines.push(style.bold('By site:'));
  const siteEntries = Object.entries(stats.bySite).sort((a, b) => b[1] - a[1]);
  for (const [site, count] of siteEntries) {
    const label = site || '(unknown)';
    lines.push(`${style.cyan(label.padEnd(14))} ${count}`);
  }

  // By employment type
  lines.push('');
  lines.push(style.bold('By employment type:'));
  const typeEntries = Object.entries(stats.byEmploymentType).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of typeEntries) {
    const pct = Math.round((count / stats.total) * 100);
    const label = type || '(unspecified)';
    const percentLabel = style.dim(`(${pct}%)`);
    lines.push(`${style.cyan(label.padEnd(14))} ${String(count).padStart(3)}   ${percentLabel}`);
  }

  // Funnel
  const { funnel } = stats;
  const interviewPct = stats.total > 0 ? Math.round((funnel.interview / stats.total) * 100) : 0;
  const offerPct = stats.total > 0 ? Math.round((funnel.offer / stats.total) * 100) : 0;
  const acceptedPct = stats.total > 0 ? Math.round((funnel.accepted / stats.total) * 100) : 0;
  lines.push('');
  lines.push(style.bold('Funnel (lifetime):'));
  const arrow = style.dim(' → ');
  const funnelInner = `applied (${funnel.applied})${arrow}interview (${funnel.interview}, ${interviewPct}%)${arrow}offer (${funnel.offer}, ${offerPct}%)${arrow}accepted (${funnel.accepted}, ${acceptedPct}%)`;
  lines.push(style.dim(`  ${funnelInner}`));

  // This month
  const thisMonthBlock = renderThisMonth(stats, colorize);
  if (thisMonthBlock) {
    lines.push('');
    lines.push(thisMonthBlock);
  }

  return lines.join('\n');
}

/**
 * Render a compact one-line summary for a campaign.
 *
 * @param campaignName - The campaign name.
 * @param stats - The computed stats.
 * @param colorize - Optional colour functions for console output.
 * @returns Two lines: the summary and the funnel.
 */
export function renderCompactStats(
  campaignName: string,
  stats: CampaignStats,
  colorize?: Colorize,
): string {
  const style = resolveStyle(colorize);
  const { funnel } = stats;
  const sinceLabel = stats.since ? ` ${style.dim(`since ${stats.since}`)}` : '';
  const name = style.cyan(campaignName.padEnd(8));
  const count = stats.total > 0 ? style.bold(`${stats.total}`) : `${stats.total}`;
  const line1 = `  ${name} ${count} application${stats.total === 1 ? '' : 's'}${sinceLabel}`;
  const arrow = style.dim(' → ');
  const funnelInner = `applied ${funnel.applied}${arrow}interview ${funnel.interview}${arrow}offer ${funnel.offer}${arrow}accepted ${funnel.accepted}`;
  const line2 = `${style.dim(`  ${funnelInner}`)}\n`;
  return `${line1}\n${line2}`;
}

/**
 * Render the this-month delta block. Returns an empty string when
 * there are no deltas to show.
 *
 * @param stats - The computed stats.
 * @param colorize - Optional colour functions for console output.
 * @returns The rendered this-month block, or an empty string.
 */
export function renderThisMonth(stats: CampaignStats, colorize?: Colorize): string {
  const style = resolveStyle(colorize);
  const { thisMonth } = stats;
  const parts: string[] = [];
  if (thisMonth.applied > 0) {
    parts.push(
      style.green(`+${thisMonth.applied} application${thisMonth.applied === 1 ? '' : 's'}`),
    );
  }
  if (thisMonth.rejected > 0) {
    parts.push(style.red(`-${thisMonth.rejected} rejection${thisMonth.rejected === 1 ? '' : 's'}`));
  }
  if (thisMonth.offer > 0) {
    parts.push(style.green(`+${thisMonth.offer} offer${thisMonth.offer === 1 ? '' : 's'}`));
  }
  if (thisMonth.withdrawn > 0) {
    parts.push(style.dim(`-${thisMonth.withdrawn} withdrawn`));
  }

  if (parts.length === 0) {
    return '';
  }

  const now = new Date();
  const monthName = now.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const year = now.getUTCFullYear();
  const header = `This month (${monthName} ${year}):`;
  return `${style.bold(header)}\n  ${parts.join('  ·  ')}`;
}
