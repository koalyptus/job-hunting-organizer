import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['integration-tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 5000,
    passWithNoTests: true,
    coverage: {
      exclude: ['src/**/*.test.ts', 'src/**/tests/**', 'integration-tests/**'],
    },
  },
});
