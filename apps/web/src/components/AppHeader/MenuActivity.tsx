import { useMemo } from 'react';
import { Icon } from '../Icon/Icon';
import { Skeleton } from '../Skeleton/Skeleton';
import { useCountUp } from '../../lib/useCountUp';
import { useRequests } from '../../lib/useRequests';
import styles from './MenuActivity.module.css';

/**
 * What is actually happening, at the foot of the menu.
 *
 * The numbers are the live list, not a copy of it: `open` is how many requests
 * are unanswered and `units` is what they add up to, both from the same
 * endpoint the feed's own counters read. Nothing here is stored, so nothing
 * here can drift from what the feed shows, and nothing can be invented — if
 * the list is empty, these cannot be either.
 *
 * The fetch is free until it is wanted. This panel is mounted only while the
 * menu is open (see AppHeader), so the request happens when somebody opens the
 * menu and on none of the thirteen screens that render the header. There is a
 * test in AppHeader.test.tsx watching for exactly that.
 */
export function MenuActivity() {
  const { data, isLoading, error } = useRequests();

  const stats = useMemo(() => {
    if (!data) return null;
    return {
      open: data.length,
      units: data.reduce((total, request) => total + request.unitsNeeded, 0),
    };
  }, [data]);

  /* A failed fetch says nothing here. A menu is not where somebody finds out
     that a count could not be loaded — the feed will tell them properly. */
  if (error) return null;

  return (
    /* Real information, so real semantics: a labelled region, and the figures
       as term-and-value pairs read as "Open requests, 7". */
    <section className={styles.activity} aria-labelledby="menu-activity">
      <h3 className={styles.heading} id="menu-activity">
        Right now
      </h3>

      {isLoading || !stats ? (
        /* The space is held rather than filled with a zero. The height here
           matches the figures below exactly, so nothing moves when they
           arrive. */
        <div className={styles.figures} aria-hidden="true">
          <Placeholder />
          <Placeholder />
        </div>
      ) : stats.open === 0 ? (
        /* Nothing open is good news, and "0" set in display type is not how
           good news should look at the foot of a menu. */
        <p className={styles.calm}>
          <Icon name="checkCircle" className={styles.calmMark} />
          No open requests right now.
        </p>
      ) : (
        <Figures open={stats.open} units={stats.units} />
      )}
    </section>
  );
}

function Placeholder() {
  return (
    <div className={styles.figure}>
      <span className={styles.mark} />
      <div className={styles.figureText}>
        <Skeleton width="2.5rem" height="2rem" />
        <Skeleton width="4.5rem" shape="text" />
      </div>
    </div>
  );
}

/**
 * Split out so the counters mount only once there is something to count: a
 * hook cannot live behind an early return, and a count starting at zero before
 * the data lands would animate from nothing to nothing.
 */
function Figures({ open, units }: { open: number; units: number }) {
  const shownOpen = useCountUp(open);
  const shownUnits = useCountUp(units);

  return (
    <dl className={styles.figures}>
      <div className={styles.figure}>
        {/* A request is somebody asking; a unit is the blood itself. The two
            glyphs say which is which rather than repeating one drop twice. */}
        <span className={styles.mark} aria-hidden="true">
          <Icon name="clipboard" />
        </span>
        <div className={styles.figureText}>
          <dt className={styles.label}>Open requests</dt>
          <dd className={styles.value} data-numeric>
            {shownOpen}
          </dd>
        </div>
      </div>

      <div className={styles.figure}>
        <span className={styles.mark} aria-hidden="true">
          <Icon name="droplet" />
        </span>
        <div className={styles.figureText}>
          <dt className={styles.label}>Units needed</dt>
          <dd className={styles.value} data-numeric>
            {shownUnits}
          </dd>
        </div>
      </div>
    </dl>
  );
}
