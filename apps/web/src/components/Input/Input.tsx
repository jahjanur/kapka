import type { InputHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import { useFieldContext } from '../Field/FieldContext';
import styles from './Input.module.css';

type InputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * A bare control. The label, help text, error text and ARIA wiring all come
 * from the surrounding <Field> — there is deliberately no `label` prop, so a
 * placeholder can never end up standing in for one.
 */
export function Input({ className, ...rest }: InputProps) {
  const field = useFieldContext();
  return (
    <input
      id={field?.controlId}
      aria-describedby={field?.describedBy}
      aria-invalid={field?.invalid === true ? true : undefined}
      required={field?.required}
      className={cx(styles.input, className)}
      {...rest}
    />
  );
}
