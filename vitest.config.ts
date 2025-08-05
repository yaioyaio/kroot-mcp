import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov', 'json-summary'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/manual/',
        '*.config.ts',
        '*.config.js',
        'scripts/',
        'src/dashboard/**', // UI components tested separately
        'src/**/*.d.ts',
        'src/**/types.ts',
        'src/**/index.ts', // Barrel exports
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      include: ['src/**/*.ts'],
      all: true,
    },
    include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist', 'tests/manual'],
    setupFiles: ['./tests/setup.ts'],
    reporters: ['default', 'html', 'json'],
    outputFile: {
      json: './coverage/test-results.json',
      html: './coverage/test-report.html',
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});