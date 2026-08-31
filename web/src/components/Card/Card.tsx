import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './Card.module.css';

interface CardProps extends HTMLAttributes<HTMLElement> {
  /** `flush` for edge-to-edge media, `roomy` for a page's lead card. */
  padding?: 'flush' | 'tight' | 'default' | 'roomy';
  /** Muted surface for a card nested inside another card. */
  tone?: 'surface' | 'alt';
  /** Adds hover/press affordances. Pair with an `as` that is focusable. */
  interactive?: boolean;
  as?: ElementType;
  /** Only meaningful with `as="button"` — always set it, or you get a submit. */
  type?: 'button' | 'submit' | 'reset';
  children?: ReactNode;
}

/**
 * Sets no outer margin, ever — spacing is the parent's job, which is what
 * keeps layouts composable (§8 ground rule 3).
 */
export function Card({
  padding = 'default', tone = 'surface', interactive = false,
  as: Tag = 'div', className, children, ...rest
}: CardProps) {
  return (
    <Tag
      className={cx(
        styles.card,
        padding !== 'default' && styles[padding],
        tone === 'alt' && styles.alt,
        interactive && styles.interactive,
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
