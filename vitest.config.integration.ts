import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['integration-tests/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 10000,
    passWithNoTests: true,
  },
});
