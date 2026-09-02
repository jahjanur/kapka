import { expect, type Page } from '@playwright/test';

/**
 * Registering through the form, for tests that need a signed-in browser
 * rather than a row in a table.
 *
 * Registering rather than signing in, even though there is a sign-in screen
 * now: these tests need an account that did not exist a moment ago, and
 * creating one is the only way to be sure of that.
 *
 * It handles both shapes of the form — two steps below 768px, one page above
 * — because every test that needs an account needs it at both widths.
 */
export async function registerInBrowser(page: Page, email: string): Promise<void> {
  const isPhone = (page.viewportSize()?.width ?? 0) < 768;

  /* Straight to the form: /register is the gate now, and these tests are not
     about the gate — donor-registration.spec.ts walks through that. */
  await page.goto('/register/new');
  await page.getByLabel(/Full name/).fill('Ana Petrovska');
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill('a-long-enough-password');
  if (isPhone) await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'O negative' }).click();
  /* City is a listbox the product draws rather than a <select> — see Picker. */
  await page.getByRole('combobox', { name: /City/ }).click();
  await page.getByRole('option', { name: 'Skopje' }).click();
  await page.getByRole('button', { name: /Register as donor/ }).click();

  await expect(page.getByRole('heading', { name: /Confirm your email/ })).toBeVisible();
}
