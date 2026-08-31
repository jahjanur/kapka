/**
 * Breakpoints (§7.1), mirrored from scale.css.
 *
 * CSS custom properties cannot be used inside a @media or @container prelude,
 * so the rem literals are written out in the queries. This module is the JS
 * side of the same numbers — if you change one, change both.
 *
 * Mobile-first: these are min-widths. We only ever scale UP.
 */
export const BREAKPOINTS = {
  sm: 480,   // large phones      — 30rem
  md: 768,   // tablets           — 48rem
  lg: 1024,  // laptops           — 64rem
  xl: 1280,  // desktops          — 80rem
  '2xl': 1536, // large desktops  — 96rem
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/** The widths every screen is reviewed at (§7.1). 360 is the hard floor. */
export const REVIEW_WIDTHS = [360, 390, 480, 768, 1024, 1280, 1440, 1920] as const;
