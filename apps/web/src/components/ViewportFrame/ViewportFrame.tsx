import { useState, type CSSProperties } from 'react';
import { Button } from '../Button/Button';
import styles from './ViewportFrame.module.css';

/** The phone widths worth checking by eye. 360 is the floor (§7.1). */
const WIDTHS = [360, 390, 430] as const;

/**
 * Renders a route at a real phone width, at 1:1, inside the current page.
 *
 * Deliberately does NOT scale a desktop width down to a thumbnail — a 1280px
 * frame shrunk to fit a column is too small to judge anything in, which is
 * worse than not showing it. The desktop view is the page you are already on;
 * this covers the narrow end, where the layout actually has to work hardest.
 */
export function ViewportFrame({ src }: { src: string }) {
  const [width, setWidth] = useState<number>(360);

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        {WIDTHS.map((candidate) => (
          <Button
            key={candidate}
            size="sm"
            variant={candidate === width ? 'primary' : 'secondary'}
            aria-pressed={candidate === width}
            onClick={() => setWidth(candidate)}
          >
            {candidate}px
          </Button>
        ))}
        <span className={styles.caption}>
          {width === 360 ? 'the floor — sideways scroll here is a bug' : 'shown at 1:1'}
        </span>
      </div>

      <div
        className={styles.viewport}
        style={{ '--frame-width': `${width}px` } as CSSProperties}
      >
        <iframe
          className={styles.frame}
          src={src}
          title={`Preview at ${width} pixels wide`}
          loading="lazy"
        />
      </div>
    </div>
  );
}
