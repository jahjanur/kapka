import type { DonorProfile, SessionUser } from './api';

export type DonorStatusKind =
  'needs_email_confirmation' | 'paused' | 'cooling_down' | 'eligible';

export interface DonorStatus {
  kind: DonorStatusKind;
  /** Whether anything at all would reach this donor today. */
  reachable: boolean;
  /** Set only for `cooling_down`: the day they can give again. */
  eligibleFrom: string | null;
}

/**
 * The one answer to "will a request actually reach me".
 *
 * This exists because the page used to answer it in three places that could
 * disagree, and did: an amber block saying no request will ever reach you sat
 * directly above a green card saying nothing is holding you back. Both were
 * true of their own input and neither knew about the other.
 *
 * The conditions are not invented here. They are the five the matching query
 * itself applies — see MATCHING_QUERY in apps/api/src/matching/repository.ts:
 *
 *   u.is_active, u.email_verified, dp.is_available, dp.notify_by_email,
 *   and last_donation_date <= CURRENT_DATE - 56 days
 *
 * so the screen cannot promise something the query will refuse. `is_active`
 * is the one deliberately absent: a deactivated account cannot sign in, so it
 * can never be the state somebody is looking at.
 *
 * Priority is blocking-first, and the order between the middle two is the only
 * judgement in here: a pause is a standing choice with no end date and a
 * button that undoes it, where cooling down resolves by itself on a known
 * day. The one you can act on wins.
 */
export function resolveDonorStatus(
  user: Pick<SessionUser, 'emailVerified'>,
  profile: Pick<DonorProfile, 'isAvailable' | 'notifyByEmail' | 'eligibleFrom'>,
): DonorStatus {
  if (!user.emailVerified) {
    return { kind: 'needs_email_confirmation', reachable: false, eligibleFrom: null };
  }

  /* Either flag is a pause. The matching query requires both, so treating
     them as one state is what the donor actually experiences — and the
     control that sets them writes both together. */
  if (!profile.isAvailable || !profile.notifyByEmail) {
    return { kind: 'paused', reachable: false, eligibleFrom: null };
  }

  if (profile.eligibleFrom) {
    return {
      kind: 'cooling_down',
      reachable: false,
      eligibleFrom: profile.eligibleFrom,
    };
  }

  return { kind: 'eligible', reachable: true, eligibleFrom: null };
}
