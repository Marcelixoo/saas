import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './test/globalSetup.ts',
    hookTimeout: 60000,
    testTimeout: 30000,
    include: ['src/__tests__/**/*.test.ts'],
    pool: 'forks',
    fileParallelism: false,
  },
});
