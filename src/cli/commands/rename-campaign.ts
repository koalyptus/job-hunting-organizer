import { rename } from 'node:fs/promises';
import { Command } from 'commander';
import {
  resolveCampaignRoot,
  resolveDataRoot,
  findCampaignFromCwd,
  isUnder,
} from '../../core/paths.js';
import { pathExists } from '../../core/fs.js';
import { acquireLock } from '../../core/locks.js';
import { clearConfigCache } from '../../core/config.js';
import { childLogger } from '../../core/logger.js';

const log = childLogger({ cmd: 'rename-campaign' });

/** Characters forbidden in a campaign name. */
const FORBIDDEN = ['/', '\\'];

/**
 * Validate a campaign name. Returns `null` if valid, or an error
 * message string explaining why it's invalid.
 */
function validateName(name: string): string | null {
  if (name === '' || name.trim() === '') {
    return 'must not be empty or whitespace-only';
  }
  if (name !== name.trim()) {
    return 'must not have leading or trailing whitespace';
  }
  if (/\s/.test(name)) {
    return 'must not contain whitespace';
  }
  if (name.startsWith('-')) {
    return 'must not start with a dash';
  }
  if (name === '.' || name === '..') {
    return 'must not be "." or ".."';
  }
  for (const ch of FORBIDDEN) {
    if (name.includes(ch)) {
      return `must not contain "${ch}"`;
    }
  }
  return null;
}

/**
 * `jho rename-campaign <new> [--from <old>]` — rename a campaign folder.
 */
export const renameCampaignCommand = new Command('rename-campaign')
  .description('Rename a campaign folder')
  .argument('<new>', 'new campaign name')
  .option('--from <old>', 'current campaign name (inferred from cwd if omitted)')
  .action(async function (new_: string, opts) {
    const validationError = validateName(new_);
    if (validationError) {
      process.stderr.write(`error: invalid campaign name "${new_}"\nhint: ${validationError}\n`);
      process.exit(1);
    }

    // Resolve old name: --from flag or cwd inference
    let oldName = (opts.from as string | undefined)?.trim() || undefined;
    if (!oldName) {
      const inferred = findCampaignFromCwd(process.cwd(), resolveDataRoot());
      if (!inferred) {
        process.stderr.write(
          'error: could not infer campaign from cwd\nhint: pass the campaign name explicitly with --from, or run from inside the campaign folder\n',
        );
        process.exit(1);
      }
      oldName = inferred;
    }

    const oldPath = resolveCampaignRoot(oldName);
    const newPath = resolveCampaignRoot(new_);

    // Self-foot-gun: refuse if cwd is inside the campaign being renamed
    if (isUnder(process.cwd(), oldPath)) {
      process.stderr.write(
        `error: cannot rename the campaign you are currently in\nhint: cd out of campaigns/${oldName} first\n`,
      );
      process.exit(1);
    }

    // Pre-flight: source must exist (no lock needed)
    if (!(await pathExists(oldPath))) {
      process.stderr.write(`error: campaign "${oldName}" not found\n`);
      process.exit(1);
    }

    const start = Date.now();
    await acquireLock(oldPath, async () => {
      // Destination check must be inside the lock to prevent TOCTOU.
      if (await pathExists(newPath)) {
        process.stderr.write(`error: campaign "${new_}" already exists\n`);
        process.exit(1);
      }
      await rename(oldPath, newPath);
    });
    clearConfigCache();

    log.info({ old: oldName, new: new_, durationMs: Date.now() - start }, 'campaign.renamed');
    process.stdout.write(`Renamed campaign "${oldName}" → "${new_}"\n`);
  });

renameCampaignCommand.addHelpText(
  'after',
  `
Rename a campaign folder. Validates the new name, acquires a lock,
and performs an atomic rename.

Examples:
  $ jho rename-campaign personal --from freelance    # rename "freelance" → "personal"
  $ cd campaigns/freelance && jho rename-campaign personal  # infer old from cwd
`,
);
