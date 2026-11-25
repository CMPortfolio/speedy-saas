import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}'],
    testTimeout: 30_000,
    // The shared DB harness applies its shim on every connect; two test files doing that at once
    // can fail with "tuple concurrently updated". Run files one at a time.
    fileParallelism: false,
  },
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
});
