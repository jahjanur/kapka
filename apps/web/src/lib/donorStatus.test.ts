import { describe, expect, it } from 'vitest';
import { resolveDonorStatus } from './donorStatus';

const VERIFIED = { emailVerified: true };
const UNVERIFIED = { emailVerified: false };
const LIVE = { isAvailable: true, notifyByEmail: true, eligibleFrom: null };

describe('the donor status resolver', () => {
  it('answers exactly one thing, whatever the inputs', () => {
    /* The whole point. The screen used to render an amber "no request will
       ever reach you" above a green "nothing is holding you back", because
       two branches read two inputs and neither knew about the other. */
    const status = resolveDonorStatus(UNVERIFIED, LIVE);
    expect(status.kind).toBe('needs_email_confirmation');
    expect(status.reachable).toBe(false);
  });

  it('puts an unconfirmed address above everything else', () => {
    // Nothing is ever sent to it, so no other state is worth reporting.
    for (const profile of [
      LIVE,
      { ...LIVE, isAvailable: false },
      { ...LIVE, notifyByEmail: false },
      { ...LIVE, eligibleFrom: '2026-12-01' },
    ]) {
      expect(resolveDonorStatus(UNVERIFIED, profile).kind).toBe(
        'needs_email_confirmation',
      );
    }
  });

  it('reads both pause flags, because the matching query requires both', () => {
    /* The page's control used to write is_available while its copy talked
       about email, leaving notify_by_email untouched and the donor half
       paused with nothing on screen saying so. */
    expect(resolveDonorStatus(VERIFIED, { ...LIVE, isAvailable: false }).kind).toBe(
      'paused',
    );
    expect(resolveDonorStatus(VERIFIED, { ...LIVE, notifyByEmail: false }).kind).toBe(
      'paused',
    );
  });

  it('prefers the pause to the wait, because only one of them has a button', () => {
    const status = resolveDonorStatus(VERIFIED, {
      isAvailable: false,
      notifyByEmail: true,
      eligibleFrom: '2026-12-01',
    });
    expect(status.kind).toBe('paused');
  });

  it('carries the date a cooling-down donor is waiting for', () => {
    const status = resolveDonorStatus(VERIFIED, {
      ...LIVE,
      eligibleFrom: '2026-12-01',
    });
    expect(status).toEqual({
      kind: 'cooling_down',
      reachable: false,
      eligibleFrom: '2026-12-01',
    });
  });

  it('is reachable only when every condition the query applies is met', () => {
    expect(resolveDonorStatus(VERIFIED, LIVE)).toEqual({
      kind: 'eligible',
      reachable: true,
      eligibleFrom: null,
    });
  });
});
