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
} as const;

/** The static ones, for the route table and for tests that check the nav. */
export const STATIC_PATHS: string[] = [PATHS.feed, PATHS.register, PATHS.howItWorks];
