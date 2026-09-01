import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end: a real browser, the real web app, the real API, a real
 * PostgreSQL with the real migrations applied.
 *
 * Two projects rather than two assertions, because the flows differ by more
 * than pixels. Registration is two steps on a phone and one page on a desktop,
 * and the moderation queue is cards on a phone and a table with a drawer on a
 * desktop — the same journey through genuinely different screens, which is
 * exactly the thing a unit test cannot reach.
 */
export default defineConfig({
  testDir: './e2e',
  /* Serial. The stack is one database, and these tests moderate requests and
     count emails — running them in parallel would have them counting each
     other's. */
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: 'http://localhost:5173',
    /* On the first failure the trace is the difference between "it went red
       in CI" and knowing which step and what the page looked like. */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'phone-390',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'desktop-1280',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],

  webServer: [
    {
      // Started from apps/api so tsx resolves the workspace's dependencies.
      command: 'npx tsx ../../e2e/server/stack.ts',
      cwd: 'apps/api',
      url: 'http://localhost:4100/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
    },
    {
      /* VITE_API_URL is what makes the app talk to the real API rather than
         the seed data — a dev build with neither falls back to the demo
         client, and these tests would then be checking a fixture.

         It is the relative '/api', not the API's own origin, so the browser
         sees a single origin and Vite's proxy forwards to the stack. Pointing
         it straight at :4100 does not work and should not: the app ships a
         CSP with connect-src 'self', so a cross-origin fetch is refused by
         the browser before it is sent. Production serves the API under the
         same origin, and this makes the tests run against that topology
         rather than around it. */
      command: 'npm run dev --workspace @kapka/web',
      env: { VITE_API_URL: '/api', VITE_PROXY_TARGET: 'http://localhost:4100' },
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
