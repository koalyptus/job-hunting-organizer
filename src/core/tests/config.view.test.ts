import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CampaignConfigSchema, GlobalConfigSchema } from '../config.schema.js';
import {
  configShowPaths,
  formatPathHint,
  renderConfigShow,
  redactSecrets,
} from '../config.view.js';
import { clearConfigCache } from '../config.js';

let workDir: string;

const SAMPLE_GLOBAL = {
  version: 1,
  root: '/somewhere/jho',
  llm: { baseUrl: 'https://api.example.com', apiKey: 'sk-secret-abc', model: 'gpt-x' },
  profile: { path: '/somewhere/jho/profile.md' },
  cv: { path: '/somewhere/jho/cv.pdf' },
  github: { user: 'me', token: 'ghp-secret-xyz', repos: ['me/repo'] },
  applied: { dir: '/somewhere/jho/applied' },
  knowledgeBase: { dir: '/somewhere/jho/kb' },
  calendar: {
    defaultProvider: 'ics',
    outlook: { tenantId: 'tenant', clientId: 'cid', clientSecret: 'cs-secret-123' },
  },
  logging: { level: 'info', file: '/tmp/jho.log', redactPaths: [] },
};

const SAMPLE_CAMPAIGN = {
  version: 1,
  profile: { path: '/somewhere/jho/campaigns/default/profile.md' },
  applied: { dir: '/somewhere/jho/campaigns/default/applied' },
  knowledgeBase: { dir: '/somewhere/jho/campaigns/default/kb' },
};

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'jho-config-view-'));
  // Set up a global root with a valid config.json
  const globalRoot = join(workDir, 'global-root');
  const campaignsRoot = join(globalRoot, 'campaigns', 'default');
  // SAMPLE_GLOBAL.root is absolute; we override it to the real tmp dir.
  const realGlobal = {
    ...SAMPLE_GLOBAL,
    root: globalRoot,
    profile: { path: join(globalRoot, 'profile.md') },
    cv: { path: join(globalRoot, 'cv.pdf') },
    applied: { dir: join(globalRoot, 'applied') },
    knowledgeBase: { dir: join(globalRoot, 'knowledge-base') },
    logging: { ...SAMPLE_GLOBAL.logging, file: join(workDir, 'jho.log') },
  };
  // Validate we don't break the schema by overriding root.
  GlobalConfigSchema.parse(realGlobal);
  CampaignConfigSchema.parse(SAMPLE_CAMPAIGN);

  // Write the global config.json
  // We need the test to work even if SAMPLE_GLOBAL has /somewhere/jho baked in
  // for the schema validation above. The path resolution in config.ts will
  // ignore the SAMPLE_GLOBAL.root (it uses resolveGlobalRoot()). So we can
  // just write the test-friendly global config to disk and let config.ts
  // load it.
  mkdirSync(globalRoot, { recursive: true });
  mkdirSync(campaignsRoot, { recursive: true });
  const testGlobal = { ...realGlobal };
  writeFileSync(join(globalRoot, 'config.json'), JSON.stringify(testGlobal));
  writeFileSync(
    join(campaignsRoot, 'config.json'),
    JSON.stringify({
      ...SAMPLE_CAMPAIGN,
      profile: { path: join(globalRoot, 'campaigns', 'default', 'profile.md') },
      applied: { dir: join(globalRoot, 'campaigns', 'default', 'applied') },
      knowledgeBase: { dir: join(globalRoot, 'campaigns', 'default', 'knowledge-base') },
    }),
  );

  // Force config.ts to use our workDir by setting $JHO_ROOT
  vi.stubEnv('JHO_ROOT', globalRoot);
  clearConfigCache();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  clearConfigCache();
});

