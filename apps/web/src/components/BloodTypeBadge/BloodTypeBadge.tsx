import type { HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import {
  announceBloodType,
  formatBloodType,
  parseBloodType,
  type BloodType,
} from '@kapka/shared';
import styles from './BloodTypeBadge.module.css';

interface BloodTypeBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  type: BloodType;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Blood type is the primary scanning dimension in this product, so the badge
 * has a stable treatment users learn visually — but the literal text is always
 * there, and the screen reader hears "O negative", not "O minus" (§6.3, §10).
 */
export function BloodTypeBadge({
  type,
  size = 'md',
  className,
  ...rest
}: BloodTypeBadgeProps) {
  const { group, rh } = parseBloodType(type);
  return (
    <span
      className={cx(styles.badge, styles[size], className)}
      data-group={group}
      data-rh={rh}
      {...rest}
    >
      <span aria-hidden="true">{formatBloodType(type)}</span>
      <span className="visually-hidden">{announceBloodType(type)}</span>
    </span>
  );
}
