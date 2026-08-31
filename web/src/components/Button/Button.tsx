import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Semantic, never presentational (§8 ground rule 4). */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks input while keeping the button's width. */
  loading?: boolean;
  /** What a screen reader hears while loading. */
  loadingLabel?: string;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel = 'Working…',
  fullWidth = false,
  type = 'button',
  disabled,
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        styles.button, styles[variant], styles[size],
        fullWidth && styles.fullWidth,
        loading && styles.loading,
        className,
      )}
      // A loading button must not fire again, but staying focusable keeps the
      // keyboard user where they were instead of dumping focus to <body>.
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={loading ? undefined : onClick}
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
