import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { space, type SpaceStep } from '@kapka/tokens';
import styles from './Layout.module.css';

interface StackProps extends HTMLAttributes<HTMLElement> {
  /** Gap between children, as a step on the spacing scale. */
  gap?: SpaceStep;
  /** Stretch to the parent's height so `pushEnd` children can sit at the bottom. */
  fill?: boolean;
  as?: ElementType;
  children?: ReactNode;
}

/**
 * Vertical rhythm. Spacing sits between children, never on their outer edges,
 * so a Stack composes into any parent without margin surprises (§8 rule 3).
 */
export function Stack({
  gap = 4,
  fill = false,
  as: Tag = 'div',
  className,
  style,
  children,
  ...rest
}: StackProps) {
  return (
    <Tag
      className={cx(styles.stack, fill && styles.stackFill, className)}
      style={{ '--flow': space(gap), ...style } as CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  );
}
