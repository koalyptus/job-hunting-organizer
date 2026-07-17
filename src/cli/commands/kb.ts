import { Command } from 'commander';
import { resolveCampaignRoot } from '../../core/paths.js';
import { resolve } from 'node:path';
import { loadCampaignConfig, updateCampaignConfig } from '../../core/config/config.js';
import { ingestKnowledgeBase, syncKnowledgeBase, KbError } from '../../core/campaign/kb-ingest.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';
import { userError, userOutput, userSuccess } from '../output.js';
import type { GlobalOpts } from '../options.js';
import { resolveCampaign } from '../campaign.js';

/**
 * `jho kb add <path...>` — copy knowledge-base docs into the campaign folder.
 */
const addCommand = new Command('add')
  .description('Copy knowledge-base docs (PDF, DOCX, MD, TXT) into the campaign')
  .argument(
    '<paths...>',
    'one or more FILE or FOLDER paths to ingest (a folder is walked recursively)',
  )
  .action(async function (paths: string[]) {
    const globals = this.parent?.parent?.opts() as GlobalOpts | undefined;
    const campaign = await resolveCampaign(globals);
    const log = getRootLogger().child({ cmd: 'kb.add', campaign });

    try {
      const campaignRoot = resolveCampaignRoot(campaign);
      const all: string[] = [];
      const failed: string[] = [];
      const newSources: string[] = [];
      for (const p of paths) {
        const resolved = resolve(campaignRoot, p);
        const copied = await ingestKnowledgeBase(campaignRoot, resolved);
        if (copied.length === 0) {
          userError(`No supported docs found at ${p} (expected PDF, DOCX, MD, TXT)`);
          failed.push(p);
          continue;
        }
        all.push(...copied);
        newSources.push(resolved);
      }
      // Update knowledgeBase.sources with successfully added sources (deduped).
      if (newSources.length > 0) {
        const config = loadCampaignConfig(campaign);
        const existingSources = config.knowledgeBase?.sources ?? [];
        const mergedSources = Array.from(new Set([...existingSources, ...newSources]));
        updateCampaignConfig(campaign, {
          knowledgeBase: { ...config.knowledgeBase, sources: mergedSources },
        });
      }
      if (failed.length > 0) {
        userError(`Skipped ${failed.length} path(s) with no supported docs: ${failed.join(', ')}`);
        process.exit(1);
      }
      userSuccess(`Copied ${all.length} knowledge-base doc(s) into the campaign.`);
      userOutput(
        `Next: docs are fed into cover-letter, answer, prepare, retro, and profile build.`,
      );
      log.info({ count: all.length }, 'kb.add.completed');
    } catch (err) {
      if (err instanceof KbError) {
        logError(log, err, 'kb.add.failed', { campaign });
        log.flush();
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

addCommand.addHelpText(
  'after',
  `
Accepts one or more paths. Each path may be EITHER:
  - a single FILE  -> that file is copied
  - a FOLDER       -> the folder is walked recursively and every supported
                      doc inside it is copied (subfolders included)

Only PDF, DOCX, MD, and TXT files are copied; other files are skipped silently.
The tool reads these docs and feeds them into LLM-backed commands — it never
rewrites them.

Examples:
  $ jho kb add ~/notes/interview-tips.md          # one file
  $ jho kb add ~/docs/cv-extra.pdf                 # one file
  $ jho kb add ~/knowledge-folder                  # a whole folder (recursive)
  $ jho kb add ~/notes/a.md ~/notes/b.pdf ~/docs   # mix of files and folders
 `,
);

/**
 * `jho kb update` — re-sync from sources recorded at init.
 */
const updateCommand = new Command('update')
  .description('Re-sync the knowledge base from sources recorded at init')
  .action(async function () {
    const globals = this.parent?.parent?.opts() as GlobalOpts | undefined;
    const campaign = await resolveCampaign(globals);
    const log = getRootLogger().child({ cmd: 'kb.update', campaign });

    try {
      const campaignRoot = resolveCampaignRoot(campaign);
      const sources = loadCampaignConfig(campaign).knowledgeBase.sources;
      const present = await syncKnowledgeBase(campaignRoot, sources);
      if (present.length === 0) {
        userOutput(
          'Knowledge base is empty. Drop docs into knowledge-base/ or run `jho kb add <path>`.',
        );
      } else if (sources.length > 0) {
        userSuccess(`Knowledge base re-synced from recorded sources (${present.length} doc(s)).`);
      } else {
        userSuccess(`Knowledge base refreshed (${present.length} doc(s)).`);
      }
      log.info({ count: present.length, fromSources: sources.length > 0 }, 'kb.update.completed');
    } catch (err) {
      if (err instanceof KbError) {
        logError(log, err, 'kb.update.failed', { campaign });
        log.flush();
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

updateCommand.addHelpText(
  'after',
  `
Re-indexes the knowledge base. When you recorded source paths during \`jho init\`
(or via a future flag), it re-pulls docs from those external sources. Otherwise
it simply refreshes the current folder state — so docs you placed manually in
knowledge-base/ or added with \`jho kb add\` are always picked up.

Examples:
  $ jho kb update
`,
);

/**
 * `jho kb` — knowledge-base management.
 */
export const kbCommand = new Command('kb')
  .description('Manage the campaign knowledge base fed into LLM commands')
  .addCommand(addCommand)
  .addCommand(updateCommand);

kbCommand.addHelpText(
  'after',
  `
The knowledge base is a per-campaign folder of your own notes and docs. The tool
reads them and feeds them into cover-letter, answer, prepare, retro, and profile
build — so the LLM sees your context. The tool never edits your docs.
`,
);
