import { useState, type CSSProperties } from 'react';
import { Button } from '../Button/Button';
import styles from './ViewportFrame.module.css';

/** The phone widths worth checking by eye. 360 is the floor (§7.1). */
const WIDTHS = [360, 390, 430] as const;

interface ViewportFrameProps {
  src: string;
  /** Pins the frame to one theme, independent of the surrounding page. */
  theme: 'light' | 'dark';
  width: number;
}

function Frame({ src, theme, width }: ViewportFrameProps) {
  const separator = src.includes('?') ? '&' : '?';
  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>{theme}</figcaption>
      <div
        className={styles.viewport}
        style={{ '--frame-width': `${width}px` } as CSSProperties}
      >
        <iframe
          className={styles.frame}
          src={`${src}${separator}theme=${theme}`}
          title={`Preview at ${String(width)} pixels wide, ${theme} theme`}
          loading="lazy"
        />
      </div>
    </figure>
  );
}

/**
 * Renders a route at a real phone width, at 1:1, in both themes at once.
 *
 * Deliberately does NOT scale a desktop width down to a thumbnail — a 1280px
 * frame shrunk to fit a column is too small to judge anything in, which is
 * worse than not showing it. The desktop view is the page you are already on;
 * this covers the narrow end, where the layout has to work hardest, and the
 * theme you are not currently looking at.
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
            onClick={() => {
              setWidth(candidate);
            }}
          >
            {candidate}px
          </Button>
        ))}
        <span className={styles.caption}>
          {width === 360 ? 'the floor — sideways scroll here is a bug' : 'shown at 1:1'}
        </span>
      </div>

      <div className={styles.frames}>
        <Frame src={src} theme="light" width={width} />
        <Frame src={src} theme="dark" width={width} />
      </div>
    </div>
  );
}
