import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { doctorCommand } from '../../src/cli/commands/doctor.js';
import { createApplication } from '../../src/core/applications/applications.js';
import { diagnoseCampaign, diagnoseApp } from '../../src/core/doctor/index.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

describe('CLI: doctor diagnostics', () => {
  let env: TestEnv;
  let restore: () => void;

  beforeEach(async () => {
    env = await createTestCampaign();
    restore = setupTestEnv(env.configHome, env.dataRoot);
  });

  afterEach(async () => {
    restore();
    await cleanupTestDir(env.testHome);
  });

  it('diagnoses healthy campaign', async () => {
    await createApplication({
      appliedDir: env.appliedDir,
      title: 'Healthy App',
      company: 'HealthyCo',
    });

    const { stdout, exitCode } = await runCommand(doctorCommand, ['doctor']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('healthy');
  });

  it('detects missing campaign root', async () => {
    const missingCampaignRoot = join(env.dataRoot, 'campaigns', 'nonexistent');
    const issues = await diagnoseCampaign(missingCampaignRoot);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.check).toBe('campaign_root_missing');
    expect(issues[0]!.severity).toBe('error');
  });

  it('detects missing applied directory', async () => {
    const campaignDir = join(env.dataRoot, 'campaigns', 'no-applied');
    await mkdir(campaignDir, { recursive: true });

    const issues = await diagnoseCampaign(campaignDir);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.check).toBe('applied_dir_missing');
  });

  it('detects missing campaign config', async () => {
    const campaignDir = join(env.dataRoot, 'campaigns', 'no-config');
    await mkdir(join(campaignDir, 'applied'), { recursive: true });

    const issues = await diagnoseCampaign(campaignDir);
    const configIssue = issues.find((i) => i.check === 'campaign_config_missing');
    expect(configIssue).toBeDefined();
    expect(configIssue!.severity).toBe('warn');
  });

  it('detects toolhash mismatch', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Tampered App',
      company: 'TamperCo',
    });

    const metaPath = join(env.appliedDir, slug, 'meta.md');
    const content = await readFile(metaPath, 'utf8');
    await writeFile(metaPath, content + '\n<!-- tampered -->');

    const issues = await diagnoseApp(env.appliedDir, slug);
    const toolhashIssue = issues.find((i) => i.check === 'toolhash_mismatch');
    expect(toolhashIssue).toBeDefined();
    expect(toolhashIssue!.severity).toBe('warn');
  });

  it('detects missing meta.md', async () => {
    const slug = '2026-Jul-20-Missing-Meta';
    await mkdir(join(env.appliedDir, slug), { recursive: true });

    const issues = await diagnoseApp(env.appliedDir, slug);
    const metaIssue = issues.find((i) => i.check === 'meta_missing');
    expect(metaIssue).toBeDefined();
    expect(metaIssue!.severity).toBe('error');
  });

  it('detects missing application folder', async () => {
    const issues = await diagnoseApp(env.appliedDir, 'nonexistent-slug');
    const folderIssue = issues.find((i) => i.check === 'app_folder_missing');
    expect(folderIssue).toBeDefined();
    expect(folderIssue!.severity).toBe('error');
  });

  it('doctor CLI shows issues for single app', async () => {
    const slug = '2026-Jul-20-Bad-App';
    await mkdir(join(env.appliedDir, slug), { recursive: true });

    const { stdout, exitCode } = await runCommand(doctorCommand, ['doctor', slug]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('issue(s)');
  });

  it('doctor CLI shows healthy for valid app', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Good App',
      company: 'GoodCo',
    });

    const { stdout, exitCode } = await runCommand(doctorCommand, ['doctor', slug]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain(slug);
    expect(stdout).toContain('healthy');
  });
});
