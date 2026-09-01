import { expect, type Page } from '@playwright/test';

/**
 * Registering through the form, for tests that need a signed-in browser
 * rather than a row in a table.
 *
 * There is no sign-in screen yet, so this is the only way to get a session
 * into a tab. It handles both shapes of the form — two steps below 768px,
 * one page above — because every test that needs an account needs it at both
 * widths.
 */
export async function registerInBrowser(page: Page, email: string): Promise<void> {
  const isPhone = (page.viewportSize()?.width ?? 0) < 768;

  await page.goto('/register');
  await page.getByLabel(/Full name/).fill('Ana Petrovska');
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill('a-long-enough-password');
  if (isPhone) await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'O negative' }).click();
  await page.getByLabel(/City/).selectOption('Skopje');
  await page.getByRole('button', { name: /Register as donor/ }).click();

  await expect(page.getByRole('heading', { name: /Confirm your email/ })).toBeVisible();
}
