import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PackageJson } from './types.js';

/** Absolute path of the currently executing source file. */
const __filename = fileURLToPath(import.meta.url);

/** Absolute path of the directory containing the currently executing source file. */
const __dirname = dirname(__filename);

/** Cached result of {@link getPackageRoot}. `undefined` means "not yet computed". */
let _packageRoot: string | undefined;

/** Cached parsed `package.json`. `undefined` means "not yet read". */
let _packageJson: PackageJson | undefined;

/**
 * Resolve the absolute path of the tool's project root (the directory
 * that contains `package.json`). Derived from `import.meta.url` and
 * cached after the first call.
 * @returns The absolute path to the project root.
 */
export function getPackageRoot(): string {
  if (_packageRoot === undefined) {
    _packageRoot = join(__dirname, '..', '..');
  }
  return _packageRoot;
}

/**
 * Read and parse the tool's `package.json`. Cached after the first call.
 * Returns an empty object on any read or parse error (e.g. the file is
 * missing in a stripped-down install).
 * @returns The parsed `package.json` as a {@link PackageJson}.
 */
export function getPackageJson(): PackageJson {
  if (_packageJson === undefined) {
    try {
      const raw = readFileSync(join(getPackageRoot(), 'package.json'), 'utf8');
      _packageJson = JSON.parse(raw) as PackageJson;
    } catch {
      _packageJson = {};
    }
  }
  return _packageJson;
}

/**
 * Read the `version` field of `package.json`. Falls back to `'0.0.0'`
 * if the field is missing or the file is unreadable.
 * @returns The version string.
 */
export function getPackageVersion(): string {
  return getPackageJson().version ?? '0.0.0';
}

/**
 * Clear the cached package root and parsed `package.json`. Intended for
 * tests that need to re-read after a `process.chdir()` or after mocking
 * the filesystem.
 */
export function clearPackageCache(): void {
  _packageRoot = undefined;
  _packageJson = undefined;
}
