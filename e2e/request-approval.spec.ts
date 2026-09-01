import { expect, test } from '@playwright/test';
import { registerInBrowser } from './support/app';
import {
  clearDonorsIn,
  mailbox,
  makeDonor,
  postRequest,
  promoteToAdmin,
  registerViaApi,
  uniqueEmail,
  withDb,
} from './support/stack';

/**
 * A pending request becoming email in a donor's inbox, through the real
 * stack (§4, §5).
 *
 * This is the flow the whole product exists for, and it is the one no unit
 * test can stand in for: it crosses the browser, the API, the compatibility
 * matrix in SQL, the notification log's unique index, and the mailer. Every
 * step of it has a test somewhere; nothing until now has checked that they
 * are connected to each other.
 *
 * At 390 the queue is cards and every decision is on the card. At 1280 it is
 * a table with a drawer, and the request has to be opened before it can be
 * decided on. Same journey, two genuinely different screens.
 */

/* A city of its own, emptied first. The count in the confirmation is the
   assertion that matters most here, and an exact count is only meaningful if
   this test owns every donor that could satisfy it. */
const CITY = 'Bitola';

test('an admin approves a request and only the matching donor is emailed', async ({
  page,
}) => {
  const isPhone = (page.viewportSize()?.width ?? 0) < 768;

  await clearDonorsIn(CITY);

  /*
   * Four donors in one city, of whom exactly one should hear about a request
   * for O− blood. The other three are each excluded by a different rule, so
   * if approval ever degrades into "email everyone nearby" this test says
   * which rule stopped working rather than only that something did.
   */
  const matching = uniqueEmail('match');
  const wrongType = uniqueEmail('wrong-type');
  const paused = uniqueEmail('paused');
  const unverified = uniqueEmail('unverified');

  await makeDonor(matching, { bloodType: 'O-', city: CITY });
  // A+ cannot give to an O− patient. Getting this backwards is §5.1's warning.
  await makeDonor(wrongType, { bloodType: 'A+', city: CITY });
  await makeDonor(paused, { bloodType: 'O-', city: CITY, available: false });
  await makeDonor(unverified, { bloodType: 'O-', city: CITY, verified: false });

  // Somebody posts a request. It lands pending: nothing reaches a donor until
  // a human decides (§4).
  const hospital = `Bitola General ${String(Date.now())}`;
  const requesterToken = await registerViaApi(uniqueEmail('requester'));
  const requestId = await postRequest(requesterToken, {
    bloodType: 'O-',
    city: CITY,
    hospitalName: hospital,
    contactPhone: '+389 70 123 456',
    unitsNeeded: 2,
    urgency: 'critical',
  });

  // An admin arrives. The role is a database fact, and the API reads it from
  // the database on every request — so promoting and reloading is enough, and
  // the boot refresh mints an access token that agrees.
  const admin = uniqueEmail('admin');
  await registerInBrowser(page, admin);
  await promoteToAdmin(admin);

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Moderation queue' })).toBeVisible();

  if (!isPhone) {
    // The table names the request; the decision lives in the drawer.
    await expect(page.getByRole('table')).toBeVisible();
    await page.getByRole('button', { name: hospital }).click();
    await expect(
      page.getByRole('complementary', { name: 'Request detail' }),
    ).toBeVisible();
  } else {
    // Cards, and no drawer — everything a decision needs is already on screen.
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: hospital })).toBeVisible();
  }

  // The reach is stated before anything is clicked, and it is one donor —
  // not the four in the city, and not the three that were excluded.
  await expect(
    page.getByText('Approving emails 1 donor immediately. It cannot be undone.'),
  ).toBeVisible();

  const before = mailbox().length;

  await page.getByRole('button', { name: 'Approve and notify' }).click();

  /* The gate (§9.6). The number is in the heading and again in the button, so
     the control being clicked says what it does. */
  await expect(page.getByRole('heading', { name: 'Email 1 donor now?' })).toBeVisible();
  await expect(page.getByText(`1 donor in ${CITY} will be emailed about`)).toBeVisible();
  await page.getByRole('button', { name: 'Yes, email 1 donor' }).click();

  await expect(page.getByText('Approved — 1 of 1 emailed')).toBeVisible();
  // Decided, so it is out of the queue.
  await expect(page.getByRole('button', { name: hospital })).toHaveCount(0);

  // ── The email actually went, to exactly one person ──────────────────────
  const sent = mailbox().slice(before);
  expect(sent.map((mail) => mail.to)).toEqual([matching]);
  /* A real minus sign, not a hyphen. The database stores 'O-' and every
     surface a person reads renders 'O−', so this is the assertion that says
     the email went through the same formatting as the rest of the product
     rather than printing a column value. */
  expect(sent[0]?.subject).toContain('O−');
  expect(sent[0]?.text).toContain(hospital);
  expect(sent[0]?.text).toContain(requestId);

  for (const address of [wrongType, paused, unverified]) {
    expect(mailbox().filter((mail) => mail.to === address)).toEqual([]);
  }

  // ── And the database agrees with the screen ─────────────────────────────
  const record = await withDb(async (db) => {
    const { rows } = await db.query<{ status: string; logged: string }>(
      `SELECT r.status,
              (SELECT count(*) FROM notification_log nl WHERE nl.request_id = r.id) AS logged
       FROM blood_requests r WHERE r.id = $1`,
      [requestId],
    );
    return rows[0];
  });
  expect(record?.status).toBe('approved');
  // One row, which is what stops a second approval mailing anyone twice.
  expect(record?.logged).toBe('1');

  /* Approved means public. The heading leads on what is needed rather than
     on the hospital's name, which is the line underneath it — the donor
     deciding whether to go is answering "can I help", not "where is this". */
  await page.goto(`/requests/${requestId}`);
  await expect(
    page.getByRole('heading', { name: '2 units of O negative needed' }),
  ).toBeVisible();
  await expect(page.getByText(`${hospital}, ${CITY}`)).toBeVisible();
});

test('the queue refuses an account that does not moderate', async ({ page }) => {
  /* The screen says so plainly rather than pretending the route is missing.
     Access control itself is the API's job (§12) — this is the half of it a
     person actually sees. */
  await registerInBrowser(page, uniqueEmail('donor-not-admin'));

  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'This page is for administrators' }),
  ).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});
