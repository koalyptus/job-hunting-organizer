import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'cli/index': 'src/cli/index.ts',
    'mcp/server': 'src/mcp/server.ts',
  },
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  dts: true,
  // Sourcemaps disabled for a leaner published tarball (~2 MB savings).
  // Stack traces will be minified; users can file issues with the version
  // and we can debug from the source repo.
  sourcemap: false,
  shims: false,
  splitting: false,
  treeshake: true,
});
