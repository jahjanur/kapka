import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { space, type SpaceStep } from '../../lib/space';
import styles from './Layout.module.css';

interface GridProps extends HTMLAttributes<HTMLElement> {
  /** Minimum column width before the grid drops to fewer columns. */
  minColumn?: string;
  gap?: SpaceStep;
  as?: ElementType;
  children?: ReactNode;
}

/**
 * Auto-fitting grid. Reflows at every width with no media query, which is why
 * the feed does not need one (§9.1).
 */
export function Grid({
  minColumn = '18rem', gap = 4, as: Tag = 'div', className, style, children, ...rest
}: GridProps) {
  return (
    <Tag
      className={cx(styles.grid, className)}
      style={{ '--col-min': minColumn, '--gap': space(gap), ...style } as CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  );
}