describe('redactSecrets', () => {
  it('replaces the LLM API key', () => {
    const redacted = redactSecrets(SAMPLE_GLOBAL as never);
    expect(redacted.llm.apiKey).toContain('***');
    expect(redacted.llm.apiKey).toContain('LLM_API_KEY');
  });

  it('replaces the GitHub token', () => {
    const redacted = redactSecrets(SAMPLE_GLOBAL as never);
    expect(redacted.github.token).toContain('***');
    expect(redacted.github.token).toContain('GITHUB_TOKEN');
  });

  it('replaces the Outlook client secret', () => {
    const redacted = redactSecrets(SAMPLE_GLOBAL as never);
    expect(redacted.calendar.outlook.clientSecret).toContain('***');
  });

  it('preserves non-secret fields', () => {
    const redacted = redactSecrets(SAMPLE_GLOBAL as never);
    expect(redacted.llm.model).toBe('gpt-x');
    expect(redacted.github.user).toBe('me');
    expect(redacted.calendar.outlook.tenantId).toBe('tenant');
  });

  it('does not mutate the input', () => {
    redactSecrets(SAMPLE_GLOBAL as never);
    expect(SAMPLE_GLOBAL.llm.apiKey).toBe('sk-secret-abc');
    expect(SAMPLE_GLOBAL.github.token).toBe('ghp-secret-xyz');
  });
});

describe('renderConfigShow', () => {
  it('produces JSON output with --json', () => {
    const out = renderConfigShow({ json: true, reveal: true });
    expect(out.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(out);
    expect(parsed.llm.apiKey).toBe('sk-secret-abc');
  });

  it('redacts by default', () => {
    const out = renderConfigShow({ json: true });
    const parsed = JSON.parse(out);
    expect(parsed.llm.apiKey).toContain('***');
    expect(parsed.llm.apiKey).not.toBe('sk-secret-abc');
  });

  it('shows the global config only with --global', () => {
    const out = renderConfigShow({ global: true, json: true, reveal: true });
    const parsed = JSON.parse(out);
    // Global config includes all fields including calendar.
    expect(parsed.calendar).toBeDefined();
  });

  it('includes a header comment in non-JSON mode', () => {
    const out = renderConfigShow({ reveal: true });
    expect(out).toMatch(/^#/);
  });

  it('embeds the config file path in the non-JSON header (merged)', () => {
    const out = renderConfigShow({ reveal: true });
    // Global + campaign paths are present in the header comment lines.
    const headerLines = out.split('\n').slice(0, 5);
    expect(headerLines.some((l) => l.includes('Source:') && l.includes('config.json'))).toBe(true);
    expect(headerLines.some((l) => l.includes('Campaign:') && l.includes('config.json'))).toBe(
      true,
    );
  });

  it('embeds only the global path in the non-JSON header (--global)', () => {
    const out = renderConfigShow({ global: true, reveal: true });
    const headerLines = out.split('\n').slice(0, 5);
    expect(headerLines.some((l) => l.includes('Source:') && l.includes('config.json'))).toBe(true);
    expect(headerLines.some((l) => l.includes('Campaign:'))).toBe(false);
  });

  it('does NOT include the path in --json stdout (so jq works)', () => {
    const out = renderConfigShow({ json: true, reveal: true });
    // First char must be `{` to be valid JSON for downstream tools.
    expect(out.startsWith('{')).toBe(true);
    expect(out).not.toContain('Source:');
    expect(out).not.toContain('Campaign:');
  });
});

describe('configShowPaths + formatPathHint', () => {
  it('returns both global and campaign paths by default', () => {
    const paths = configShowPaths();
    expect(paths.global).toMatch(/\/config\.json$/);
    expect(paths.campaign).toMatch(/\/config\.json$/);
    expect(paths.campaign).not.toBe(paths.global);
  });

  it('omits the campaign path with --global', () => {
    const paths = configShowPaths({ global: true });
    expect(paths.global).toMatch(/\/config\.json$/);
    expect(paths.campaign).toBeNull();
  });

  it('formatPathHint prints both paths on separate lines (merged)', () => {
    const paths = configShowPaths();
    const hint = formatPathHint(paths);
    expect(hint).toContain('config:');
    expect(hint).toContain('campaign:');
    expect(hint).toContain(paths.global);
    expect(hint).toContain(paths.campaign ?? '');
    expect(hint.endsWith('\n')).toBe(true);
  });

  it('formatPathHint prints only the global path (--global)', () => {
    const paths = configShowPaths({ global: true });
    const hint = formatPathHint(paths);
    expect(hint).toContain('config:');
    expect(hint).not.toContain('campaign:');
    expect(hint.endsWith('\n')).toBe(true);
  });
});
