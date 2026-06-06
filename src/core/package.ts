import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PackageJson } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let _packageRoot: string | undefined;
let _packageJson: PackageJson | undefined;

export function getPackageRoot(): string {
  if (_packageRoot === undefined) {
    _packageRoot = join(__dirname, '..', '..');
  }
  return _packageRoot;
}

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

export function getPackageVersion(): string {
  return getPackageJson().version ?? '0.0.0';
}

export function clearPackageCache(): void {
  _packageRoot = undefined;
  _packageJson = undefined;
}
