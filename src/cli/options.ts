import { Option } from 'commander';
import { GLOBAL_FLAG_DEFS } from '../core/parser/prompt-parser.js';

export type { GlobalOpts } from '../core/types.js';

/**
 * Commander accumulator callback for repeatable `--tag` options.
 * Passed as the third argument to `.option('--tag <tag>', ..., collectTags, [])`.
 * @param value - The current tag value.
 * @param previous - Tags accumulated so far.
 * @returns The extended array.
 */
export function collectTags(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

/**
 * Global options shared by every command. Added to the parent
 * `commander.program` so they're available on all subcommands.
 * Derived from {@link GLOBAL_FLAG_DEFS} in core.
 */
export const globalOptions = GLOBAL_FLAG_DEFS.map((def) => {
  const shortPart = def.short ? `-${def.short}, ` : '';
  const valuePart = def.takesValue ? ' <value>' : '';
  const name = def.negate ? `no-${def.long}` : def.long;
  return new Option(`${shortPart}--${name}${valuePart}`, '');
});
