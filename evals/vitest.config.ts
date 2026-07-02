import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['evals/**/*.test.ts'],
    reporters: ['verbose'],
    testTimeout: 600_000, // Matches EVAL_TIMEOUT_MS in matchers.ts
  },
});
