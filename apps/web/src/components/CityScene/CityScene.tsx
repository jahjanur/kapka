import { cx } from '../../lib/cx';
import styles from './CityScene.module.css';

/**
 * The town at the foot of the gate: hills, a skyline rooted in the bottom of
 * the page, and the hospital that any of this is for.
 *
 * Decoration, and declared as such. It exists because the gate is two
 * buttons and a sentence — a screen with nothing at the bottom reads as a
 * page that failed to load the rest of itself — and because the product is
 * about a city's own hospitals, which is worth a picture even a faint one.
 *
 * ── Why the viewBox is 8:1 ──────────────────────────────────────────────
 * The scene is a band across the bottom of the page, and a band is very wide
 * and not very tall — about 11:1 on a desktop. It fills that band by
 * covering it (`slice`), and cover crops whichever dimension over-reaches.
 * With a 3.3:1 viewBox, a desktop's width drove the scale and the crop came
 * off the TOP: the buildings lost their roofs, the hospital lost its cross,
 * and what was left was a flat empty strip of ground — the whole drawing
 * reduced to the one part of it that says nothing.
 *
 * At 8:1 the band's height drives the scale instead, at every width the page
 * can be. The crop comes off the sides, which is what the wide margins of
 * hill and tree either side are for, and the top few units are left empty
 * for the pixel or two that can still come off there.
 *
 * ── Why the buildings run off the bottom ────────────────────────────────
 * Order is the whole composition here: the three hills are laid down first
 * as background, and the town is drawn in front of them with every base
 * carried past the bottom edge of the viewBox. A skyline whose feet are cut
 * off by the edge of the page reads as a city the page is standing in.
 * Sitting the same buildings on top of a hill, with ground visible beneath
 * them, made them read as models on a shelf.
 */
export function CityScene({ className }: { className?: string | undefined }) {
  return (
    <div className={cx(styles.scene, className)} aria-hidden="true">
      <svg
        className={styles.svg}
        viewBox="0 0 1600 200"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        {/* ── The ground, all of it behind the town ───────────────────── */}
        <path
          className={styles.hillFar}
          d="M0 132c180-30 340-36 520-20s300 26 520 12 400-24 560 4v72H0Z"
        />
        <path
          className={styles.hillMid}
          d="M0 152c200-24 380-14 520 8s300 26 520 10 400-28 560-6v36H0Z"
        />
        <path
          className={styles.hillNear}
          d="M0 176c240-26 420-8 560 10s300 20 520 4 360-30 520-8v58H0Z"
        />

        {/* ── The trees along the rise, wide of the town ────────────────
            These stand on the hill behind, not at the front of the page, so
            their trunks end on the ground they grow out of. Carried to the
            bottom edge like the buildings they turn into lollipops on
            poles. */}
        <g className={styles.trees}>
          <circle cx="252" cy="130" r="26" />
          <rect x="247" y="148" width="10" height="30" rx="5" />
          <circle cx="330" cy="146" r="17" />
          <rect x="326" y="158" width="8" height="24" rx="4" />
          <circle cx="468" cy="150" r="14" />
          <rect x="464.5" y="160" width="7" height="20" rx="3.5" />
          <circle cx="1140" cy="150" r="15" />
          <rect x="1136.5" y="160" width="7" height="22" rx="3.5" />
          <circle cx="1284" cy="128" r="24" />
          <rect x="1279" y="146" width="10" height="30" rx="5" />
          <circle cx="1370" cy="146" r="16" />
          <rect x="1366" y="158" width="8" height="24" rx="4" />
        </g>

        {/* ── The town ────────────────────────────────────────────────────
            Every base is 215 — fifteen units past the bottom of the
            viewBox — so the rounded corners are cropped away and each block
            meets the edge of the page square.                            */}
        <g className={styles.city}>
          <rect x="560" y="82" width="52" height="133" rx="4" />
          <rect x="622" y="60" width="40" height="155" rx="4" />
          <rect x="672" y="94" width="46" height="121" rx="4" />
          <rect x="902" y="70" width="44" height="145" rx="4" />
          <rect x="956" y="90" width="56" height="125" rx="4" />
          <rect x="1022" y="76" width="38" height="139" rx="4" />
        </g>

        {/* The hospital: the tallest thing in the middle of the drawing, and
            the only shape here that means anything. It stays in the middle
            because the sides are what crop away on a phone. */}
        <g className={styles.hospital}>
          <rect x="736" y="40" width="140" height="175" rx="5" />
          {/* The way in, at the foot of it. */}
          <rect x="788" y="172" width="36" height="43" rx="4" />
        </g>
        <g className={styles.cross}>
          <rect x="798" y="54" width="16" height="40" rx="3" />
          <rect x="786" y="66" width="40" height="16" rx="3" />
        </g>

        {/* Windows: enough to say "lit", not enough to count. The hospital's
            top rows keep clear of the cross. */}
        <g className={styles.windows}>
          <path d="M572 96h10M594 96h10M572 118h10M594 118h10M572 140h10M594 140h10M572 162h10M594 162h10" />
          <path d="M634 74h10M634 96h10M634 118h10M634 140h10M634 162h10" />
          <path d="M684 108h10M700 108h10M684 130h10M700 130h10M684 152h10M700 152h10" />
          <path d="M752 58h12M848 58h12M752 82h12M848 82h12" />
          <path d="M752 108h12M786 108h12M820 108h12M852 108h12" />
          <path d="M752 134h12M786 134h12M820 134h12M852 134h12" />
          <path d="M752 160h12M852 160h12" />
          <path d="M914 84h10M914 106h10M914 128h10M914 150h10" />
          <path d="M968 104h10M988 104h10M968 126h10M988 126h10M968 148h10M988 148h10" />
          <path d="M1032 90h10M1032 112h10M1032 134h10M1032 156h10" />
        </g>

        {/* ── The nearest thing in the picture, in front of everything ─── */}
        <g className={styles.bushes}>
          <circle cx="120" cy="182" r="14" />
          <circle cx="146" cy="186" r="10" />
          <circle cx="524" cy="188" r="13" />
          <circle cx="548" cy="192" r="9" />
          <circle cx="1084" cy="186" r="13" />
          <circle cx="1110" cy="190" r="9" />
          <circle cx="1480" cy="184" r="15" />
          <circle cx="1508" cy="188" r="10" />
        </g>
      </svg>
    </div>
  );
}
