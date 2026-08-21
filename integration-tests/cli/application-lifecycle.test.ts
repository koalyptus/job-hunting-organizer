import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { showCommand } from '../../src/cli/commands/show.js';
import { doctorCommand } from '../../src/cli/commands/doctor.js';
import {
  createApplication,
  readApplication,
  deleteApplication,
  listApplications,
  updateApplication,
} from '../../src/workflow/applications/applications.js';
import { renameApplication } from '../../src/workflow/applications/rename.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

describe('CLI: application lifecycle', () => {
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

  it('creates application via core, shows via CLI', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Software Engineer',
      company: 'Acme Corp',
      location: 'Remote',
      url: 'https://example.com/job/1',
      description: 'Build amazing things',
    });

    const { stdout, exitCode } = await runCommand(showCommand, ['show', slug]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain(slug);
    expect(stdout).toContain('Software Engineer');
    expect(stdout).toContain('Acme Corp');
    expect(stdout).toContain('Remote');
  });

  it('creates and reads application via core', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Backend Developer',
      company: 'TechCo',
      location: 'NYC',
      salary: '$120k',
      tags: ['typescript', 'node'],
    });

    const app = await readApplication(env.appliedDir, slug);
    expect(app.frontmatter.title).toBe('Backend Developer');
    expect(app.frontmatter.company).toBe('TechCo');
    expect(app.frontmatter.location).toBe('NYC');
    expect(app.frontmatter.salary).toBe('$120k');
    expect(app.frontmatter.tags).toEqual(['typescript', 'node']);
    expect(app.frontmatter.status).toBe('applied');

    const apps = await listApplications(env.appliedDir);
    expect(apps).toHaveLength(1);
    expect(apps[0]!.title).toBe('Backend Developer');
  });

  it('updates application via core', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Frontend Dev',
      company: 'StartupInc',
    });

    await updateApplication(env.appliedDir, slug, {
      status: 'interview',
      salary: '$100k-$130k',
    });

    const app = await readApplication(env.appliedDir, slug);
    expect(app.frontmatter.status).toBe('interview');
    expect(app.frontmatter.salary).toBe('$100k-$130k');
    expect(app.frontmatter.title).toBe('Frontend Dev');
  });

  it('renames application via core', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'DevOps Engineer',
      company: 'CloudCo',
    });

    const newSlug = '2026-Jul-20-DO-CloudCo';
    await renameApplication(env.appliedDir, slug, newSlug);

    const app = await readApplication(env.appliedDir, newSlug);
    expect(app.frontmatter.slug).toBe(newSlug);
    expect(app.frontmatter.title).toBe('DevOps Engineer');

    const { exitCode } = await runCommand(showCommand, ['show', newSlug]);
    expect(exitCode).toBe(0);
  });

  it('removes application via core', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'QA Engineer',
      company: 'TestCo',
    });

    let apps = await listApplications(env.appliedDir);
    expect(apps).toHaveLength(1);

    const deleted = await deleteApplication(env.appliedDir, slug);
    expect(deleted).toBe(true);

    apps = await listApplications(env.appliedDir);
    expect(apps).toHaveLength(0);
  });

  it('shows multiple applications in list', async () => {
    await createApplication({
      appliedDir: env.appliedDir,
      title: 'Engineer A',
      company: 'Company A',
    });
    await createApplication({
      appliedDir: env.appliedDir,
      title: 'Engineer B',
      company: 'Company B',
    });
    await createApplication({
      appliedDir: env.appliedDir,
      title: 'Engineer C',
      company: 'Company C',
    });

    const apps = await listApplications(env.appliedDir);
    expect(apps).toHaveLength(3);
  });

  it('filters applications by status', async () => {
    const slug1 = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Job 1',
      company: 'Co 1',
    });
    const slug2 = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Job 2',
      company: 'Co 2',
    });

    await updateApplication(env.appliedDir, slug2, { status: 'interview' });

    const applied = await listApplications(env.appliedDir, { status: 'applied' });
    expect(applied).toHaveLength(1);
    expect(applied[0]!.slug).toBe(slug1);

    const interviewing = await listApplications(env.appliedDir, { status: 'interview' });
    expect(interviewing).toHaveLength(1);
    expect(interviewing[0]!.slug).toBe(slug2);
  });

  it('doctor shows healthy for valid campaign', async () => {
    await createApplication({
      appliedDir: env.appliedDir,
      title: 'Valid App',
      company: 'ValidCo',
    });

    const { stdout, exitCode } = await runCommand(doctorCommand, ['doctor']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('healthy');
  });

  it('show --json returns structured data', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'JSON Test',
      company: 'JSONCo',
      location: 'Remote',
    });

    const { stdout, exitCode } = await runCommand(showCommand, ['show', slug, '--json']);
    expect(exitCode).toBe(0);

    const parsed = JSON.parse(stdout);
    expect(parsed.slug).toBe(slug);
    expect(parsed.title).toBe('JSON Test');
    expect(parsed.company).toBe('JSONCo');
    expect(parsed.location).toBe('Remote');
    expect(parsed.files).toContain('meta.md');
    expect(parsed.files).toContain('jd.md');
  });
});
