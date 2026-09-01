import { expect, test, type Page } from '@playwright/test';

/**
 * Every component variant, at 360, 768 and 1280, in both themes.
 *
 * The specimens live in apps/web/visual-harness — a page on the dev server
 * that is not a route in the app and not in the production build. The list is
 * read off the running page rather than imported, because the catalogue is
 * TSX that imports CSS modules and this file runs in plain Node; a second
 * copy of the list here would go stale the first time somebody adds a
 * component.
 *
 * Everything that could move between two runs is pinned: the clock, so
 * "posted 4 hours ago" says the same thing tomorrow; fonts, waited for
 * before the first shot; and animations, which Playwright freezes for
 * screenshots by default.
 */

/** The same instant the catalogue's fixtures are written against. */
const CLOCK = new Date('2026-06-15T12:00:00.000Z');

interface Specimen {
  id: string;
  solo: boolean;
}

async function openHarness(page: Page, theme: string, only?: string): Promise<void> {
  /* Only Date.now() is pinned, not the timers. Installing a controllable
     clock stops React's scheduler as well, and a page that never renders
     photographs nothing. */
  await page.clock.setFixedTime(CLOCK);
  /* The offline specimens below cut the page's network and the setting
     outlives them, so the next navigation would fail with
     ERR_INTERNET_DISCONNECTED rather than photograph anything. Restored here
     rather than after each one: this is the only place that needs a
     connection, so this is the place that should insist on having one. */
  await page.context().setOffline(false);
  const query = only ? `&only=${encodeURIComponent(only)}` : '';
  await page.goto(`/visual-harness.html?theme=${theme}${query}`);
  // Inter is self-hosted, so this is a local read — but it is still a read,
  // and a screenshot taken before it lands is a screenshot of the fallback.
  await page.evaluate(() => document.fonts.ready);
}

/**
 * The specimens that need the page put into a state first.
 *
 * Only the offline banner, which renders nothing at all until the browser
 * says the connection has gone — there is no prop for it, and there should
 * not be: it reads the real thing.
 */
const PREPARE: Record<string, (page: Page) => Promise<void>> = {
  'offline-banner-offline': async (page) => {
    await page.context().setOffline(true);
    await expect(page.getByText('You are offline.')).toBeVisible();
  },
  'offline-banner-back': async (page) => {
    await page.context().setOffline(true);
    await expect(page.getByText('You are offline.')).toBeVisible();
    await page.context().setOffline(false);
    await expect(page.getByText('Back online.')).toBeVisible();
  },
};

/* "Back online." takes itself off screen after four seconds, and that timer
   is real — the clock above pins the date, not the timers. Four seconds is a
   wide window for one screenshot, but it is a window, so this one is not
   allowed to sit and retry past it. */
const BRIEF = 3_000;

test('every component variant', async ({ page }, testInfo) => {
  const theme = String(testInfo.project.metadata.theme);

  await openHarness(page, theme);
  // Asserted rather than declared globally: this file is not part of the web
  // app's project, and the harness is what guarantees the shape.
  const specimens: Specimen[] = await page.evaluate(
    () => (window as unknown as { __SPECIMENS__: Specimen[] }).__SPECIMENS__,
  );
  expect(specimens.length).toBeGreaterThan(0);

  for (const specimen of specimens.filter((one) => !one.solo)) {
    await test.step(specimen.id, async () => {
      /* Soft, so one changed component reports every other difference in the
         same run instead of hiding forty of them behind the first. */
      await expect
        .soft(page.locator(`[data-variant="${specimen.id}"]`))
        .toHaveScreenshot(`${specimen.id}.png`);
    });
  }

  /* A modal makes the rest of the document inert and a toast is positioned
     against the viewport, so these get a page each and are shot whole. */
  for (const specimen of specimens.filter((one) => one.solo)) {
    await test.step(specimen.id, async () => {
      await openHarness(page, theme, specimen.id);
      await PREPARE[specimen.id]?.(page);
      await expect.soft(page).toHaveScreenshot(`${specimen.id}.png`, { timeout: BRIEF });
    });
  }
});
