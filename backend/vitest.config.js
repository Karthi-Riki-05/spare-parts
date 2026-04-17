import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Tests share a single Postgres test DB. Parallel execution races on the
    // migration runner, so we run files (and tests within a file) serially.
    fileParallelism: false,
    sequence: { concurrent: false },
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.js'],
      exclude: ['src/server.js'],
    },
  },
});
