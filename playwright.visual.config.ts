import { defineConfig, devices } from '@playwright/test';

/**
 * Visual regression, kept apart from the end-to-end flows on purpose.
 *
 * Two reasons. The flows need a database and an API; the component specimens
 * need neither, so this config starts one dev server and nothing else. And
 * screenshots are platform-specific in a way that behaviour is not — the same
 * CSS rasterises differently on macOS and Linux — so this suite is run
 * deliberately rather than folded into the check that gates every push. See
 * README-visual.md for what that means before turning it on in CI.
 */

const WIDTHS = [360, 768, 1280] as const;
const THEMES = ['light', 'dark'] as const;

export default defineConfig({
  testDir: './visual',
  testMatch: '**/*.visual.ts',
  /* Serial. Six projects each drive one page through fifty screenshots; in
     parallel they contend for CPU, and a loaded machine renders text a
     fraction differently, which is exactly the thing this suite measures. */
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  /* Platform in the path, deliberately. A baseline shot on macOS is not a
     baseline for Linux, and the failure everyone wants in that case is "no
     snapshot here" rather than a diff of the antialiasing. */
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}',

  expect: {
    toHaveScreenshot: {
      /* Zero tolerance. Every source of movement — the clock, fonts,
         animations — is pinned below, so a difference here is a real one and
         a threshold would only be a place for regressions to hide. */
      maxDiffPixels: 0,
    },
  },

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },

  projects: WIDTHS.flatMap((width) =>
    THEMES.map((theme) => ({
      name: `${String(width)}-${theme}`,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width, height: 900 },
        /* Matched to the theme the harness sets, so anything reading the
           media query directly agrees with the data-theme attribute. */
        colorScheme: theme,
      },
      metadata: { theme },
    })),
  ),

  webServer: {
    /* No VITE_API_URL: the specimens are given their props directly and must
       never make a request. A harness that fetches is a harness that can fail
       for a reason that has nothing to do with how a component looks. */
    command: 'npm run dev --workspace @kapka/web',
    url: 'http://localhost:5173/visual-harness.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
