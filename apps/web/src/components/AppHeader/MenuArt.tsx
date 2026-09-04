import styles from './MenuArt.module.css';

/**
 * The drawing that closes the menu: a drop falling into a heartbeat, where
 * the impact is the R-wave.
 *
 * One idea, drawn once. The trace runs flat across the panel, spikes exactly
 * where the drop lands, and settles — so the drop is not an ornament beside a
 * line, it is the reason the line moves. That is the whole product in a
 * gesture: one person gives, and somewhere a pulse holds.
 *
 * Line art rather than fills: the panel above it is already carrying two
 * tinted surfaces, and a third block of colour down there flattened the whole
 * thing into stripes. At 1.5px it reads as drawn.
 *
 * Decorative, and marked so — it says nothing the rows above have not.
 */
export function MenuArt() {
  return (
    <svg
      className={styles.art}
      viewBox="0 0 296 96"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* The fall: a dotted descent, so the drop reads as having travelled
          rather than as hanging there. */}
      <path className={styles.fall} d="M120 6v14" />

      {/* The drop itself, at the top of its fall and directly above the
          spike — the two are one event, so they share a vertical. */}
      <path
        className={styles.drop}
        d="M120 24c-3.1 3.4-4.9 6-4.9 8.2a4.9 4.9 0 0 0 9.8 0c0-2.2-1.8-4.8-4.9-8.2Z"
      />

      {/* The trace. Flat, then the drop lands: a small dip, the R-wave up
          through where the drop was, the S below the line, and away. */}
      <path
        className={styles.trace}
        d="M0 62h96l8 .2 6 6.5 4-38.5 6 52 5-20.2 5 8h18l6-9 5 9h132"
      />
    </svg>
  );
}
