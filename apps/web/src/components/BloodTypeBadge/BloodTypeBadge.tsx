import type { HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import {
  announceBloodType,
  formatBloodType,
  parseBloodType,
  type BloodType,
} from '@kapka/shared';
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
  /**
   * 'coded' is the default and the system §6.3 describes: hue carries the ABO
   * group so a column of cards can be scanned for one.
   *
   * 'neutral' drops the hue. For the one place a blood type is not being
   * scanned against others — your own, on your own profile — where a colour
   * that means "B" among absent alternatives means nothing, and reads as a
   * second brand colour on a page that has one.
   */
  tone?: 'coded' | 'neutral';
}

/**
 * Blood type is the primary scanning dimension in this product, so the badge
 * has a stable treatment users learn visually — but the literal text is always
 * there, and the screen reader hears "O negative", not "O minus" (§6.3, §10).
 */
export function BloodTypeBadge({
  type,
  size = 'md',
  tone = 'coded',
  className,
  ...rest
}: BloodTypeBadgeProps) {
  const { group, rh } = parseBloodType(type);
  return (
    <span
      className={cx(styles.badge, styles[size], className)}
      data-group={group}
      data-rh={rh}
      data-tone={tone}
      {...rest}
    >
      <BloodTypeLabel type={type} />
    </span>
  );
}
