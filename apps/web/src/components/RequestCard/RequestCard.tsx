import { Link } from 'react-router-dom';
import { Skeleton } from '../Skeleton/Skeleton';
import { BloodTypeBadge } from '../BloodTypeBadge/BloodTypeBadge';
import { announceBloodType } from '@kapka/shared';
import { Icon } from '../Icon/Icon';
import { UrgencyPill } from '../UrgencyPill/UrgencyPill';
import { timeAgo } from '../../lib/relativeTime';
import type { PublicBloodRequest } from '@kapka/shared';
import { PATHS } from '../../routes/paths';
import styles from './RequestCard.module.css';

/**
 * One request in the feed (§9.1).
 *
 * The whole card is the link, not a button inside it. A card with a button in
 * the corner gives you one small target and no way to open it in a tab; a
 * card that is a link gives you the entire surface, middle-click, cmd-click
 * and a real URL to send someone. The "View request" row at the bottom is the
 * affordance, not the control.
 *
 * It lays itself out from its own width rather than the viewport's, so the
 * same component is right in a 14rem rail, a 22rem preview column and a feed
 * row of one. That is what the wrapper below is for: an element cannot query
 * its own width, so the container is the shell and the card reads it.
 *
 * The shell takes its width from whatever holds it — which is every case in
 * this app, since a card is always a grid item or a block. Dropping one into
 * a shrink-to-fit context (a flex row with `flex: none`) would collapse it,
 * because inline-size containment makes the intrinsic width ignore contents.
 */
export function RequestCard({ request }: { request: PublicBloodRequest }) {
  const { id, bloodType, unitsNeeded, urgency, hospitalName, city, note, createdAt } =
    request;

  return (
    <div className={styles.shell}>
      <Link
        to={PATHS.request(id)}
        className={styles.card}
        data-urgency={urgency}
        // Seven cards otherwise read as seven identical "View request" links.
        aria-label={`${announceBloodType(bloodType)} needed at ${hospitalName}, ${city}`}
      >
        <span className={styles.stripe} aria-hidden="true" />
        {/* A highlight that crosses the card once on hover — see .sheen. */}
        <span className={styles.sheen} aria-hidden="true" />

        <div className={styles.top}>
          <BloodTypeBadge type={bloodType} size="lg" />
          <UrgencyPill urgency={urgency} />
          <time className={styles.age} dateTime={createdAt}>
            {timeAgo(createdAt)}
          </time>
        </div>

        <h3 className={styles.hospital}>{hospitalName}</h3>

        <div className={styles.meta}>
          <span className={styles.metaItem}>
            <Icon name="mapPin" />
            {city}
          </span>
          <span className={styles.metaItem}>
            <Icon name="droplet" />
            <span data-numeric>{unitsNeeded}</span>
            {unitsNeeded === 1 ? ' unit' : ' units'}
          </span>
        </div>

        {note && <p className={styles.note}>{note}</p>}

        {/* Pushed to the bottom so cards of different heights line up. */}
        <span className={styles.cta}>
          View request
          <Icon name="chevronRight" />
        </span>
      </Link>
    </div>
  );
}

/**
 * The card, before its request has arrived.
 *
 * It lives here, beside the card, and reuses the card's own classes — so the
 * padding, the radius, the gaps and the container-query bands are not
 * mimicked, they are the same rules. A skeleton written from memory in the
 * screen that shows it drifts the first time the card changes, which is
 * exactly what happened to the one that used to live in Feed.tsx: the card
 * grew a shell and three width bands and the skeleton kept the old shape.
 *
 * Shape-matched is the whole point (§9.7). A grey box of roughly the right
 * height still makes the page jump when the real content lands.
 */
export function RequestCardSkeleton() {
  return (
    <div className={styles.shell} aria-hidden="true">
      <div className={styles.card}>
        <span className={styles.stripe} />

        <div className={styles.top}>
          <Skeleton width="4rem" height="2.25rem" shape="circle" />
          <Skeleton width="5.5rem" height="1.75rem" shape="circle" />
        </div>

        <Skeleton width="80%" height="1.4rem" />

        <div className={styles.meta}>
          <Skeleton width="6rem" shape="text" />
          <Skeleton width="4rem" shape="text" />
        </div>

        <span className={styles.cta}>
          <Skeleton width="7rem" shape="text" />
        </span>
      </div>
    </div>
  );
}
