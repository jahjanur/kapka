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
  /**
   * Ranked above `request(':id')` by React Router, which scores a static
   * segment higher than a dynamic one whatever the order they are declared in.
   * App.test.tsx holds that behaviour down, because getting it wrong would
   * render the detail screen looking for a request called "new".
   */
  postRequest: '/requests/new',
  /** Admin-only, and the screen says so rather than pretending not to exist. */
  admin: '/admin',
  /** The donor's own dashboard (§9.5). */
  dashboard: '/me',
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
export const STATIC_PATHS: string[] = [
  PATHS.feed,
  PATHS.postRequest,
  PATHS.register,
  PATHS.howItWorks,
];
