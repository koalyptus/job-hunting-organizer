import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind class names, resolving conflicts (last one wins).
 * The `cn()` helper every shadcn/ui primitive is built on.
 *
 * @param inputs - Class names, conditionals and arrays to merge.
 * @returns A deduplicated, conflict-resolved class string.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
