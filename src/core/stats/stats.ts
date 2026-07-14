import { existsSync } from 'node:fs';
import { listApplications, readApplication } from '../applications/applications.js';
import { APPLICATION_STATUSES } from '../applications/types.js';
import type { ApplicationStatus } from '../applications/types.js';
import type { CampaignStats, StatsOptions } from '../types.js';
import { parseSince, toIsoDateString } from '../date.js';
import { InvalidSinceError } from './errors.js';
import { moduleLogger } from '../logger/logger.js';

const log = moduleLogger(import.meta.url);

const ACCEPTED_HEURISTIC = /accepted|joining/i;

/**
 * Compute a campaign snapshot: counts by status, role, site, funnel,
 * and this-month delta. Pure read — no LLM, no writes.
 *
 * @param appliedDir - Absolute path to the campaign's `applied/` directory.
 * @param opts - Optional filters (target role, since date).
 * @returns The computed stats.
 */
export async function computeStats(
  appliedDir: string,
  opts?: StatsOptions,
): Promise<CampaignStats> {
  let entries = await listApplications(appliedDir);
  log.debug({ count: entries.length }, 'stats.loaded');

  if (entries.length === 0) {
    return emptyStats();
  }

  // Apply since filter
  let sinceFilterIso: string | undefined;
  if (opts?.since) {
    let resolvedSince: string;
    try {
      const sinceDate = parseSince(opts.since);
      resolvedSince = toIsoDateString(sinceDate);
    } catch {
      throw new InvalidSinceError(opts.since);
    }
    sinceFilterIso = resolvedSince;
    entries = entries.filter((e) => e.appliedOn >= resolvedSince);
  }

  if (entries.length === 0) {
    return emptyStats(sinceFilterIso);
  }

  // Apply targetRole filter
  if (opts?.targetRole) {
    entries = entries.filter((e) => e.targetRole === opts.targetRole);
  }

  if (entries.length === 0) {
    return emptyStats(sinceFilterIso);
  }

  // Apply employmentType filter
  if (opts?.employmentType) {
    entries = entries.filter((e) => e.employmentType === opts.employmentType);
  }

  if (entries.length === 0) {
    return emptyStats(sinceFilterIso);
  }

  // Single pass: byStatus, byRole, bySite, byEmploymentType, thisMonth, since
  const byStatus = initByStatus();
  const byRole: Record<string, number> = {};
  const bySite: Record<string, number> = {};
  const byEmploymentType: Record<string, number> = {};
  const now = new Date();
  const currentMonth = now.getUTCMonth();
  const currentYear = now.getUTCFullYear();
  const thisMonth = { applied: 0, rejected: 0, offer: 0, withdrawn: 0 };
  let earliestAppliedOn: string | undefined;

  for (const e of entries) {
    // byStatus
    byStatus[e.status]++;

    // byRole
    const roleKey = e.targetRole || '';
    byRole[roleKey] = (byRole[roleKey] || 0) + 1;

    // bySite
    const siteKey = e.site || '';
    bySite[siteKey] = (bySite[siteKey] || 0) + 1;

    // byEmploymentType
    const typeKey = e.employmentType || '';
    byEmploymentType[typeKey] = (byEmploymentType[typeKey] || 0) + 1;

    // thisMonth
    const d = new Date(e.appliedOn);
    if (d.getUTCMonth() === currentMonth && d.getUTCFullYear() === currentYear) {
      switch (e.status) {
        case 'applied':
          thisMonth.applied++;
          break;
        case 'rejected':
          thisMonth.rejected++;
          break;
        case 'offer':
          thisMonth.offer++;
          break;
        case 'withdrawn':
          thisMonth.withdrawn++;
          break;
      }
    }

    // earliest appliedOn
    if (earliestAppliedOn === undefined || e.appliedOn < earliestAppliedOn) {
      earliestAppliedOn = e.appliedOn;
    }
  }

  // Funnel
  const funnel = {
    applied: byStatus.applied,
    interview: byStatus.interview,
    offer: byStatus.offer,
    accepted: byStatus.accepted,
  };

  // Accepted heuristic: offer apps whose meta.md body matches /accepted|joining/i
  if (existsSync(appliedDir)) {
    for (const e of entries) {
      if (e.status !== 'offer') {
        continue;
      }
      try {
        const { body } = await readApplication(appliedDir, e.slug);
        if (ACCEPTED_HEURISTIC.test(body)) {
          log.debug({ slug: e.slug }, 'stats.accepted_heuristic.match');
          funnel.accepted++;
          funnel.offer--;
        }
      } catch {
        log.debug({ slug: e.slug }, 'could not read meta.md for accepted heuristic');
      }
    }
  }

  return {
    total: entries.length,
    byStatus,
    byRole,
    bySite,
    byEmploymentType,
    funnel,
    thisMonth,
    since: earliestAppliedOn,
  };
}

function initByStatus(): Record<ApplicationStatus, number> {
  const result: Record<string, number> = {};
  for (const s of APPLICATION_STATUSES) {
    result[s] = 0;
  }
  return result as Record<ApplicationStatus, number>;
}

function emptyStats(since?: string): CampaignStats {
  return {
    total: 0,
    byStatus: initByStatus(),
    byRole: {},
    bySite: {},
    byEmploymentType: {},
    funnel: { applied: 0, interview: 0, offer: 0, accepted: 0 },
    thisMonth: { applied: 0, rejected: 0, offer: 0, withdrawn: 0 },
    since: since ? since : undefined,
  };
}
