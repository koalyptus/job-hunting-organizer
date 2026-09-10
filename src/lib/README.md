# src/lib

Infrastructure utilities that perform I/O but contain no campaign/application domain logic.

- `paths.ts` — resolve `$JHO_DATA`, `$JHO_CONFIG_HOME`, campaign/applied/profile/knowledge-base paths, cwd inference.
- `config/` — global and campaign config read/write/merge/migration/redaction.
- `fs.ts` — atomic write, backup wrapper, existence checks.
- `locks.ts` — `proper-lockfile` wrapper.
- `toolhash.ts` — content hashing and `.sidecars/` toolhash sidecar management.
- `package.ts` — `package.json` metadata.
- `cv.ts` — CV parsing for PDF/DOCX/TXT/MD.
- `frontmatter.ts` — markdown frontmatter read/write.
- `constants.ts` — shared literals/constants.
- `logger/` — pino logger factory and root logger.

This layer is the boundary between pure core logic and real filesystem/OS behavior.
