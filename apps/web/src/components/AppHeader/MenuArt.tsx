import styles from './MenuArt.module.css';

/**
 * The wave that closes the menu panel.
 *
 * Decoration, and marked as such — it says nothing the rows above it have not
 * already said. Drawn rather than shipped as an image for the reason BloodBag
 * is: it is three paths, a PNG of it would cost more than the icon sprite,
 * and every colour here is an accent token, so it stays in step with the
 * palette instead of being a picture of one.
 *
 * Sliced rather than fitted, so the crests reach both edges at any panel
 * width instead of leaving a margin of nothing at the sides.
 */
export function MenuArt() {
  return (
    <svg
      className={styles.art}
      viewBox="0 0 320 132"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      {/* Three crests, palest at the back. Each starts and ends off-canvas so
          a slice at any panel width still meets both edges. */}
      <path
        className={styles.waveFar}
        d="M-20 78c40-18 70-18 110 0s70 18 110 0 70-18 140 0v74h-360Z"
      />
      <path
        className={styles.waveMid}
        d="M-20 96c46-16 74-16 120 0s74 16 120 0 74-16 120 0v56h-360Z"
      />
      <path
        className={styles.waveNear}
        d="M-20 112c50-14 80-14 130 0s80 14 130 0 70-12 120 0v40h-360Z"
      />

      {/* The same beat the wordmark keeps and the hero's trace runs on, riding
          the crest — the product has one pulse rather than several. */}
      <path
        className={styles.pulse}
        d="M-10 104h58l7-13 9 26 10-34 8 21h62l7-11 8 20 9-26 7 17h125"
      />
    </svg>
  );
}
