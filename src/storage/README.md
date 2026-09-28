# src/storage

Storage port and local filesystem adapter.

- `types.ts` — `FileStore` port and error classes. This is the seam all persistence flows through.
- `index.ts` — re-exports the storage port, adapters, and `createStore`.
- `local/` — `LocalFileStore` maps the port over `@file-services/node` (`createNodeFs()`, pinned 11.1.1). It enforces root confinement, maps engine errors to port errors, and provides atomic write/append behavior.
- `local/factory.ts` — `createStore()` adapter factory wiring.
- `local/path-guard.ts` — rejects absolute paths, `..`, and drive letters before storage operations.
- `memory.ts` — in-memory `FileStore` implementation for tests.
- `tests/` — contract and adapter tests for the port.

Future adapters can implement `FileStore` without changing core/workflow call sites.
