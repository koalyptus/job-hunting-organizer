# Storage

`jho` keeps all user data on disk as markdown + JSON (see `PLAN.md` §3–§4). The
**on-disk format is the contract**; the filesystem engine that reads and writes
it is an implementation detail. The `src/storage/` module makes that explicit by
hiding the engine behind a `FileStore` port.

## Why a port

- **Swappable backend.** Core logic depends only on the `FileStore` interface,
  never on `@file-services` or `node:fs`. A future in-memory store (tests) or a
  different engine can be dropped in without touching callers.
- **Engine injection.** `LocalFileStore` receives its `IFileSystem` via the
  constructor, so the contract test suite runs against an in-memory adapter and
  the production path uses `createNodeFs()` (pinned `@file-services/node` 11.1.1).
- **No engine types leak.** `stat()` returns our own `StorageStat`, not the
  vendor's `IFileSystemStats`. Core never imports engine types.

## Layout

```
src/storage/
├── types.ts              # FileStore port, StorageStat, ReadDirOptions, error classes
├── index.ts              # barrel: port + LocalFileStore + createStore + resolveDataRoot
├── local/
│   ├── file-store.ts     # LocalFileStore adapter (IFileSystem → FileStore)
│   ├── path-guard.ts     # path-confinement helpers (security boundary)
│   └── factory.ts        # createStore(dataRoot?) → FileStore
└── tests/
    ├── contract.test.ts  # port contract + invalid-path / symlink-escape guards
    ├── path-guard.test.ts# direct unit tests of every guard vector
    └── file-store.test.ts
```

`resolveDataRoot()` is re-exported from `storage/index.ts` but implemented in
`core/paths.ts` — the single source of truth for the data root and the
`$JHO_DATA` override. The adapter does not re-implement it.

## The `FileStore` contract

Defined in `src/storage/types.ts`. Every path is a `StoragePath` — a **relative,
host-native** path (the same convention `node:path` uses; `/` on POSIX, `\` on
Windows). The port rejects absolute paths, `..` segments, and drive letters at
the boundary.

```ts
interface FileStore {
  read(path): Promise<string>;
  readBytes(path): Promise<Uint8Array>;
  write(path, content): Promise<void>;          // atomic: temp + rename
  append(path, content): Promise<void>;         // atomic, single engine call
  exists(path): Promise<boolean>;
  stat(path): Promise<StorageStat>;
  readdir(path, options?): Promise<StoragePath[]>;
  mkdir(path): Promise<void>;
  rename(from, to): Promise<void>;
  rm(path, options?): Promise<void>;
  copy(from, to): Promise<void>;
  withLock<T>(key, fn): Promise<T>;
  getDataRoot(): string;
}
```

`StorageStat` mirrors the vendor's `IFileSystemStats` shape (`mtime` as a `Date`,
like Node's `fs.Stats`) so the adapter passes the engine result through
unchanged — no re-casting.

```ts
interface StorageStat {
  readonly kind: StorageEntryKind;   // 'file' | 'directory'
  readonly size: number;             // bytes
  readonly mtime: Date;              // last modification time
}
```

Errors map to port classes (`StorageNotFoundError`, `StorageAlreadyExistsError`,
`StorageNotEmptyError`, `StorageUnsupportedError`) rather than engine `ErrnoError`
codes, so callers handle storage failures portably.

## Root confinement & symlink guards

`LocalFileStore` anchors every relative `StoragePath` to an absolute `dataRoot`
from config. Confinement is enforced by `src/storage/local/path-guard.ts`:

- **`toAbsolute`** — resolves the path under the root and rejects absolute
  paths, `..` segments, and Windows drive letters (`C:`).
- **`canonicalizeRoot`** — realpaths the root once. macOS keeps `/tmp` (and
  `/var/folders`) as a symlink to `/private/...`, and Windows may spell the temp
  root as an 8.3 short name (`RUNNER~1` vs `runneradmin`), so the declared and
  canonical spellings differ.
- **`assertWithinRoot`** — the literal check compares against the *declared*
  root; the realpath walk compares against the *canonical* root. A symlink
  *inside* the root pointing *outside* is caught ("escapes data root via
  symlink"), while a symlinked root itself (`/tmp → /private/tmp`) is treated as
  inside.
- **`forbidRootTarget`** — mutating operations (`write`/`append`/`mkdir`/`rm`/
  `rename`/`copy`) may never target the root itself (e.g. `rm('.')` would delete
  the whole store). Reads may target the root.

Guards are verified against macOS symlinked temp roots and Windows 8.3 short-name
spellings in `path-guard.test.ts` and `contract.test.ts`.

## Wiring

`createStore(dataRoot?)` builds a `LocalFileStore` (defaulting the root to
`resolveDataRoot()`). `src/cli/index.ts` and `src/mcp/server.ts` each call
`createStore()` once at startup and thread the returned `FileStore` into command
and tool constructors. `config.json` and logs stay on direct `fs` — they hold
credentials and are local-only by definition, so they are deliberately **not**
routed through the port.
