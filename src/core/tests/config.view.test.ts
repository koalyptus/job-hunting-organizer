import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../config.view.js';

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
