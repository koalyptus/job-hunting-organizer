/**
 * Cross-app weak topic aggregation for `jho retro --aggregate`.
 * Pure text analysis — no LLM calls.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathExists } from '../fs.js';
import { listApplications } from '../applications/applications.js';
import { parseRetroFile } from './retro.js';
import { moduleLogger } from '../logger/logger.js';
import type { AggregatedTopic, AggregateOptions } from './types.js';

const log = moduleLogger(import.meta.url);

/**
 * Scan all application retro.md files under an `applied/` directory and
 * aggregate weak topics across them. Returns ranked results by frequency.
 *
 * @param appliedDir - Absolute path to the campaign's `applied/` directory.
 * @param options - Optional filters (role, includeAbandoned, minOccurrences).
 * @returns Sorted array of aggregated topics (most frequent first).
 */
export async function aggregateRetros(
  appliedDir: string,
  options?: AggregateOptions,
): Promise<AggregatedTopic[]> {
  const entries = await listApplications(appliedDir);

  // Filter by target role
  let filteredApplications = entries;
  if (options?.role) {
    filteredApplications = filteredApplications.filter((app) => app.targetRole === options.role);
  }

  // Filter by status (exclude abandoned unless includeAbandoned)
  if (!options?.includeAbandoned) {
    filteredApplications = filteredApplications.filter((app) => app.status !== 'abandoned');
  }

  // Collect topic → set of app slugs
  const topicMap = new Map<string, Set<string>>();

  for (const application of filteredApplications) {
    const retroPath = join(appliedDir, application.slug, 'retro.md');
    if (!(await pathExists(retroPath))) {
      continue;
    }

    try {
      const content = await readFile(retroPath, 'utf8');
      const sections = parseRetroFile(content);

      for (const section of sections) {
        for (const weakTopic of section.weakTopics) {
          const label = weakTopic.detail
            ? `${weakTopic.topic} — ${weakTopic.detail}`
            : weakTopic.topic;
          const existing = topicMap.get(label);
          if (existing) {
            existing.add(application.slug);
          } else {
            topicMap.set(label, new Set([application.slug]));
          }
        }
      }
    } catch (err) {
      log.warn({ slug: application.slug, err: String(err) }, 'aggregate.failed-to-read-retro');
    }
  }

  // Build and sort results
  const results: AggregatedTopic[] = [];
  for (const [label, slugs] of topicMap) {
    const count = slugs.size;
    if (options?.minOccurrences !== undefined && count < options.minOccurrences) {
      continue;
    }
    results.push({ label, count, apps: [...slugs].sort() });
  }

  results.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return results;
}
