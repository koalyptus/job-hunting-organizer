# JHO browser extension

Browser extension for [job-hunting-organizer](../README.md): track applications
from LinkedIn, Seek and Indeed, and review campaign status from the popup.

This is the scaffold adopted by issue #112, at the location decided in
[`docs/ROADMAP.md`](../docs/ROADMAP.md) → *Browser extension — code location*
(option A: a project folder in this repo, no workspace, no shared package).

## Stack

| Surface   | Choice                                                             |
| --------- | ------------------------------------------------------------------ |
| Tooling   | [WXT](https://wxt.dev) 0.21.x — Vite-based, file-based entrypoints |
| Popup     | React 19 + `@wxt-dev/module-react` + shadcn/ui (Radix) + Tailwind v4 |
| Content   | **Not React** — WXT `createShadowRootUi` + a few kB of vanilla TS/CSS |
| Utilities | `cva` + `tailwind-merge` (`cn()`), `clsx`, `lucide-react`           |

The content script is framework-free on purpose: a shadow root keeps the job
board's CSS out, and it avoids shipping React into every job page.

## Bootstrap

```sh
npm install
npm run dev          # HMR dev server + extension pre-rendered
```

## Load unpacked

```sh
npm run build        # -> .output/chrome-mv3/
```

Then in Chrome/Edge: `chrome://extensions` → enable *Developer mode* →
**Load unpacked** → select `.output/chrome-mv3/`.

Firefox:

```sh
npm run build:firefox   # -> .output/firefox-mv2/
```

## Scripts

| Script                  | Purpose                               |
| ----------------------- | ------------------------------------- |
| `npm run dev`           | Dev server with HMR                   |
| `npm run build`         | Production build (chrome-mv3)         |
| `npm run build:firefox` | Production build (firefox-mv2)        |
| `npm run zip`           | Zip the built extension               |
| `npm run zip:firefox`   | Zip the Firefox build                 |
| `npm run compile`       | `tsc --noEmit`                        |
| `npm test`              | Vitest unit tests (protocol/client)   |

## Architecture

```
entrypoints/
├── popup/        # React popup (shadcn/ui + Tailwind)
├── background.ts # service worker: owns the MCP session
└── content.ts    # framework-free shadow-DOM content script
src/
├── bridge/       # popup <-> background message contract + settings
├── components/   # app components + ui/ (shadcn/ui primitives)
├── hooks/        # useBridge() popup state
├── lib/          # cn(), status -> badge variant
└── mcp/          # minimal Streamable HTTP MCP client + protocol helpers
```

The popup and content script never touch the campaign filesystem. They message
the background worker, which holds the MCP session and calls jho tools — so the
CLI/MCP writers (locks, toolhash, atomic writes) stay the single source of
truth.

## MCP bridge dependency

The extension calls `jho mcp --http` over MCP **Streamable HTTP** at
`http://127.0.0.1:7331/mcp` (the `DEFAULT_HTTP_PORT` documented in
[`docs/mcp-http-transport.md`](../docs/mcp-http-transport.md)). The URL is
editable in the popup.

Start the bridge before using the extension:

```sh
jho mcp --http            # port 7331
jho mcp --http --port N   # custom port
```

> The HTTP transport is intended for local development: it binds `0.0.0.0` and
> performs no authentication. Do not expose it to untrusted networks. The
> extension's `host_permissions` are scoped to loopback.

## Repo constraints

The extension is deliberately **outside** the CLI's toolchain — see the
`browser-extension isolation` test in `src/lib/tests/`:

- root `tsconfig.json` `include` does not cover `browser-extension/**`
- root `vitest.config.ts` `include` stays `src/**`
- root `package.json` `files` and `workspaces` exclude it
- root eslint and prettier ignore it

## Tests

```sh
npm test
```

Unit tests cover the Streamable HTTP protocol helpers and the MCP client
(session-id propagation, JSON and SSE response decoding, error handling).

End-to-end verification against a live bridge needs `jho mcp --http`
(issue #111).
