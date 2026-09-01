import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './FilterBar.module.css';

export function FilterBar({
  children,
  className,
  label,
}: {
  children: ReactNode;
  /* `| undefined` explicitly: noUncheckedIndexedAccess types every CSS-module
     lookup as `string | undefined`, and exactOptionalPropertyTypes means a
     bare `className?: string` cannot be handed one. React's own attribute
     types spell it out the same way. */
  className?: string | undefined;
  label: string;
}) {
  return (
    <div className={cx(styles.bar, className)}>
      <div className={styles.row} role="group" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

interface ChipProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function FilterChip({ selected, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      className={styles.chip}
      aria-pressed={selected}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function FilterGroupLabel({ children }: { children: ReactNode }) {
  return <span className={styles.groupLabel}>{children}</span>;
}
