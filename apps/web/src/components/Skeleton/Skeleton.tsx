import { cx } from '../../lib/cx';
import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: string;
  height?: string;
  /**
   * 'text' takes the height of a line of body copy, so a placeholder for a
   * sentence does not have to be measured by hand. 'circle' is for a badge or
   * a pill, which are the round things on these screens.
   */
  shape?: 'block' | 'text' | 'circle';
  /* `| undefined` spelled out: every CSS-module lookup is that type here. */
  className?: string | undefined;
}

/**
 * One grey block of a loading placeholder.
 *
 * It is a piece, not a screen. The rule in §9.7 is that a skeleton is
 * shape-matched to the content it stands in for — so the arrangement of these
 * belongs beside the component being stood in for, where it changes when that
 * component does. RequestCardSkeleton is the worked example: it reuses the
 * card's own classes rather than describing the card from memory.
 *
 * Only opacity animates, which keeps it cheap on a mid-range Android (§6.6).
 */
export function Skeleton({
  width = '100%',
  height,
  shape = 'block',
  className,
}: SkeletonProps) {
  return (
    <span
      className={cx(styles.skeleton, shape !== 'block' && styles[shape], className)}
      /* Width and height are the caller's, and are the only things here that
         cannot be a class: they describe the specific content being waited
         for. Everything else is in the stylesheet. */
      style={{ inlineSize: width, blockSize: height }}
    />
  );
}
