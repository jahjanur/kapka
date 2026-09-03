import { cx } from '../../lib/cx';
import styles from './BloodBag.module.css';

/**
 * The unit of blood on the head of a request (§9.4).
 *
 * Decoration, and marked as such: it repeats the blood type badge, the title
 * and the units figure that sit beside it, so a screen reader that read it
 * would be reading the same request a fourth time. It is drawn rather than
 * shipped as an image because it is four rectangles and a droplet — a PNG of
 * it would cost more than the whole icon sprite and would not follow the
 * theme.
 *
 * Every colour is an accent token, so it turns with the palette in dark mode
 * without a second copy of the drawing.
 */
/* `| undefined` explicitly: exactOptionalPropertyTypes means a bare
   `className?: string` cannot be handed a CSS-module lookup, which
   noUncheckedIndexedAccess types as `string | undefined`. Same note as Card. */
export function BloodBag({ className }: { className?: string | undefined }) {
  return (
    <svg
      className={cx(styles.art, className)}
      viewBox="0 0 140 148"
      aria-hidden="true"
      focusable="false"
    >
      {/* Passes behind the bag and out the other side, so the bag reads as
          standing in front of it rather than sitting next to a stray line. */}
      <path className={styles.pulse} d="M2 84h26l4-12 5 26 6-34 5 20h44" />

      <path className={styles.fitting} d="M70 30V14M84 30V8M98 30V14" />
      <rect className={styles.neck} x="60" y="26" width="48" height="12" rx="6" />

      <rect className={styles.body} x="54" y="34" width="60" height="78" rx="14" />
      <rect className={styles.gloss} x="60" y="40" width="48" height="7" rx="3.5" />

      {/* The droplet from the icon sprite, scaled and centred in the bag —
          same drawing, so the two never drift apart. */}
      <path
        className={styles.drop}
        transform="translate(69.6 61.6) scale(1.2)"
        d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5S12.5 5.5 12 3c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7Z"
      />

      <path className={styles.tube} d="M84 112v12c0 6-4 10-10 10H58" />
      <rect className={styles.neck} x="46" y="129" width="12" height="10" rx="5" />
    </svg>
  );
}
