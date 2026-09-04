import styles from './MenuSignoff.module.css';

/**
 * The sign-off band at the foot of the drawer.
 *
 * It drops three of the four layers the mockup stacks in one square inch —
 * the overlap is the clutter, not any one of the pieces. What survives is a
 * single wave bleeding off the bottom edge, and one message.
 *
 * The script variant is not here, and was not a near miss. Cursive drawn as
 * hand-authored path data came out as marks that read as letters only if you
 * already know what they say — the same failure as drawing hands. Real script
 * means a real script face, self-hosted because font-src is 'self': a
 * deliberate 15-25KB, not something to slip in behind a decoration.
 *
 * Everything here is decoration and is marked so: aria-hidden, and no part of
 * it takes a pointer event.
 */

/** One layer, off both edges, along the foot. */
function Wave() {
  return (
    <svg
      className={styles.wave}
      viewBox="0 0 320 64"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M-4 30c46-16 74-16 120 0s76 16 120 0 68-12 88-4v42H-4Z" />
    </svg>
  );
}

/**
 * The pulse glyph, drawn rather than defaulted.
 *
 * A hairline zigzag is what a chart looks like. SVG cannot taper one stroke,
 * so the taper is stepped across three segments that share endpoints and round
 * caps: hairline tails, and more than double that through the spike. At this
 * size the joins disappear and the line has a hand behind it.
 */
function Pulse() {
  return (
    <svg
      className={styles.pulse}
      viewBox="0 0 40 28"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path className={styles.pulseTail} d="M1 15h9" />
      <path className={styles.pulseSpike} d="m10 15 4.5-11L20 25l4-11" />
      <path className={styles.pulseTail} d="M24 14h15" />
    </svg>
  );
}

/**
 * The pulse glyph and two lines of plain type, over one wave.
 *
 * No heart and no script. The heart was cropped mid-curve against the panel's
 * edge, and the script said the same thing as the message beside it in the
 * same space — which is most of why that corner felt crowded.
 */
export function MenuSignoff() {
  return (
    <div className={styles.band} aria-hidden="true">
      <Wave />
      <div className={styles.message}>
        <Pulse />
        <p className={styles.lines}>
          <span className={styles.lead}>Every donation can save a life.</span>
          <span className={styles.sub}>Thank you for being part of Kapka.</span>
        </p>
      </div>
    </div>
  );
}
