import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['evals/**/*.test.ts'],
    reporters: ['verbose'],
    testTimeout: 10_000,
  },
});
