import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  MouseEvent,
  ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../../lib/cx';
import styles from './Button.module.css';

/**
 * `glass` is for a dark surface only — the hero band. It is transparent, so on
 * a light background it is a label with a faint outline and no button at all.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'glass';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface CommonProps {
  /** Semantic, never presentational (§8 ground rule 4). */
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /* `| undefined` spelled out: noUncheckedIndexedAccess types every
     CSS-module lookup as `string | undefined`, and exactOptionalPropertyTypes
     means a bare `className?: string` cannot be handed one. React's own
     attribute types say it the same way. */
  className?: string | undefined;
  children?: ReactNode;
}

interface AsButton
  extends
    CommonProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'className' | 'children'> {
  /** Absent: this is a button. */
  to?: undefined;
  type?: 'button' | 'submit' | 'reset';
  /** Shows a spinner and blocks input while keeping the button's width. */
  loading?: boolean;
  /** What a screen reader hears while loading. */
  loadingLabel?: string;
}

interface AsLink
  extends
    CommonProps,
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'> {
  /**
   * Renders a real link instead of a button.
   *
   * This is not cosmetic. A control that navigates has to be an <a> or
   * middle-click, cmd-click and "open in new tab" all silently do nothing —
   * and on a page of seven requests, opening a few in tabs is exactly what
   * someone does.
   */
  to: string;
}

export type ButtonProps = AsButton | AsLink;

export function Button(props: ButtonProps) {
  const {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    className,
    children,
  } = props;

  const classes = cx(
    styles.button,
    styles[variant],
    styles[size],
    fullWidth && styles.fullWidth,
    props.to === undefined && props.loading && styles.loading,
    className,
  );

  if (props.to !== undefined) {
    const { to, variant: _v, size: _s, fullWidth: _f, className: _c, ...rest } = props;
    return (
      <Link to={to} className={classes} {...rest}>
        <span className={styles.label}>{children}</span>
      </Link>
    );
  }

  const {
    loading = false,
    loadingLabel = 'Working…',
    type = 'button',
    disabled,
    onClick,
    variant: _v,
    size: _s,
    fullWidth: _f,
    className: _c,
    to: _t,
    ...rest
  } = props;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      // Dropping the onClick handler is not enough: a type="submit" button
      // submits its form natively, with no handler involved. Without this,
      // a second tap while the first request is in flight posts it twice.
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      type={type}
      className={classes}
      // A loading button must not fire again, but staying focusable keeps the
      // keyboard user where they were instead of dumping focus to <body>.
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
      {...rest}
    >
      <span className={styles.label}>{children}</span>
      {loading && (
        <span className={styles.spinner}>
          <span className={styles.spinnerTrack} />
          <span className="visually-hidden">{loadingLabel}</span>
        </span>
      )}
    </button>
  );
}
