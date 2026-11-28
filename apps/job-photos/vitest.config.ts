import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}'],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      // `server-only` throws outside Next's server build; unit tests may import server modules.
      'server-only': new URL('./tests/unit/server-only-stub.ts', import.meta.url).pathname,
    },
  },
});
