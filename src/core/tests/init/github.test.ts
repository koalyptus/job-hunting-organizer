import { describe, expect, it, vi, beforeEach } from 'vitest';
import { promptGithub } from '../../init/github.js';
import type { GlobalConfig } from '../../types.js';

vi.mock('@clack/prompts', () => ({
  text: vi.fn(),
  password: vi.fn(),
  isCancel: vi.fn(() => false),
  log: {
    info: vi.fn(),
  },
}));

describe('promptGithub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows prompt with pre-filled value when defaultUser provided', async () => {
    const { text } = await import('@clack/prompts');
    vi.mocked(text).mockResolvedValue('testuser');

    const result = await promptGithub('testuser', false, null);
    expect(result).toEqual({ user: 'testuser', token: undefined });
    expect(text).toHaveBeenCalledWith(expect.objectContaining({ initialValue: 'testuser' }));
  });

  it('skips prompts in non-interactive mode', async () => {
    const { text } = await import('@clack/prompts');
    const result = await promptGithub(undefined, true, null);
    expect(result).toEqual({ user: undefined, token: undefined });
    expect(text).not.toHaveBeenCalled();
  });

  it('prompts for username when not provided', async () => {
    const { text, password } = await import('@clack/prompts');
    vi.mocked(text).mockResolvedValue('newuser');
    vi.mocked(password).mockResolvedValue('token123');

    const result = await promptGithub(undefined, false, null);

    expect(result).toEqual({ user: 'newuser', token: 'token123' });
    expect(text).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('GitHub username') }),
    );
    expect(password).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('personal access token') }),
    );
  });

  it('returns undefined user when empty string entered', async () => {
    const { text } = await import('@clack/prompts');
    vi.mocked(text).mockResolvedValue('');

    const result = await promptGithub(undefined, false, null);

    expect(result).toEqual({ user: undefined, token: undefined });
  });

  it('skips token prompt when no user provided', async () => {
    const { text, password } = await import('@clack/prompts');
    vi.mocked(text).mockResolvedValue('');

    await promptGithub(undefined, false, null);

    expect(password).not.toHaveBeenCalled();
  });

  it('skips token prompt in non-interactive mode even with user', async () => {
    const { password } = await import('@clack/prompts');
    const result = await promptGithub('testuser', true, null);

    expect(result).toEqual({ user: 'testuser', token: undefined });
    expect(password).not.toHaveBeenCalled();
  });

  it('returns undefined token when empty string entered', async () => {
    const { text, password } = await import('@clack/prompts');
    vi.mocked(text).mockResolvedValue('user');
    vi.mocked(password).mockResolvedValue('');

    const result = await promptGithub(undefined, false, null);

    expect(result).toEqual({ user: 'user', token: undefined });
  });

  it('pre-fills username from existing config', async () => {
    const { text } = await import('@clack/prompts');
    vi.mocked(text).mockResolvedValue('configuser');

    const config = {
      github: { user: 'configuser', token: 'tok', repos: [] },
    } as unknown as GlobalConfig;
    const result = await promptGithub(undefined, false, config);
    expect(result).toEqual({ user: 'configuser', token: undefined });
    expect(text).toHaveBeenCalledWith(expect.objectContaining({ initialValue: 'configuser' }));
  });

  it('CLI flag takes precedence over config', async () => {
    const { text } = await import('@clack/prompts');
    vi.mocked(text).mockResolvedValue('cliuser');

    const config = {
      github: { user: 'configuser', token: 'tok', repos: [] },
    } as unknown as GlobalConfig;
    const result = await promptGithub('cliuser', false, config);
    expect(result).toEqual({ user: 'cliuser', token: undefined });
    expect(text).toHaveBeenCalledWith(expect.objectContaining({ initialValue: 'cliuser' }));
  });

  it('passes initialValue from config to text prompt when no user in config', async () => {
    const { text } = await import('@clack/prompts');
    vi.mocked(text).mockResolvedValue('');

    const config = { github: { user: '', token: '', repos: [] } } as unknown as GlobalConfig;
    await promptGithub(undefined, false, config);

    expect(text).toHaveBeenCalledWith(expect.objectContaining({ initialValue: undefined }));
  });
});
