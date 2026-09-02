# src/cli

Commander-based CLI surface for `jho`.

- Registers all user-facing commands in `src/cli/index.ts`.
- Contains one module per command under `src/cli/commands/`.
- Owns terminal UX: `@clack/prompts`, spinners, markdown rendering, colors, output, stdin/clipboard helpers, natural-language dispatch, slug/campaign inference, and logging bootstrap.
- Commands are thin wrappers: they parse argv / prompt input, then delegate to `src/workflow/` orchestrators or `src/core/` pure logic.
- Tests live in `src/cli/tests/` and `integration-tests/cli/`.

This folder should not contain campaign/application business rules.
