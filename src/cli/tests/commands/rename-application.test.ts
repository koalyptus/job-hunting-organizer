import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearConfigCache } from '../../../core/config/config.js';
import { runCommand } from '../helpers.js';
import { renameApplicationCommand } from '../../commands/rename-application.js';

const OLD_SLUG = '2026-Jan-15-frontend-acme-12345';
const NEW_SLUG = '2026-Jan-15-backend-acme-12345';

describe('rename-application command', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-rename-app-cli-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');
    clearConfigCache();

    await mkdir(join(testHome, '.jho'), { recursive: true });
    await writeFile(
      join(testHome, '.jho', 'config.json'),
      JSON.stringify({
        version: 1,
        dataRoot: join(testHome, 'data'),
        llm: { baseUrl: '', apiKey: '', model: '' },
        github: { user: '', token: '', repos: [] },
        calendar: {
          defaultProvider: 'ics',
          outlook: { tenantId: '', clientId: '', clientSecret: '' },
        },
        logging: { level: 'info', file: '', redactPaths: [] },
      }),
    );

    const appliedDir = join(testHome, 'data', 'campaigns', 'default', 'applied');
    await mkdir(join(appliedDir, OLD_SLUG), { recursive: true });
    await writeFile(
      join(appliedDir, OLD_SLUG, 'meta.md'),
      `---\nslug: ${OLD_SLUG}\ntitle: Frontend Engineer\ncompany: Acme\n---\n`,
    );
  });

  afterEach(async () => {
    clearConfigCache();
    if (originalJhoConfigHome === undefined) {
      delete process.env['JHO_CONFIG_HOME'];
    } else {
      process.env['JHO_CONFIG_HOME'] = originalJhoConfigHome;
    }
    if (originalJhoData === undefined) {
      delete process.env['JHO_DATA'];
    } else {
      process.env['JHO_DATA'] = originalJhoData;
    }
    if (testHome) {
      await rm(testHome, { recursive: true, force: true });
    }
  });

  async function run(
    ...argv: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return runCommand(renameApplicationCommand, ['rename-application', ...argv]);
  }

  it('renames an application successfully', async () => {
    const { stdout, exitCode } = await run(NEW_SLUG, '--from', OLD_SLUG);
    expect(exitCode).toBe(0);
    expect(stdout).toContain(OLD_SLUG);
    expect(stdout).toContain(NEW_SLUG);

    const appliedDir = join(testHome, 'data', 'campaigns', 'default', 'applied');
    const statResult = await readFile(join(appliedDir, NEW_SLUG, 'meta.md'), 'utf8');
    expect(statResult).toContain(`slug: ${NEW_SLUG}`);
  });

  it('old application folder no longer exists', async () => {
    await run(NEW_SLUG, '--from', OLD_SLUG);
    const appliedDir = join(testHome, 'data', 'campaigns', 'default', 'applied');
    await expect(access(join(appliedDir, OLD_SLUG))).rejects.toThrow();
  });

  it('preserves meta.md body text after rename', async () => {
    const appliedDir = join(testHome, 'data', 'campaigns', 'default', 'applied');
    const metaPath = join(appliedDir, OLD_SLUG, 'meta.md');
    const existing = await readFile(metaPath, 'utf8');
    await writeFile(metaPath, existing + '\n# My Notes\n\nImportant details.\n');

    await run(NEW_SLUG, '--from', OLD_SLUG);

    const content = await readFile(join(appliedDir, NEW_SLUG, 'meta.md'), 'utf8');
    expect(content).toContain('My Notes');
    expect(content).toContain('Important details.');
  });

  it('preserves other frontmatter fields after rename', async () => {
    const appliedDir = join(testHome, 'data', 'campaigns', 'default', 'applied');
    const metaPath = join(appliedDir, OLD_SLUG, 'meta.md');
    await writeFile(
      metaPath,
      `---\nslug: ${OLD_SLUG}\ntitle: Frontend Engineer\ncompany: Acme\nsalary: 150k\n---\n`,
    );

    await run(NEW_SLUG, '--from', OLD_SLUG);

    const content = await readFile(join(appliedDir, NEW_SLUG, 'meta.md'), 'utf8');
    expect(content).toContain('title: Frontend Engineer');
    expect(content).toContain('company: Acme');
    expect(content).toContain('salary: 150k');
  });

  it('infers old slug from cwd', async () => {
    const appliedDir = join(testHome, 'data', 'campaigns', 'default', 'applied');
    const appDir = join(appliedDir, OLD_SLUG);
    const origCwd = process.cwd();
    process.chdir(appDir);

    try {
      // The self-rename guard correctly prevents renaming from inside the app folder.
      // We verify cwd inference works by checking the slug appears in the error message.
      const { stderr, exitCode } = await run(NEW_SLUG);
      expect(exitCode).toBe(1);
      expect(stderr).toContain(OLD_SLUG);
      expect(stderr).toContain('refusing to rename');
    } finally {
      process.chdir(origCwd);
    }
  });

  it('rejects invalid new slug', async () => {
    const { stderr, exitCode } = await run('not-a-slug', '--from', OLD_SLUG);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('invalid');
  });

  it('errors when source does not exist', async () => {
    const { stderr, exitCode } = await run(NEW_SLUG, '--from', '2026-Jan-15-NOPE-99999');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not found');
  });

  it('errors when destination already exists', async () => {
    const appliedDir = join(testHome, 'data', 'campaigns', 'default', 'applied');
    await mkdir(join(appliedDir, NEW_SLUG), { recursive: true });
    await writeFile(join(appliedDir, NEW_SLUG, 'meta.md'), '---\nslug: other\n---\n');

    const { stderr, exitCode } = await run(NEW_SLUG, '--from', OLD_SLUG);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('already exists');
  });

  it('refuses to rename when cwd is inside the application folder', async () => {
    const appliedDir = join(testHome, 'data', 'campaigns', 'default', 'applied');
    const appDir = join(appliedDir, OLD_SLUG);
    const origCwd = process.cwd();
    process.chdir(appDir);

    try {
      const { stderr, exitCode } = await run(NEW_SLUG, '--from', OLD_SLUG);
      expect(exitCode).toBe(1);
      expect(stderr).toContain('refusing to rename');
    } finally {
      process.chdir(origCwd);
    }
  });

  it('errors when no slug can be resolved and --from is missing', async () => {
    const origCwd = process.cwd();
    process.chdir(testHome);

    try {
      const { stderr, exitCode } = await run(NEW_SLUG);
      expect(exitCode).toBe(1);
      expect(stderr).toContain('missing');
    } finally {
      process.chdir(origCwd);
    }
  });

  it('rebuilds the index after rename', async () => {
    const appliedDir = join(testHome, 'data', 'campaigns', 'default', 'applied');
    await writeFile(
      join(appliedDir, '.index.json'),
      JSON.stringify([{ slug: OLD_SLUG }], null, 2) + '\n',
    );

    await run(NEW_SLUG, '--from', OLD_SLUG);

    const index = JSON.parse(await readFile(join(appliedDir, '.index.json'), 'utf8'));
    expect(index).toHaveLength(1);
    expect(index[0].slug).toBe(NEW_SLUG);
  });
});
