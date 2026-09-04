import type { HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import { announceBloodType, formatBloodType, type BloodType } from '@kapka/shared';
import styles from './BloodTypeBadge.module.css';

/**
 * A blood type as text: the glyph a sighted reader sees, and the words a
 * screen reader says.
 *
 * Use this anywhere a blood type is shown, not only in the badge. Rendering
 * the stored value gives "O hyphen"; rendering the display form gives
 * "O minus". Neither is what the type is called (§6.3, §10).
 */
export function BloodTypeLabel({ type }: { type: BloodType }) {
  return (
    <>
      <span aria-hidden="true">{formatBloodType(type)}</span>
      <span className="visually-hidden">{announceBloodType(type)}</span>
    </>
  );
}

interface BloodTypeBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  type: BloodType;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * One treatment for every type, everywhere — see the stylesheet for why the
 * per-group hues went. The literal text is always there, and the screen reader
 * hears "O negative", not "O minus" (§10).
 */
export function BloodTypeBadge({
  type,
  size = 'md',
  className,
  ...rest
}: BloodTypeBadgeProps) {
  return (
    <span className={cx(styles.badge, styles[size], className)} {...rest}>
      <BloodTypeLabel type={type} />
    </span>
  );
}
