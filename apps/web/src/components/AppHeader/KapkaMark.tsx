import { useId } from 'react';
import { cx } from '../../lib/cx';
import styles from './KapkaMark.module.css';

/**
 * The brand mark: a drop with a heartbeat cut out of it.
 *
 * The droplet alone is the most drawn shape in the category — every blood
 * service has one, and ours was the sprite glyph at a larger size, which is a
 * symbol borrowed rather than owned. Here the drop is a solid form and the
 * trace is knocked out of it, so the two things the product is about are one
 * shape instead of two placed side by side.
 *
 * The cut is a real hole, so whatever is behind shows through it: the mark is
 * `currentColor` and nothing else, and it works on the gradient disc in the
 * menu, on a card, and inverted on a filled button with no second copy.
 *
 * Drawn as a stroked path inside a mask rather than as a hand-written outline.
 * The outline version photographed well at 160px and closed into a smudge at
 * 24 — which is the size the header actually renders it at. A stroke has one
 * number for thickness, so the small size is tunable rather than redrawn, and
 * three segments survive where nine did not.
 */
export function KapkaMark({ className }: { className?: string | undefined }) {
  /* Two of these render at once — the bar and the menu — so the mask needs an
     id per instance rather than a constant that appears twice in the
     document. */
  const cut = useId();

  const drop =
    'M12 2.4c.85 3 2.65 5.4 4.95 7.3 2.3 1.9 3.55 4 3.55 6.25A8.5 8.5 0 0 1 12 22.1a8.5 8.5 0 0 1-8.5-8.15c0-2.25 1.25-4.35 3.55-6.25C9.35 7.8 11.15 5.4 12 2.4Z';

  return (
    <svg
      className={cx(styles.mark, className)}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <mask id={cut} maskUnits="userSpaceOnUse">
        {/* White keeps, black cuts. */}
        <path d={drop} fill="#fff" />
        <path
          className={styles.trace}
          d="M5.6 15.4h2.9l1.9-4.6 2.4 8 1.7-3.4h2"
          fill="none"
          stroke="#000"
        />
      </mask>

      <path className={styles.drop} d={drop} mask={`url(#${cut})`} />
    </svg>
  );
}
