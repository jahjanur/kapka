import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { space, type SpaceStep } from '../../lib/space';
import styles from './Layout.module.css';

interface ClusterProps extends HTMLAttributes<HTMLElement> {
  gap?: SpaceStep;
  align?: 'start' | 'center' | 'end' | 'baseline' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
  as?: ElementType;
  children?: ReactNode;
}

const ALIGN = {
  start: 'flex-start', center: 'center', end: 'flex-end',
  baseline: 'baseline', stretch: 'stretch',
} as const;

const JUSTIFY = {
  start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between',
} as const;

/** A wrapping row — filter chips, tag lists, button groups. Wraps, never scrolls. */
export function Cluster({
  gap = 2, align = 'center', justify = 'start',
  as: Tag = 'div', className, style, children, ...rest
}: ClusterProps) {
  return (
    <Tag
      className={cx(styles.cluster, className)}
      style={{
        '--gap': space(gap),
        '--align': ALIGN[align],
        '--justify': JUSTIFY[justify],
        ...style,
      } as CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  );
}
