import { describe, expect, it } from 'vitest';
import { createApiClient } from './api';

/*
 * The client a dev build with no VITE_API_URL gets — the one every screenshot
 * and every first run of this repo is taken against.
 *
 * It used to hand back a session in the visitor's own name and then answer
 * every later call about somebody else: you registered as yourself, opened
 * your profile, and read Demo Donor, of Skopje, O−. A demo that contradicts
 * what it was just told teaches the reader that nothing they type matters,
 * and it makes a real bug and a fake one impossible to tell apart.
 */
describe('the demo client', () => {
  const api = createApiClient();

  const registered = api.register({
    fullName: 'Agan Aliu',
    email: 'agan@example.com',
    password: 'a-long-enough-password',
    bloodType: 'B+',
    city: 'Tetovo',
    lastDonationDate: null,
  });

  it('answers about whoever registered', async () => {
    const session = await registered;
    expect(session.user.fullName).toBe('Agan Aliu');

    const me = await api.getMe(session.accessToken);
    expect(me.user.fullName).toBe('Agan Aliu');
    expect(me.user.email).toBe('agan@example.com');
    // Not confirmed: registering does not open the link in the email, and the
    // matching query refuses a donor who has not.
    expect(me.user.emailVerified).toBe(false);
  });

  it('keeps the details that were entered, rather than a stock donor’s', async () => {
    const session = await registered;
    const me = await api.getMe(session.accessToken);
    expect(me.donorProfile?.bloodType).toBe('B+');
    expect(me.donorProfile?.city).toBe('Tetovo');
    expect(me.donorProfile?.lastDonationDate).toBeNull();
  });

  it('has emailed a minute-old account about nothing', async () => {
    const session = await registered;
    // The two canned rows are for the stock demo account. Attributing them to
    // somebody who just signed up is the same lie in a different place.
    await expect(api.listMyNotifications(session.accessToken)).resolves.toEqual([]);
  });

  it('confirms the address when the link is opened', async () => {
    const session = await registered;
    expect((await api.verifyEmail('any-token')).emailVerified).toBe(true);
    expect((await api.getMe(session.accessToken)).user.emailVerified).toBe(true);
  });
});
