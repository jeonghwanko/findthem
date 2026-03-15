import { defineConfig } from 'vitest/config';

// Separate config for integration tests that hit real external APIs.
// No mock setupFiles — uses real env vars from .env
// Run: npx vitest run --config vitest.integration.config.ts
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: [],
    testTimeout: 30_000,
  },
});
