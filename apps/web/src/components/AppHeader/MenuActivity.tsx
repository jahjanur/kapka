import { useMemo } from 'react';
import { useCountUp } from '../../lib/useCountUp';
import { useRequests } from '../../lib/useRequests';
import styles from './MenuActivity.module.css';

/**
 * What is actually happening, at the foot of the menu.
 *
 * It replaces a chip row and an illustration that were there because the
 * space was empty. Decoration in a space that size always reads as padding,
 * however well it is drawn — so the rule now is that the foot of this panel
 * either says something true or is not there.
 *
 * The numbers are the live list, not a copy of it: `open` is how many
 * requests are unanswered and `units` is what they add up to, both from the
 * same endpoint the feed reads. Nothing here is written down anywhere; if the
 * list is empty, these cannot be either.
 *
 * The fetch is free until it is wanted. This whole panel is mounted only
 * while the menu is open (see AppHeader), so the request happens when
 * somebody opens the menu and not on any of the thirteen screens that render
 * the header.
 */
export function MenuActivity() {
  const { data, isLoading, error } = useRequests();

  const stats = useMemo(() => {
    if (!data || data.length === 0) return null;
    return {
      open: data.length,
      units: data.reduce((total, request) => total + request.unitsNeeded, 0),
    };
  }, [data]);

  /* Nothing true to say yet, or nothing true to say at all: no skeleton, no
     zero, no placeholder. The drawer simply ends where its content does —
     which is a better answer than holding space for news that is not there. */
  if (isLoading || error || !stats) return null;

  return <Figures open={stats.open} units={stats.units} />;
}

/**
 * Split out so the counters are only mounted once there is something to count
 * — a hook cannot live behind the early return above it, and a count that
 * starts at zero before the data lands would animate from nothing to nothing.
 */
function Figures({ open, units }: { open: number; units: number }) {
  const shownOpen = useCountUp(open);
  const shownUnits = useCountUp(units);

  return (
    /* Real information gets real semantics: a labelled group of term-and-value
       pairs, read as "Open requests, 7". The numerals are visually above their
       labels and after them in the DOM, which is the order that makes sense
       heard. */
    <section className={styles.activity} aria-labelledby="menu-activity">
      <h3 className={styles.heading} id="menu-activity">
        Right now
      </h3>
      <dl className={styles.figures}>
        <div className={styles.figure}>
          <dt className={styles.label}>Open requests</dt>
          <dd className={styles.value} data-numeric>
            {shownOpen}
          </dd>
        </div>
        <div className={styles.figure}>
          <dt className={styles.label}>Units needed</dt>
          <dd className={styles.value} data-numeric>
            {shownUnits}
          </dd>
        </div>
      </dl>
    </section>
  );
}
