/**
 * Every screen the product routes to, in one place.
 *
 * App.tsx registers these and AppHeader navigates to them, so a nav item
 * pointing at a route nobody built cannot compile — which is the failure this
 * replaces. A nav link to a 404 is worse than no nav at all.
 */
export const PATHS = {
  feed: '/',
  request: (id: string) => `/requests/${id}`,
  register: '/register',
  howItWorks: '/how-it-works',
  /**
   * Where a confirmation email lands, with the token in the query string. The
   * page posts it to the API — see the note in verifyEmailSchema about why the
   * email does not link at the API directly.
   */
  verifyEmail: '/verify-email',
} as const;

/**
 * The static ones, for the route table and for tests that check the nav.
 *
 * verifyEmail is deliberately absent: it is reachable only from a link in an
 * email, is meaningless without a token, and has no business in a nav.
 */
export const STATIC_PATHS: string[] = [PATHS.feed, PATHS.register, PATHS.howItWorks];
