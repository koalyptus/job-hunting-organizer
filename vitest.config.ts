import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Pin the test timezone so local-calendar assertions are deterministic
    // on every runner (CI default is UTC). See date.test.ts regression tests.
    env: { TZ: 'Australia/Brisbane' },
    include: ['src/**/*.{test,spec}.ts'],
    setupFiles: ['./src/test-setup.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/**/*.d.ts', 'src/**/index.ts', 'src/**/types.ts'],
    },
  },
});
