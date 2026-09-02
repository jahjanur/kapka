import { cx } from '../../lib/cx';
import styles from './VitalSign.module.css';

/**
 * The trace, as one path string, shared by the line and the drop that runs
 * along it.
 *
 * A cardiac rhythm rather than a decorative squiggle: flat baseline, the small
 * P bump, the tall QRS spike, then the T wave and back to flat. It is the one
 * shape a viewbox this small can hold that everybody already reads as "alive".
 */
const TRACE = 'M0 32 H46 q6 0 8-6 t8 6 H92 l7-26 6 52 7-26 H150 q7 0 9-8 t9 8 H320';

/**
 * A living vital trace with a drop of blood travelling along it.
 *
 * Decorative and marked as such: it says nothing a screen reader needs, and
 * everything it draws is said in words beside it.
 *
 * It keeps its aspect ratio: stretching the viewBox to fill a wide screen
 * turns the drop into an ellipse, which is the one part of this that has to
 * stay a drop.
 *
 * The drop rides the same path the line draws — `offset-path` with the same
 * `d`, so the two can never drift apart the way a hand-tuned keyframe
 * translation would the moment the path changes.
 */
export function VitalSign({
  /* `| undefined` spelled out, like Button's: noUncheckedIndexedAccess types
     every CSS-module lookup as `string | undefined`, and
     exactOptionalPropertyTypes is right to keep absent and undefined apart. */
  className,
}: {
  className?: string | undefined;
}) {
  return (
    <svg
      className={cx(styles.svg, className)}
      viewBox="0 0 320 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* The trace that has already passed: dim, so the bright head has
          something to be brighter than. */}
      <path className={styles.ghost} d={TRACE} />
      <path className={styles.trace} d={TRACE} />
      {/* Two circles, not one: the halo is what makes it read as luminous
          rather than as a dot with a border. */}
      <circle className={styles.halo} r="7" />
      <circle className={styles.drop} r="3.5" />
    </svg>
  );
}
