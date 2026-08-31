import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * One test run across the workspace, split into projects so each gets the
 * environment it actually needs — jsdom is slow and pointless for pure
 * schema tests, and Node cannot render a component.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          root: './packages/shared',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'tokens',
          root: './packages/tokens',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'api',
          root: './apps/api',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          // One PostgreSQL for the whole run, started here rather than once
          // per file. Each file takes its own database from a template.
          globalSetup: ['./src/test/globalSetup.ts'],
          hookTimeout: 120_000,
          env: {
            // §12's cost of 12 is right in production and ruinous here: the
            // suite performs hundreds of hashes, and the CPU they burn was
            // starving supertest's sockets into hanging up.
            BCRYPT_COST: '4',
          },
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'web',
          root: './apps/web',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      exclude: ['**/*.test.*', '**/test/**', '**/dist/**', '**/*.config.*'],
    },
  },
});
