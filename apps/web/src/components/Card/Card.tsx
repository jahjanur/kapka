import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './Card.module.css';

interface CardOwnProps {
  /** `flush` for edge-to-edge media, `roomy` for a page's lead card. */
  padding?: 'flush' | 'tight' | 'default' | 'roomy';
  /** Muted surface for a card nested inside another card. */
  tone?: 'surface' | 'alt';
  /**
   * Adds hover and press affordances, and makes the card a real control:
   * `as` defaults to `button` so it is focusable and keyboard-operable
   * without the caller having to remember.
   */
  interactive?: boolean;
  /** Applied only when the card renders as a button. Defaults to `button`. */
  type?: 'button' | 'submit' | 'reset';
  children?: ReactNode;
  className?: string;
}

/**
 * Generic over the element it renders, so `as="a"` accepts an href and
 * `as="button"` accepts a type — each with the props that element actually
 * has, and none that it does not.
 */
type CardProps<T extends ElementType> = CardOwnProps & {
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof CardOwnProps | 'as'>;

/**
 * Sets no outer margin, ever — spacing is the parent's job, which is what
 * keeps layouts composable (§8 ground rule 3).
 */
export function Card<T extends ElementType = 'div'>({
  padding = 'default',
  tone = 'surface',
  interactive = false,
  as,
  type,
  className,
  children,
  ...rest
}: CardProps<T>) {
  /*
   * An interactive card that renders as a <div> looks clickable, responds to
   * hover and press, and is invisible to the keyboard and to a screen reader.
   * Nothing errors — it simply cannot be used without a mouse. Defaulting to
   * <button> makes the operable version the one you get by not thinking
   * about it.
   */
  const Tag = as ?? (interactive ? 'button' : 'div');
  const isButton = Tag === 'button';

  return (
    <Tag
      /* Without this a card-as-button inside a form submits it on click,
         because HTML defaults a button to type="submit". Never set on an
         element that has no such attribute. */
      type={isButton ? (type ?? 'button') : undefined}
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
