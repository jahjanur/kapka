import { expect, test } from '@playwright/test';
import { mailbox, uniqueEmail, withDb } from './support/stack';

/**
 * A donor signing up, through the real stack.
 *
 * The unit tests already cover the form. What only this can reach is the
 * whole chain: the browser posts to a real API, bcrypt runs, two rows land in
 * PostgreSQL inside one transaction, a confirmation link is generated and
 * mailed, and following that link flips the column the matching query reads.
 *
 * It runs at 390 and 1280 because the form is genuinely two different
 * screens: two steps with a Continue button on a phone, one page on a
 * desktop. A test that only ran at one width would leave half the journey
 * unvisited.
 */

test('a donor registers, confirms their email, and joins the pool', async ({
  page,
  viewport,
}) => {
  const email = uniqueEmail('donor');
  const isPhone = (viewport?.width ?? 0) < 768;

  /* Through the gate, the way the product sends everybody: /register asks
     whether you have an account before it asks for one. */
  await page.goto('/register');
  await page.getByRole('link', { name: /Create account/ }).click();

  // The notice is reachable before anything is typed, which is the point of
  // keeping it on the same screen as the form.
  await expect(page.getByRole('link', { name: /What we store, and why/ })).toBeVisible();

  await page.getByLabel(/Full name/).fill('Ana Petrovska');
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill('a-long-enough-password');

  if (isPhone) {
    // Two steps on a phone: blood type and city are not on screen yet.
    await expect(page.getByLabel(/City/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Step 2 of 2')).toBeVisible();
  }

  await page.getByRole('button', { name: 'O negative' }).click();
  await page.getByRole('combobox', { name: /City/ }).click();
  await page.getByRole('option', { name: 'Skopje' }).click();
  await page.getByRole('button', { name: /Register as donor/ }).click();

  // The screen is honest about what has and has not happened.
  await expect(page.getByRole('heading', { name: /Confirm your email/ })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  // A real row, with a real hash, in a real database.
  const account = await withDb(async (db) => {
    const { rows } = await db.query<{
      email_verified: boolean;
      password_hash: string;
      blood_type: string;
      city: string;
    }>(
      `SELECT u.email_verified, u.password_hash, dp.blood_type, dp.city
       FROM users u JOIN donor_profiles dp ON dp.user_id = u.id
       WHERE u.email = $1`,
      [email],
    );
    return rows[0];
  });

  expect(account?.blood_type).toBe('O-');
  expect(account?.city).toBe('Skopje');
  expect(account?.password_hash).toMatch(/^\$2[aby]\$/);
  expect(account?.password_hash).not.toContain('a-long-enough-password');
  // Unverified until the link is followed: §12 gates the pool, not sign-in.
  expect(account?.email_verified).toBe(false);

  // The confirmation email really went, to them, with a usable link.
  const sent = mailbox().filter((mail) => mail.to === email);
  expect(sent).toHaveLength(1);
  expect(sent[0]?.subject).toMatch(/confirm/i);

  const link = /https?:\/\/\S+verify-email\S+/.exec(sent[0]?.text ?? '')?.[0];
  expect(link).toBeTruthy();

  await page.goto(link ?? '');
  await expect(page.getByRole('heading', { name: /email is confirmed/i })).toBeVisible();

  const verified = await withDb(async (db) => {
    const { rows } = await db.query<{ email_verified: boolean }>(
      'SELECT email_verified FROM users WHERE email = $1',
      [email],
    );
    return rows[0]?.email_verified;
  });
  expect(verified).toBe(true);
});

test('a duplicate email is refused on the field it belongs to', async ({
  page,
  viewport,
}) => {
  const email = uniqueEmail('dupe');
  const isPhone = (viewport?.width ?? 0) < 768;

  const fill = async () => {
    /* Arrive as somebody with no account, both times. Registering signs you
       in, and a signed-in visitor to this route is now shown "Become a donor"
       rather than a form that could only tell them their own email is taken —
       so without this the second pass finds no form at all. Clearing the
       cookie is what a second person, or the same one on another device,
       actually looks like to the server. */
    await page.context().clearCookies();
    await page.goto('/register/new');
    await page.getByLabel(/Full name/).fill('Ana Petrovska');
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/^Password/).fill('a-long-enough-password');
    if (isPhone) await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'O negative' }).click();
    await page.getByRole('combobox', { name: /City/ }).click();
    await page.getByRole('option', { name: 'Skopje' }).click();
    await page.getByRole('button', { name: /Register as donor/ }).click();
  };

  await fill();
  await expect(page.getByRole('heading', { name: /Confirm your email/ })).toBeVisible();

  await fill();
  /* Only the server knows this. It comes back with a field, which is why the
     message lands on the input rather than in a banner — and on a phone that
     means stepping back to the half of the form the email is on. */
  await expect(page.getByText('That email already has an account.')).toBeVisible();
  await expect(page.getByLabel(/^Email/)).toHaveAttribute('aria-invalid', 'true');
});
