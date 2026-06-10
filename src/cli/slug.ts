import { resolveCampaignRoot, resolveAppliedDir, findSlugFromCwd } from '../core/paths.js';

/**
 * Resolve the slug for a command that accepts `[<slug>]`.
 *
 * Resolution order:
 * 1. Explicit slug argument (if provided).
 * 2. Cwd inference — walks up from `process.cwd()` looking for a
 *    directory whose name matches the slug pattern under `applied/`.
 * 3. Exit with error and a hint if neither yields a slug.
 *
 * @param explicitSlug - The slug passed as a CLI argument, or `undefined`.
 * @param campaign - The campaign name (from `--campaign` or cwd-inferred).
 * @returns The resolved slug.
 */
export function resolveSlug(explicitSlug: string | undefined, campaign: string): string {
  if (explicitSlug) {
    return explicitSlug;
  }

  const appliedDir = resolveAppliedDir(resolveCampaignRoot(campaign));
  const inferred = findSlugFromCwd(process.cwd(), appliedDir);

  if (inferred) {
    return inferred;
  }

  process.stderr.write(
    'error: missing <slug> argument\nhint: pass a slug, or run from inside the application folder (e.g. cd applied/<slug>)\n',
  );
  process.exit(1);
}
