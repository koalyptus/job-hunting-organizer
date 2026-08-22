import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { clearConfigCache } from '../src/lib/config/config.js';

export interface TestEnv {
  testHome: string;
  configHome: string;
  dataRoot: string;
  appliedDir: string;
}

export async function createTestCampaign(name = 'default'): Promise<TestEnv> {
  const testHome = await mkdtemp(join(tmpdir(), 'jho-integration-'));
  const configHome = join(testHome, '.jho');
  const dataRoot = join(testHome, 'data');
  const appliedDir = join(dataRoot, 'campaigns', name, 'applied');

  await mkdir(configHome, { recursive: true });
  await mkdir(appliedDir, { recursive: true });

  await writeFile(
    join(configHome, 'config.json'),
    JSON.stringify({
      version: 1,
      dataRoot,
      llm: { baseUrl: 'http://localhost:11434/v1', apiKey: 'test-key', model: 'test-model' },
      github: { user: 'testuser', token: '', repos: [] },
      logging: { level: 'silent', file: '', redactPaths: [] },
    }),
  );

  const campaignDir = join(dataRoot, 'campaigns', name);
  await writeFile(
    join(campaignDir, 'config.json'),
    JSON.stringify({
      version: 1,
      profile: { path: '' },
      cv: { path: '' },
      linkedin: { url: '' },
      applied: { dir: '' },
      knowledgeBase: { dir: '' },
    }),
  );

  return { testHome, configHome, dataRoot, appliedDir };
}

export function setupTestEnv(configHome: string, dataRoot: string): () => void {
  const origConfig = process.env['JHO_CONFIG_HOME'];
  const origData = process.env['JHO_DATA'];

  // Verify we're not about to overwrite real user paths
  const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || '';
  if (origConfig && origConfig.startsWith(homeDir) && !origConfig.includes('jho-')) {
    console.warn(`WARNING: Overwriting real JHO_CONFIG_HOME: ${origConfig}`);
  }
  if (origData && origData.startsWith(homeDir) && !origData.includes('jho-')) {
    console.warn(`WARNING: Overwriting real JHO_DATA: ${origData}`);
  }

  process.env['JHO_CONFIG_HOME'] = configHome;
  process.env['JHO_DATA'] = dataRoot;
  clearConfigCache();

  return () => {
    if (origConfig !== undefined) {
      process.env['JHO_CONFIG_HOME'] = origConfig;
    } else {
      delete process.env['JHO_CONFIG_HOME'];
    }
    if (origData !== undefined) {
      process.env['JHO_DATA'] = origData;
    } else {
      delete process.env['JHO_DATA'];
    }
    clearConfigCache();
  };
}

export async function cleanupTestDir(testHome: string): Promise<void> {
  try {
    await rm(testHome, { recursive: true, force: true });
  } catch {
    // Windows file locking
  }
}

/**
 * Verify that a path is in a temp directory, not a real user directory.
 * Call this in tests to ensure no leaks to real data locations.
 */
export function assertIsTempDir(path: string): void {
  const tmp = tmpdir();
  if (!path.startsWith(tmp)) {
    throw new Error(`Path is not in temp directory: ${path}`);
  }
}
