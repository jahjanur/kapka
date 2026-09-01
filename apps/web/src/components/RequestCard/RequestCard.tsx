import { Link } from 'react-router-dom';
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
