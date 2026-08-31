import type { CSSProperties } from 'react';
import { cx } from '../../lib/cx';
import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: string;
  height?: string;
  shape?: 'block' | 'text' | 'circle';
  className?: string;
}

export function Skeleton({
  width = '100%', height, shape = 'block', className,
}: SkeletonProps) {
  return (
    <span
      className={cx(styles.skeleton, shape !== 'block' && styles[shape], className)}
      style={{ display: 'block', inlineSize: width, blockSize: height } as CSSProperties}
    />
  );
}
