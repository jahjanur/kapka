import { cx } from '../../lib/cx';
import styles from './DropletArt.module.css';

/**
 * The hero's illustration: a drop of blood held in a pair of cupped hands,
 * with a heart at its centre.
 *
 * Drawn rather than photographed. A stock photograph of a smiling donor is a
 * promise a pilot cannot keep, and a diagram is honest about being one — it
 * also weighs nothing, needs no licence, and takes the theme's colours rather
 * than fighting them.
 *
 * Decorative: everything it says is said in words beside it.
 */
export function DropletArt({ className }: { className?: string | undefined }) {
  return (
    <svg
      className={cx(styles.art, className)}
      viewBox="0 0 220 220"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* The glow the drop sits in, and two rings that give it somewhere to
          be. Faint enough to read as light rather than as circles. */}
      <circle className={styles.glow} cx="110" cy="96" r="86" />
      <circle className={styles.ring} cx="110" cy="96" r="86" />
      <circle className={styles.ring} cx="110" cy="96" r="62" />

      {/* The drop. One path: down the left flank, around the bowl, back up
          the right — the shape everybody reads as blood without a caption. */}
      <path
        className={styles.drop}
        d="M110 26c0 0 44 46 44 74a44 44 0 1 1-88 0c0-28 44-74 44-74Z"
      />
      <path
        className={styles.heart}
        d="M110 122c-16-11-24-19-24-27a11 11 0 0 1 20-6l4 5 4-5a11 11 0 0 1 20 6c0 8-8 16-24 27Z"
      />

      {/* The hands: two cupped shapes meeting under the drop. Abstract on
          purpose — a hand drawn in more detail than this is a hand drawn
          badly. */}
      <path
        className={styles.hand}
        d="M18 150c14-10 30-6 40 6l16 20c6 7 15 11 24 11h24c9 0 18-4 24-11l16-20c10-12 26-16 40-6 6 4 7 12 3 18l-30 40c-9 12-23 19-38 19H83c-15 0-29-7-38-19l-30-40c-4-6-3-14 3-18Z"
      />
    </svg>
  );
}
