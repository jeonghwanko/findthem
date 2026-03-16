import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Resolve .js imports to .ts source files for NodeNext-style imports
    alias: {
      // Allow vitest to find .ts files when .js is imported
    },
  },
  resolve: {
    // Map .js extensions to their TypeScript source counterparts
    extensions: ['.ts', '.js'],
  },
});
