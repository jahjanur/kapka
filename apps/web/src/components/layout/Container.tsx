import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './Layout.module.css';

interface ContainerProps extends HTMLAttributes<HTMLElement> {
  /**
   * `wide` caps at --container-max (75rem, the default), `text` at a readable
   * measure for prose-led pages. Cards must never stretch to 1400px (§9.1).
   */
  width?: 'wide' | 'text';
  as?: ElementType;
  children?: ReactNode;
}

export function Container({
  width = 'wide', as: Tag = 'div', className, style, children, ...rest
}: ContainerProps) {
  return (
    <Tag
      className={cx(styles.container, className)}
      style={{
        '--container-width': width === 'text' ? '48rem' : 'var(--container-max)',
        ...style,
      } as CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  );
}
