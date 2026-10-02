#!/usr/bin/env node
/**
 * Pre-publish verification: packs the tarball, installs it into a throwaway
 * consumer directory, and asserts that the installed package works end-to-end.
 *
 * Checks:
 *   1. `jho --version` prints the correct version.
 *   2. `jho-mcp` completes an MCP `initialize` + `tools/list` handshake.
 *   3. `jho ownership` resolves prompts from the installed package root.
 *
 * This catches packaging regressions such as `prompts/` or `dist/` being
 * dropped from `files`, which would break `getPackageRoot()` at runtime.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// Read version from package.json
const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };
const expectedVersion = pkg.version;

let scratchDir = '';

function cleanup(): void {
  if (scratchDir) {
    try {
      rmSync(scratchDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

function fail(message: string): never {
  console.error(`pre-publish check FAILED: ${message}`);
  cleanup();
  process.exit(1);
}

function pass(message: string): void {
  console.log(`  ok: ${message}`);
}

// Step 1: Pack the tarball
console.log('Packing tarball...');
scratchDir = mkdtempSync(join(tmpdir(), 'jho-pre-publish-'));

const packResult = spawnSync('npm', ['pack', '--pack-destination', scratchDir], {
  cwd: repoRoot,
  encoding: 'utf-8',
  timeout: 60_000,
});

if (packResult.status !== 0) {
  fail(`npm pack failed: ${packResult.stderr}`);
}

const tarballName = `job-hunting-organizer-${expectedVersion}.tgz`;
const tarballPath = join(scratchDir, tarballName);

if (!existsSync(tarballPath)) {
  fail(`tarball not found at ${tarballPath}`);
}

pass(`tarball created: ${tarballName}`);

// Step 2: Install into a throwaway consumer directory
console.log('Installing into throwaway consumer...');
const consumerDir = join(scratchDir, 'consumer');
mkdirSync(consumerDir, { recursive: true });

const initResult = spawnSync('npm', ['init', '-y'], {
  cwd: consumerDir,
  encoding: 'utf-8',
  timeout: 30_000,
});

if (initResult.status !== 0) {
  fail(`npm init failed: ${initResult.stderr}`);
}

const npmInstallResult = spawnSync('npm', ['install', tarballPath], {
  cwd: consumerDir,
  encoding: 'utf-8',
  timeout: 120_000,
});

if (npmInstallResult.status !== 0) {
  fail(`npm install failed: ${npmInstallResult.stderr}`);
}

pass('installed into consumer directory');

// Step 3: Check `jho --version`
console.log('Checking jho --version...');
const versionResult = spawnSync('./node_modules/.bin/jho', ['--version'], {
  cwd: consumerDir,
  encoding: 'utf-8',
  timeout: 15_000,
});

if (versionResult.status !== 0) {
  fail(`jho --version exited with ${versionResult.status}: ${versionResult.stderr}`);
}

const actualVersion = versionResult.stdout.trim();
if (actualVersion !== expectedVersion) {
  fail(`version mismatch: expected ${expectedVersion}, got ${actualVersion}`);
}

pass(`jho --version => ${actualVersion}`);

// Step 4: Check MCP initialize + tools/list handshake
console.log('Checking MCP handshake...');
const mcpResult = spawnSync('./node_modules/.bin/jho-mcp', {
  cwd: consumerDir,
  encoding: 'utf-8',
  timeout: 25_000,
  input:
    [
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'pre-publish-check', version: '1' },
        },
      }),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    ].join('\n') + '\n',
});

if (mcpResult.status !== 0) {
  fail(`jho-mcp exited with ${mcpResult.status}: ${mcpResult.stderr}`);
}

// Parse JSON-RPC frames and assert on the tools/list response (id === 2)
const parsed = mcpResult.stdout
  .split('\n')
  .filter(Boolean)
  .flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });

const toolsResponse = parsed.find((m) => m.id === 2);
if (!toolsResponse?.result?.tools?.length) {
  fail(`MCP tools/list did not return tools: ${JSON.stringify(toolsResponse)}`);
}

pass(
  `MCP initialize + tools/list handshake succeeded (${toolsResponse.result.tools.length} tools registered)`,
);

// Step 5: Check prompt-loading command (jho ownership)
console.log('Checking prompt-loading command...');
const env = {
  ...process.env,
  JHO_CONFIG_HOME: join(scratchDir, 'home'),
  JHO_DATA: join(scratchDir, 'data'),
};

const ownershipResult = spawnSync('./node_modules/.bin/jho', ['ownership'], {
  cwd: consumerDir,
  encoding: 'utf-8',
  timeout: 15_000,
  env,
});

if (ownershipResult.status !== 0) {
  fail(`jho ownership exited with ${ownershipResult.status}: ${ownershipResult.stderr}`);
}

if (!ownershipResult.stdout.includes('meta.md')) {
  fail('jho ownership output does not mention meta.md');
}

pass('jho ownership resolved prompts from installed package root');

// All checks passed
console.log('\nAll pre-publish checks passed.');
cleanup();
process.exit(0);
