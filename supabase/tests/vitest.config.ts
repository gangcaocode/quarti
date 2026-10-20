import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['supabase/tests/**/*.test.ts'],
    globalSetup: ['supabase/tests/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
