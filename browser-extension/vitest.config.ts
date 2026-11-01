import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The extension's unit tests cover pure protocol/client logic; no DOM.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
