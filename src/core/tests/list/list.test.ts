import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { runListApplications, InvalidListStatusError } from '../../list/index.js';
import * as applicationsModule from '../../applications/applications.js';
import type { ApplicationEntry } from '../../applications/types.js';

vi.mock('../../applications/applications.js', async (importOriginal) => {
  const actual = await importOriginal<typeof applicationsModule>();
  return {
    ...actual,
    listApplications: vi.fn(),
  };
});

describe('runListApplications', () => {
  let testHome: string;

  const fakeEntries: ApplicationEntry[] = [
    {
      slug: '2026-Jun-01-SE-Acme-123',
      status: 'applied',
      title: 'Software Engineer',
      company: 'Acme Corp',
      site: 'Seek',
      location: 'Sydney NSW',
      targetRole: 'senior-backend-engineer',
      appliedOn: '2026-06-01',
      tags: ['typescript'],
    },
  ];

  beforeEach(async () => {
    testHome = await mkdtemp(join(tmpdir(), 'jho-core-list-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');

    // Set up global config
    await mkdir(join(testHome, '.jho'), { recursive: true });
    await writeFile(
      join(testHome, '.jho', 'config.json'),
      JSON.stringify({
        version: 1,
        dataRoot: join(testHome, 'data'),
        llm: { baseUrl: 'http://localhost:11434/v1', apiKey: 'test-key', model: 'test-model' },
        github: { user: 'testuser', token: '', repos: [] },
        calendar: {
          defaultProvider: 'ics',
          outlook: { tenantId: '', clientId: '', clientSecret: '' },
        },
        logging: { level: 'silent', file: '', redactPaths: [] },
      }),
    );

    // Set up campaign with config
    const cRoot = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(join(cRoot, 'applied'), { recursive: true });
    await writeFile(
      join(cRoot, 'config.json'),
      JSON.stringify({
        version: 1,
        profile: { path: '' },
        cv: { path: '' },
        linkedin: { url: '' },
        applied: { dir: '' },
        knowledgeBase: { dir: '' },
      }),
    );

    vi.mocked(applicationsModule.listApplications).mockResolvedValue(fakeEntries);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env['JHO_CONFIG_HOME'];
    delete process.env['JHO_DATA'];
    await rm(testHome, { recursive: true, force: true });
  });

  it('returns entries from listApplications', async () => {
    const { entries } = await runListApplications('default', {});
    expect(entries).toEqual(fakeEntries);
  });

  it('passes valid status to listApplications', async () => {
    await runListApplications('default', { status: 'interview' });
    expect(applicationsModule.listApplications).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'interview' }),
    );
  });

  it('throws InvalidListStatusError for invalid status', async () => {
    await expect(runListApplications('default', { status: 'flying' })).rejects.toThrow(
      InvalidListStatusError,
    );
  });

  it('passes tags to listApplications when present', async () => {
    await runListApplications('default', { tags: ['typescript', 'react'] });
    expect(applicationsModule.listApplications).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ tags: ['typescript', 'react'] }),
    );
  });

  it('does not pass tags to listApplications when empty', async () => {
    await runListApplications('default', { tags: [] });
    expect(applicationsModule.listApplications).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ tags: undefined }),
    );
  });

  it('passes targetRole to listApplications', async () => {
    await runListApplications('default', { targetRole: 'senior-backend-engineer' });
    expect(applicationsModule.listApplications).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ targetRole: 'senior-backend-engineer' }),
    );
  });
});
