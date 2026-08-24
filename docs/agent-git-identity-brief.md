# Git Identity for AI Coding Agents — Brief

## Problem

When an AI agent commits code locally, GitHub attributes commits by **email**, not name. Using the human's noreply email (`8214629+koalyptus@users.noreply.github.com`) causes commits to appear under the human account (`koalyptus`) even when the author name says `agent-laptop[bot]`.

Additionally, SSH signature verification does **not** work for bot accounts on GitHub — commits show as "unverified" even with a correctly registered signing key.

## Industry Standard (Codex, Claude Code, Cursor, Copilot, etc.)

| Tool                          | Identity Method                                 | Signing? |
| ----------------------------- | ----------------------------------------------- | -------- |
| OpenAI Codex                  | `GIT_AUTHOR_NAME=codex` env var                 | No       |
| Claude Code                   | `GIT_AUTHOR_NAME=claude` env var                | No       |
| Cursor                        | `GIT_AUTHOR_NAME=cursor` env var                | No       |
| GitHub Copilot                | Uses user's GitHub identity (gh CLI)            | No       |
| Devin / SWE-agent / OpenHands | `GIT_AUTHOR_NAME` + `GIT_AUTHOR_EMAIL` env vars | No       |

**Universal pattern:**

1. Set `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL` environment variables
2. Do NOT sign commits
3. Use the bot's GitHub noreply email: `{bot_id}+{bot_login}@users.noreply.github.com`

## Recommendation

Drop SSH signing. Use per-worktree git config with:

- `user.name = agent-laptop[bot]`
- `user.email = 320004057+agent-laptop[bot]@users.noreply.github.com`
- Remove `gpgsign` and `signingkey` from worktree config

This is simpler, matches industry practice, and commits will correctly appear under the bot identity on GitHub. The "verified" badge is not worth the complexity of key management for ephemeral agent environments.
