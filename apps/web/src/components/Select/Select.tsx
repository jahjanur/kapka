import type { SelectHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import { Icon } from '../Icon/Icon';
import { useFieldContext } from '../Field/FieldContext';
import styles from './Select.module.css';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Shown as a dimmed, unselectable first option. */
  placeholder?: string;
}

/**
 * Native select, styled wrapper. City in particular must be a select and not a
 * text input — free-text entry silently breaks matching ("Bitola" vs "bitola "
 * vs "Битола"), which is a P0 decision in §3.
 */
export function Select({
  placeholder,
  className,
  children,
  value,
  defaultValue,
  ...rest
}: SelectProps) {
  const field = useFieldContext();
  const isPlaceholder = placeholder !== undefined && (value ?? defaultValue ?? '') === '';

  return (
    <span className={styles.wrapper}>
      <select
        id={field?.controlId}
        aria-describedby={field?.describedBy}
        aria-invalid={field?.invalid === true ? true : undefined}
        required={field?.required}
        data-placeholder={isPlaceholder || undefined}
        className={cx(styles.select, className)}
        value={value}
        defaultValue={defaultValue}
        {...rest}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children}
      </select>
      <Icon name="chevronDown" className={styles.chevron} />
    </span>
  );
}
