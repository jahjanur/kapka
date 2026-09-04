import styles from './MenuArt.module.css';

/**
 * The drawing that closes the menu: a drop, and the rings going out from
 * where it landed.
 *
 * The fourth attempt, and the first that is not asking to be drawn well.
 * Three were line art and read as a chart; the fourth was a pair of cupped
 * hands and read as two leaves — hands need a hand. This is circles and one
 * drop, which is geometry rather than draughtsmanship, so it looks like what
 * it is at every size.
 *
 * It also says the plainest true thing about the product: one person gives,
 * and it travels further than them.
 *
 * Decorative, and marked so.
 */
export function MenuArt() {
  return (
    <svg
      className={styles.art}
      viewBox="0 0 240 136"
      aria-hidden="true"
      focusable="false"
    >
      {/* The surface it lands on. Palest, widest, and what stops the drawing
          floating in the middle of the panel's white. */}
      <ellipse className={styles.pool} cx="120" cy="98" rx="94" ry="24" />

      {/* Three rings out from the impact. Heaviest and brightest nearest,
          because that is where the drop actually went in. */}
      <ellipse className={styles.ringNear} cx="120" cy="98" rx="26" ry="7" />
      <ellipse className={styles.ringMid} cx="120" cy="98" rx="48" ry="13" />
      <ellipse className={styles.ringFar} cx="120" cy="98" rx="72" ry="19" />

      {/* The drop, just above the surface. The one solid thing here. */}
      <path
        className={styles.drop}
        d="M120 30c-11 15-17 24-17 30a17 17 0 0 0 34 0c0-6-6-15-17-30Z"
      />
      {/* A highlight, so it reads as a volume rather than a flat shape. */}
      <path className={styles.shine} d="M112 62a8 8 0 0 1 4-10" />
    </svg>
  );
}
