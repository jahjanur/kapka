import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { space, type SpaceStep } from '@kapka/tokens';
import styles from './Layout.module.css';

interface WithSidebarProps extends HTMLAttributes<HTMLElement> {
  sidebar: ReactNode;
  /** Which side the sidebar sits on once there is room for both. */
  side?: 'start' | 'end';
  /** Sidebar's preferred width. */
  sidebarWidth?: string;
  /** Below this, main wraps under the sidebar instead of squashing. */
  mainMin?: string;
  gap?: SpaceStep;
  children?: ReactNode;
}

/**
 * Two columns that become one on their own, with no breakpoint. Used for the
 * feed's filter rail (§9.1) and the donor dashboard (§9.5).
 */
export function WithSidebar({
  sidebar,
  side = 'start',
  sidebarWidth = '16rem',
  mainMin = '32rem',
  gap = 6,
  className,
  style,
  children,
  ...rest
}: WithSidebarProps) {
  return (
    <div
      className={cx(styles.withSidebar, className)}
      style={
        {
          '--gap': space(gap),
          '--sidebar-basis': sidebarWidth,
          '--main-min': mainMin,
          ...style,
        } as CSSProperties
      }
      {...rest}
    >
      <div className={cx(styles.sidebar, side === 'end' && styles.sidebarLast)}>
        {sidebar}
      </div>
      <div className={styles.main}>{children}</div>
    </div>
  );
}
