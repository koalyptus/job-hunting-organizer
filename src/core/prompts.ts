import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getPackageRoot } from './package.js';
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
