import type { TextareaHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import { useFieldContext } from '../Field/FieldContext';
import styles from './Input.module.css';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...rest }: TextareaProps) {
  const field = useFieldContext();
  return (
    <textarea
      id={field?.controlId}
      aria-describedby={field?.describedBy}
      aria-invalid={field?.invalid || undefined}
      required={field?.required}
      className={cx(styles.textarea, className)}
      {...rest}
    />
  );
}
