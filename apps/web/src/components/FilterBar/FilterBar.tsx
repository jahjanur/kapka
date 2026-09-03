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

/** The semantic colours a chip can carry instead of the accent. */
export type ChipTone = 'danger' | 'warning' | 'info';

interface ChipProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  /**
   * Paints the chip in one of the semantic colours rather than the accent,
   * for a filter whose values already mean something in colour elsewhere in
   * the product — urgency being the one that does.
   */
  tone?: ChipTone | undefined;
}

export function FilterChip({ selected, onClick, children, tone }: ChipProps) {
  return (
    <button
      type="button"
      className={styles.chip}
      data-tone={tone}
      aria-pressed={selected}
      onClick={onClick}
    >
      {/* Decorative, and deliberately so: the label beside it already says
          which level this is, and the accessible name has to stay exactly
          "Critical". Colour is never the only channel (§10). */}
      {tone !== undefined && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </button>
  );
}

export function FilterGroupLabel({ children }: { children: ReactNode }) {
  return <span className={styles.groupLabel}>{children}</span>;
}
