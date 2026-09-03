import { cx } from '../../lib/cx';
import styles from './CityScene.module.css';

/**
 * The town at the foot of the gate: hills, a few blocks, and the hospital
 * that any of this is for.
 *
 * Decoration, and declared as such. It exists because the gate is two
 * buttons and a sentence — a screen with nothing at the bottom reads as a
 * page that failed to load the rest of itself — and because the product is
 * about a city's own hospitals, which is worth a picture even a faint one.
 *
 * Filled rather than outlined, in the palette's lightest tints, so it sits
 * behind the words without asking to be read. The sides crop away on a
 * narrow screen (xMidYMax slice), so the hospital and its cross live in the
 * middle of the viewBox where they always survive.
 */
export function CityScene({ className }: { className?: string | undefined }) {
  return (
    <div className={cx(styles.scene, className)} aria-hidden="true">
      <svg
        className={styles.svg}
        viewBox="0 0 720 220"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        {/* ── The far hill, and the skyline standing on it ─────────────── */}
        <path
          className={styles.hillFar}
          d="M0 148c96-26 190-30 268-12s150 22 232 6 158-18 220 4v74H0Z"
        />

        <g className={styles.city}>
          <rect x="196" y="118" width="34" height="62" rx="3" />
          <rect x="236" y="98" width="26" height="82" rx="3" />
          <rect x="392" y="106" width="30" height="74" rx="3" />
          <rect x="428" y="126" width="38" height="54" rx="3" />
          <rect x="472" y="112" width="24" height="68" rx="3" />
        </g>

        {/* The hospital: the tallest thing in the middle, with the one mark
            on this whole drawing that means something. */}
        <g className={styles.hospital}>
          <rect x="286" y="78" width="90" height="102" rx="4" />
          <rect x="322" y="150" width="18" height="30" rx="2" />
        </g>
        <g className={styles.cross}>
          <rect x="325" y="92" width="12" height="32" rx="2" />
          <rect x="315" y="102" width="32" height="12" rx="2" />
        </g>

        {/* Windows, as a grid of dots — enough to say "lit", not enough to
            count. */}
        <g className={styles.windows}>
          <path d="M204 132h6M218 132h6M204 148h6M218 148h6M204 164h6" />
          <path d="M244 112h6M244 128h6M244 144h6M244 160h6" />
          <path d="M298 100h8M316 136h8M356 100h8M356 124h8M298 124h8M298 148h8M356 148h8" />
          <path d="M400 120h6M400 136h6M400 152h6M436 140h6M450 140h6M436 156h6M480 126h6M480 142h6" />
        </g>

        {/* ── Trees, and the near hill closing the bottom ──────────────── */}
        <g className={styles.trees}>
          <circle cx="86" cy="150" r="20" />
          <rect x="83" y="164" width="6" height="26" rx="3" />
          <circle cx="132" cy="162" r="13" />
          <rect x="129.5" y="172" width="5" height="20" rx="2.5" />
          <circle cx="560" cy="150" r="18" />
          <rect x="557" y="163" width="6" height="26" rx="3" />
          <circle cx="618" cy="164" r="12" />
          <rect x="615.5" y="173" width="5" height="18" rx="2.5" />
        </g>

        <path
          className={styles.hillNear}
          d="M0 186c110-24 214-16 300 6s186 22 300-6c48-12 84-14 120-6v40H0Z"
        />
      </svg>
    </div>
  );
}
