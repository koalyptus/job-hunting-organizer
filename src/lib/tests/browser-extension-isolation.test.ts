import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guard the repo-level constraints the #113 location decision places on the
 * browser extension (recorded in `docs/ROADMAP.md` → "Browser extension — code
 * location"): the extension is a self-contained WXT project, so the CLI's
 * toolchain must not pick it up.
 *
 * These assertions are what keep `npm run verify` green once
 * `browser-extension/` exists. If one of them fails, the extension has leaked
 * into the CLI's typecheck/lint/format/test/publish surface.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Read a repo-root file as text. */
function readRootFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf-8');
}

describe('browser-extension isolation', () => {
  it('keeps browser-extension out of the root tsconfig include list', () => {
    const tsconfig = JSON.parse(readRootFile('tsconfig.json')) as { include?: string[] };

    for (const pattern of tsconfig.include ?? []) {
      expect(
        pattern,
        `tsconfig include "${pattern}" must not cover browser-extension`,
      ).not.toContain('browser-extension');
    }
  });

  it('keeps the root vitest include scoped to src/**', () => {
    const vitestConfig = readRootFile('vitest.config.ts');

    expect(vitestConfig).toContain("include: ['src/**/*.{test,spec}.ts']");
  });

  it('keeps browser-extension out of the published tarball', () => {
    const pkg = JSON.parse(readRootFile('package.json')) as { files?: string[] };

    expect(pkg.files ?? []).not.toContain('browser-extension');
  });

  it('excludes browser-extension from eslint', () => {
    const eslintConfig = readRootFile('eslint.config.js');

    expect(eslintConfig).toContain('browser-extension/**');
  });

  it('excludes browser-extension from prettier', () => {
    expect(readRootFile('.prettierignore')).toContain('browser-extension/');
  });

  it('does not declare an npm workspace for the extension', () => {
    const pkg = JSON.parse(readRootFile('package.json')) as { workspaces?: string[] };

    expect(pkg.workspaces ?? []).not.toContain('browser-extension');
  });
});
