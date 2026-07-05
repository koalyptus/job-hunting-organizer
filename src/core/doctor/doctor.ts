import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readFrontmatter } from '../frontmatter.js';
import { safeValidateApplicationFrontmatter } from '../applications/meta-schema.js';
import { SLUG_PATTERN } from '../slug.js';
import { readToolhash, computeHash, TOOL_MANAGED_FILES } from '../toolhash.js';
import { readIndex, indexPath } from '../applications/index-builder.js';
import { moduleLogger } from '../logger/logger.js';
import type { DoctorIssue } from './types.js';

const log = moduleLogger(import.meta.url);

/**
 * Thrown when a doctor operation encounters a fatal error.
 */
export class DoctorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DoctorError';
  }
}

/**
 * Diagnose campaign-level issues. Checks that the campaign root exists,
 * the applied directory exists, and the config file is valid.
 *
 * @param campaignRoot - Absolute path to the campaign root.
 * @returns Array of diagnostic issues (empty if healthy).
 */
export async function diagnoseCampaign(campaignRoot: string): Promise<DoctorIssue[]> {
  const issues: DoctorIssue[] = [];

  if (!existsSync(campaignRoot)) {
    issues.push({
      severity: 'error',
      category: 'applied',
      check: 'campaign_root_missing',
      message: `Campaign root does not exist: ${campaignRoot}`,
      slug: null,
      remediation: 'Run jho init to create the campaign.',
    });
    return issues;
  }

  const appliedDir = join(campaignRoot, 'applied');
  if (!existsSync(appliedDir)) {
    issues.push({
      severity: 'warn',
      category: 'applied',
      check: 'applied_dir_missing',
      message: `Applied directory does not exist: ${appliedDir}`,
      slug: null,
      remediation: 'Run jho track to create it, or mkdir -p the directory.',
    });
    return issues;
  }

  const configPath = join(campaignRoot, 'config.json');
  if (!existsSync(configPath)) {
    issues.push({
      severity: 'warn',
      category: 'config',
      check: 'campaign_config_missing',
      message: 'Campaign config.json not found — using defaults.',
      slug: null,
      remediation: 'Run jho init to create the campaign config.',
    });
  }

  // Check index integrity — only when the index file exists
  // (a missing index is normal on first run; it's a derived cache)
  if (existsSync(indexPath(appliedDir))) {
    const entries = await readIndex(appliedDir);
    const folders = await readdir(appliedDir, { withFileTypes: true });
    const slugFolders = folders.filter((f) => f.isDirectory() && SLUG_PATTERN.test(f.name));
    const indexSlugs = new Set(entries.map((e) => e.slug));
    const folderSlugs = new Set(slugFolders.map((f) => f.name));

    for (const slug of folderSlugs) {
      if (!indexSlugs.has(slug)) {
        issues.push({
          severity: 'warn',
          category: 'index',
          check: 'index_stale',
          message: `Application folder "${slug}" not in .index.json.`,
          slug,
          remediation: 'Run jho doctor --repair to rebuild the index.',
        });
      }
    }

    for (const slug of indexSlugs) {
      if (!folderSlugs.has(slug)) {
        issues.push({
          severity: 'warn',
          category: 'index',
          check: 'index_orphan',
          message: `Index entry "${slug}" has no matching folder.`,
          slug,
          remediation: 'Run jho doctor --repair to rebuild the index.',
        });
      }
    }
  }

  log.info({ campaignRoot, issueCount: issues.length }, 'doctor.campaign.completed');
  return issues;
}

/**
 * Diagnose issues for a single application. Checks frontmatter validity,
 * toolhash integrity, and required files.
 *
 * @param appliedDir - Absolute path to the campaign's `applied/` directory.
 * @param slug - The application slug to diagnose.
 * @returns Array of diagnostic issues (empty if healthy).
 */
export async function diagnoseApp(appliedDir: string, slug: string): Promise<DoctorIssue[]> {
  const issues: DoctorIssue[] = [];
  const appFolder = join(appliedDir, slug);

  if (!existsSync(appFolder)) {
    issues.push({
      severity: 'error',
      category: 'applied',
      check: 'app_folder_missing',
      message: `Application folder does not exist: ${appFolder}`,
      slug,
      remediation: 'Re-track the application or restore the folder.',
    });
    return issues;
  }

  const metaPath = join(appFolder, 'meta.md');
  if (!existsSync(metaPath)) {
    issues.push({
      severity: 'error',
      category: 'frontmatter',
      check: 'meta_missing',
      message: `meta.md not found for ${slug}`,
      slug,
      remediation: 'Re-track the application with jho track.',
    });
    return issues;
  }

  // Validate frontmatter
  try {
    const { frontmatter } = await readFrontmatter(metaPath);
    const result = safeValidateApplicationFrontmatter(frontmatter);
    if (!result.success) {
      issues.push({
        severity: 'error',
        category: 'frontmatter',
        check: 'meta_invalid',
        message: `meta.md frontmatter invalid for ${slug}: ${result.issues.map((i) => i.message).join(', ')}`,
        slug,
        remediation: 'Fix the frontmatter fields manually or re-track.',
      });
    }
  } catch (err) {
    issues.push({
      severity: 'error',
      category: 'frontmatter',
      check: 'meta_parse_error',
      message: `Failed to parse meta.md for ${slug}: ${err instanceof Error ? err.message : String(err)}`,
      slug,
      remediation: 'Fix the YAML frontmatter or re-track the application.',
    });
  }

  // Toolhash integrity
  for (const filename of TOOL_MANAGED_FILES) {
    const filePath = join(appFolder, filename);
    if (!existsSync(filePath)) {
      continue;
    }

    const storedHash = await readToolhash(filePath);
    if (storedHash === null) {
      // No sidecar yet — first run, clean
      continue;
    }

    try {
      const content = await readFile(filePath, 'utf8');
      const currentHash = computeHash(content);
      if (currentHash !== storedHash) {
        issues.push({
          severity: 'warn',
          category: 'toolhash',
          check: 'toolhash_mismatch',
          message: `${filename} has been modified since the tool last wrote it for ${slug}.`,
          slug,
          remediation: 'Run jho doctor --repair to update the sidecar, or keep your edits.',
        });
      }
    } catch {
      issues.push({
        severity: 'warn',
        category: 'toolhash',
        check: 'toolhash_read_error',
        message: `Failed to read ${filename} for toolhash comparison in ${slug}.`,
        slug,
        remediation: 'Check file permissions.',
      });
    }
  }

  log.debug({ slug, issueCount: issues.length }, 'doctor.app.completed');
  return issues;
}
