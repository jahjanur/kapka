/**
 * The JS side of the token layer.
 *
 * CSS custom properties cannot be used inside a @media or @container prelude,
 * and JS sometimes needs the same numbers, so these mirror the CSS. If you
 * change one, change both — scale.css names this file for exactly that reason.
 *
 * The CSS itself is imported by path:
 *   import '@kapka/tokens/tokens.css';
 *   import '@kapka/tokens/scale.css';
 *   import '@kapka/tokens/global.css';
 */
export { BREAKPOINTS, REVIEW_WIDTHS, type Breakpoint } from './breakpoints';
export { space, type SpaceStep } from './space';
