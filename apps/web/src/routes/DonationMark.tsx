import styles from './DonationMark.module.css';

/**
 * The mark for an empty donation history: a drop, and the beat it would have
 * reached.
 *
 * The one illustrative moment on this page. It is here rather than in the
 * identity block because this is the only place with a hole to fill — a donor
 * who has never been emailed is looking at nothing, and "nothing yet" reads
 * better over a drawing than as a lone sentence in a box.
 *
 * The trace runs flat and lifts once, under the drop. Nothing has arrived yet,
 * so the line has not moved much either.
 */
export function DonationMark() {
  return (
    <svg
      className={styles.mark}
      viewBox="0 0 96 56"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* The drop, waiting above the line rather than falling into it. */}
      <path
        className={styles.drop}
        d="M48 8c-3.4 3.8-5.3 6.7-5.3 9a5.3 5.3 0 0 0 10.6 0c0-2.3-1.9-5.2-5.3-9Z"
      />
      {/* One beat, centred under it. */}
      <path className={styles.trace} d="M4 40h30l5-9 6 18 5-9h42" />
    </svg>
  );
}
