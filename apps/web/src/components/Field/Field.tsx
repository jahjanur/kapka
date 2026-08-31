import { useId, useMemo, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { Icon } from '../Icon/Icon';
import { FieldContext, type FieldContextValue } from './FieldContext';
import styles from './Field.module.css';

interface FieldProps {
  /** Always above the control. A placeholder is never a label (§8 Tier 1). */
  label: ReactNode;
  children: ReactNode;
  /** Guidance shown before anything goes wrong. */
  help?: ReactNode;
  /** Validation message. Its presence puts the control into its error state. */
  error?: ReactNode;
  required?: boolean;
  /** Marks the field "Optional" in the label — clearer than leaving it silent. */
  optional?: boolean;
  /**
   * Hides the label visually but keeps it for screen readers.
   *
   * For a control whose purpose is already obvious from where it sits — a
   * city select in a filter toolbar. Never because the label looks untidy:
   * the label still has to exist, and it still has to be right.
   */
  hideLabel?: boolean;
  className?: string;
}

/**
 * Composes label + control + help + error and wires the ARIA between them, so
 * no screen has to remember to do it by hand. Every form control goes through
 * this (§8 Tier 1).
 */
export function Field({
  label,
  children,
  help,
  error,
  required = false,
  optional = false,
  hideLabel = false,
  className,
}: FieldProps) {
  const controlId = useId();
  const helpId = `${controlId}-help`;
  const errorId = `${controlId}-error`;

  const context = useMemo<FieldContextValue>(
    () => ({
      controlId,
      describedBy:
        [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') ||
        undefined,
      invalid: Boolean(error),
      required,
    }),
    [controlId, helpId, errorId, help, error, required],
  );

  return (
    <div className={cx(styles.field, className)}>
      <label
        className={cx(styles.label, hideLabel && 'visually-hidden')}
        htmlFor={controlId}
      >
        {label}
        {required && (
          <>
            <span className={styles.required} aria-hidden="true">
              *
            </span>
            <span className="visually-hidden">(required)</span>
          </>
        )}
        {optional && !required && <span className={styles.optional}>Optional</span>}
      </label>

      <FieldContext.Provider value={context}>{children}</FieldContext.Provider>

      {help && (
        <p id={helpId} className={styles.help}>
          {help}
        </p>
      )}

      {/* Always mounted so the error is announced when it appears, not only
          when focus happens to land back on the control. */}
      <div aria-live="polite">
        {error && (
          <p id={errorId} className={styles.error}>
            <Icon name="alertCircle" className={styles.errorIcon} />
            <span>{error}</span>
          </p>
        )}
      </div>
    </div>
  );
}
