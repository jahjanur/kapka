import { DROP_PATH, HEART_PATH } from '../Icon/brandPaths';
import styles from './WelcomeArt.module.css';

/**
 * The hero of the gate: a labelled bag of blood beside the product's own
 * drop, joined by a cardiac trace, on a halo of rings.
 *
 * Decoration, and declared as such — every word of what it means is in the
 * headline under it. It is drawn rather than photographed because a stock
 * photograph of a smiling donor is a promise a pilot cannot keep, and it is
 * one SVG rather than a stack of divs because the tube, the trace and the
 * meniscus are curves, and a curve built out of borders and pseudo-elements
 * is a curve that breaks at the next font size.
 *
 * The blood type on the label is fixed, and A+ on purpose: it is the
 * commonest type in the region, and a reader's own type here would suggest
 * the picture knows something about them, which it does not.
 */
export function WelcomeArt() {
  return (
    <div className={styles.art} aria-hidden="true">
      <svg className={styles.svg} viewBox="0 0 320 232" focusable="false">
        <defs>
          <linearGradient id="kapka-welcome-drop" x1="0.2" y1="0" x2="0.8" y2="1">
            <stop className={styles.dropTop} offset="0" />
            <stop className={styles.dropBottom} offset="1" />
          </linearGradient>
          <linearGradient id="kapka-welcome-fill" x1="0" y1="0" x2="0" y2="1">
            <stop className={styles.fillTop} offset="0" />
            <stop className={styles.fillBottom} offset="1" />
          </linearGradient>
          <radialGradient id="kapka-welcome-halo">
            <stop className={styles.haloIn} offset="0" />
            <stop className={styles.haloOut} offset="1" />
          </radialGradient>
          {/* The bag's own outline, so the blood inside stops where the bag
              does — a rectangle of fill and a rounded bag disagree at the
              two bottom corners, which is exactly where the eye goes. */}
          <clipPath id="kapka-welcome-bag">
            <rect x="88" y="44" width="72" height="112" rx="16" />
          </clipPath>
        </defs>

        {/* The halo: a wash, and two rings standing in it. */}
        <ellipse fill="url(#kapka-welcome-halo)" cx="160" cy="104" rx="150" ry="118" />
        <circle className={styles.ring} cx="160" cy="104" r="100" />
        <circle className={styles.ringInner} cx="160" cy="104" r="72" />

        {/* Hearts, scattered wide of the two figures. */}
        <g className={styles.heart}>
          <path d={HEART_PATH} transform="translate(38 128) scale(0.85)" />
          <path d={HEART_PATH} transform="translate(258 92) scale(0.7)" />
          <path d={HEART_PATH} transform="translate(276 148) scale(0.55)" />
        </g>

        {/* ── The bag ──────────────────────────────────────────────────── */}
        {/* The hanger tab, behind the bag so it reads as passing under it. */}
        <rect className={styles.bagTab} x="112" y="30" width="24" height="20" rx="6" />

        <g clipPath="url(#kapka-welcome-bag)">
          <rect className={styles.bagBody} x="88" y="44" width="72" height="112" />
          {/* Blood to two thirds, with the meniscus drawn as a curve rather
              than a straight edge: liquid in a bag does not have one. */}
          <path
            fill="url(#kapka-welcome-fill)"
            d="M88 78c14-5 30-5 44 0s22 5 28 1v77H88Z"
          />
        </g>
        <rect className={styles.bagEdge} x="88" y="44" width="72" height="112" rx="16" />

        {/* The label sits in the bag's white top, where a real one is. */}
        <rect className={styles.label} x="98" y="54" width="34" height="20" rx="5" />
        <text className={styles.labelText} x="115" y="68" textAnchor="middle">
          A+
        </text>

        {/* ── The drop ─────────────────────────────────────────────────── */}
        <path
          fill="url(#kapka-welcome-drop)"
          d={DROP_PATH}
          transform="translate(180 40) scale(4.4)"
        />
        {/* The mark's own outline inside it, in white — the same shape twice,
            which is what makes the figure read as Kapka's drop rather than a
            generic blob of red. */}
        <path
          className={styles.dropMark}
          d={DROP_PATH}
          transform="translate(219 88) scale(1.7)"
        />

        {/* ── The line of life ─────────────────────────────────────────── */}
        {/* Out of the bag's outlet, down, and away to the right as a rhythm
            that flattens out at both ends. */}
        <path className={styles.tube} d="M124 156v18c0 7 5 12 12 12h4" />
        <path className={styles.trace} d="M52 190h84l6-13 7 30 7-30 6 13h30l5-9 6 9h84" />
        <path className={styles.traceGhost} d="M52 190H36M304 190h-16" />
      </svg>
    </div>
  );
}
