import { useSession } from './session';

export interface DonorStatus {
  /**
   * The boot refresh has not answered yet, so the other two are not yet
   * facts. Anything that would advertise registering must render nothing
   * while this is true — a CTA that appears and then vanishes reads as the
   * registration having failed.
   */
  isLoading: boolean;
  isAuthenticated: boolean;
  /**
   * Has a donor profile: a blood type and a city on file, which is what the
   * matching query joins on.
   *
   * Deliberately not `role === 'donor'`. A Google sign-in has that role and
   * no profile, and telling that person "we will email you when someone needs
   * your blood type" is a promise the system cannot keep — there is no type
   * to match against and the query never selects them.
   */
  isRegisteredDonor: boolean;
}

/**
 * The one answer to "should this person be asked to register".
 *
 * One hook rather than a `session &&` in every component, because the check
 * is subtler than it looks and got it wrong in two different ways before
 * this: the feed read the role, and everything else read merely whether
 * somebody was signed in.
 *
 * It reads the session and nothing else — no fetch. The flag rides on the
 * session from the API, so the first paint of every screen is already
 * correct and there is no window where the wrong CTA is on screen. That is
 * also why this is not a `useMe` wrapper: this header is on thirteen routes,
 * and thirteen extra requests for one boolean is a bad trade.
 */
export function useDonorStatus(): DonorStatus {
  const { session, restoring } = useSession();

  return {
    isLoading: restoring,
    isAuthenticated: session !== null,
    isRegisteredDonor: session?.user.hasDonorProfile === true,
  };
}
