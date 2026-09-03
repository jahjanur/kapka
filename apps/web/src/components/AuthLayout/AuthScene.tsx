import { DROP_PATH, HEART_PATH } from '../Icon/brandPaths';
import styles from './AuthLayout.module.css';

/**
 * The landscape at the bottom of the sign-in screen: a drop of blood resting
 * on a hillside, in the faintest tint the palette has.
 *
 * Decoration and declared as such — it says nothing the page has not already
 * said. It exists because the bottom of a two-field screen is mostly empty by
 * nature, and a floor with something living on it reads better than a void.
 * Drawn from the sprite's own droplet and heart paths so the brand is one
 * drawing everywhere, and in tokens throughout so the dark theme gets its own
 * quieter version for free.
 *
 * The centre of the viewBox is the part that survives every width: the sides
 * crop away on a phone (xMidYMax slice), so nothing that matters lives there.
 */
export function AuthScene() {
  return (
    <div className={styles.scene} aria-hidden="true">
      <svg
        className={styles.sceneArt}
        viewBox="0 0 720 300"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        <defs>
          <linearGradient id="kapka-auth-scene-drop" x1="0" y1="0" x2="0" y2="1">
            <stop className={styles.sceneDropFaint} offset="0" />
            <stop className={styles.sceneDropFull} offset="1" />
          </linearGradient>
        </defs>

        {/* The drop, resting on the horizon rather than falling. */}
        <path
          fill="url(#kapka-auth-scene-drop)"
          d={DROP_PATH}
          transform="translate(216 8) scale(12)"
        />

        {/* Two hills: the far one carries the drop, the near one closes the
            bottom corner so the page ends on a curve, not a cut. */}
        <path
          className={styles.sceneLine}
          d="M-20 268C120 234 300 230 380 252s240 20 360-6"
        />
        <path className={styles.sceneLineFaint} d="M-20 300C60 270 160 262 260 276" />
        <path className={styles.sceneLineFaint} d="M470 300c70-22 160-24 270-6" />

        {/* A pair of clouds, kept high and out of the drop's way. */}
        <path
          className={styles.sceneLineFaint}
          d="M106 128a10 10 0 0 1 10-10c2-8 13-10 18-3a8 8 0 0 1 7 13Z"
        />
        <path
          className={styles.sceneLineFaint}
          d="M568 96a9 9 0 0 1 9-9c2-7 12-9 16-3a7 7 0 0 1 6 12Z"
        />

        {/* Trees on the far hill… */}
        <g className={styles.sceneLine}>
          <circle cx="96" cy="238" r="13" />
          <path d="M96 251v17" />
          <circle cx="146" cy="252" r="9" />
          <path d="M146 261v13" />
          <circle cx="600" cy="230" r="12" />
          <path d="M600 242v18" />
        </g>

        {/* …and hearts growing beside them, because this is that product. */}
        <g className={styles.sceneLine}>
          <path d={HEART_PATH} transform="translate(478 216) scale(0.62)" />
          <path d="M485.5 231v17" />
          <path d={HEART_PATH} transform="translate(534 240) scale(0.45)" />
          <path d="M539.4 251v12" />
          <path d={HEART_PATH} transform="translate(170 246) scale(0.4)" />
          <path d="M174.8 256v10" />
        </g>
      </svg>
    </div>
  );
}
