import { useEffect, useRef, useState, type CSSProperties } from 'react';
import styles from './ViewportFrame.module.css';

interface ViewportFrameProps {
  /** The width the framed page believes it has, in CSS pixels. */
  width: number;
  src: string;
  label?: string;
}

export function ViewportFrame({ width, src, label }: ViewportFrameProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const available = entry.contentRect.width;
      // Never scale up — a 360px frame on a wide screen stays 1:1 and honest.
      setScale(Math.min(1, available / width));
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [width]);

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>
        {label ?? `${width}px`}
        {scale < 1 && ` · shown at ${Math.round(scale * 100)}%`}
      </figcaption>
      <div className={styles.viewport} ref={boxRef}>
        <iframe
          className={styles.frame}
          style={{ '--frame-width': `${width}px`, '--frame-scale': scale } as CSSProperties}
          src={src}
          title={label ?? `Preview at ${width} pixels wide`}
          loading="lazy"
        />
      </div>
    </figure>
  );
}

export function ViewportFrames({ src }: { src: string }) {
  return (
    <div className={styles.frames}>
      <ViewportFrame width={360} src={src} label="360px · the floor" />
      <ViewportFrame width={1280} src={src} label="1280px · desktop" />
    </div>
  );
}
