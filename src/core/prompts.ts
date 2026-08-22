import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getPackageRoot } from '../lib/package.js';
import { parseFrontmatter, getFrontmatterNumber } from './parser/frontmatter.js';

const DEFAULT_PROMPT_TEMPERATURE = 0.6;

/**
 * Load and parse a versioned prompt template from `prompts/<name>.md`.
 * Returns the parsed frontmatter (with `recommendedTemperature`) and the
 * body (system message).
 *
 * @param name - Prompt file name without `.md` extension (e.g. `'profile-build'`).
 * @param fallbackTemperature - Used when the prompt has no `recommendedTemperature` frontmatter.
 * @returns The system prompt body and the resolved temperature.
 */
export async function loadPromptTemplate(
  name: string,
  fallbackTemperature: number = DEFAULT_PROMPT_TEMPERATURE,
): Promise<{ body: string; temperature: number }> {
  const root = getPackageRoot();
  const promptPath = join(root, 'prompts', `${name}.md`);
  const raw = await readFile(promptPath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(raw);
  const temperature = getFrontmatterNumber(
    frontmatter,
    'recommendedTemperature',
    fallbackTemperature,
  );
  return { body, temperature };
}

/**
 * Load a base prompt template and append a shared voice block from
 * `prompts/<voiceName>.md`. The voice block is a single source of truth
 * for expressive guidance; the base prompt owns command-specific rules.
 *
 * @param baseName - Base prompt file name without `.md` (e.g. `'cover-letter'`).
 * @param voiceName - Voice prompt file name without `.md` (e.g. `'humanize-voice'`).
 * @returns Concatenated body and the base prompt's temperature.
 */
export async function loadPromptTemplateWithVoice(
  baseName: string,
  voiceName: string,
  fallbackTemperature: number = DEFAULT_PROMPT_TEMPERATURE,
): Promise<{ body: string; temperature: number }> {
  const base = await loadPromptTemplate(baseName, fallbackTemperature);
  const root = getPackageRoot();
  const voicePath = join(root, 'prompts', `${voiceName}.md`);
  const voiceRaw = await readFile(voicePath, 'utf8');
  const { body: voiceBody } = parseFrontmatter(voiceRaw);
  return {
    body: `${base.body}\n\n${voiceBody.trim()}`,
    temperature: base.temperature,
  };
}
