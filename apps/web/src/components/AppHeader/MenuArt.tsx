import styles from './MenuArt.module.css';

/**
 * The drawing that closes the menu: a drop falls, and the line rises to meet
 * it.
 *
 * One event, not two objects sharing a box. The drop lands on the exact x the
 * spike climbs to, and the spike only exists because the drop arrived — which
 * is the whole product in a gesture, and the thing the old version missed by
 * perching a tiny drop beside a line that was already there.
 *
 * The weight is drawn rather than defaulted. A single stroke-width across
 * every path is what made the last one read as a chart: here the tails are
 * hairlines, the approach thickens, and the spike carries more than twice the
 * tails, so the eye is pulled to the peak and the line has a hand behind it.
 * SVG cannot taper one stroke, so the taper is stepped across five segments
 * that share endpoints and round caps — at this size the joins disappear.
 *
 * The baseline runs past both edges of the viewBox and is clipped by it, so
 * the drawing meets the panel's sides rather than floating inside them.
 *
 * Decorative, and marked so: it says nothing the menu has not.
 */
export function MenuArt() {
  return (
    <svg
      className={styles.art}
      viewBox="0 0 320 104"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Left tail — a hairline, and the quietest thing here. */}
      <path className={styles.tail} d="M-12 74H128" />

      {/* The approach: the line thickens and dips, the way it gathers before
          a beat. */}
      <path className={styles.lead} d="M128 74h10l6 7" />

      {/* The spike. Heaviest, and the only segment that moves. It climbs to
          exactly where the drop is waiting. */}
      <path className={styles.spike} d="M144 81 160 26l10 62 10-15" pathLength={1} />

      {/* The settle, and a small second bump before the line goes quiet. */}
      <path className={styles.decay} d="M180 73h8l6-7 6 8h6" />

      {/* Right tail, matching the left. */}
      <path className={styles.tail} d="M206 74H332" />

      {/* The drop, resting where the spike reaches. Big enough to be a drop
          rather than a dot, and filled so it reads as the one solid thing in
          a drawing of lines. */}
      <path
        className={styles.drop}
        d="M160 4c-5.4 7-8.6 11.3-8.6 14a8.6 8.6 0 0 0 17.2 0c0-2.7-3.2-7-8.6-14Z"
      />
    </svg>
  );
}
