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
 */
export function RequestCard({ request }: { request: PublicBloodRequest }) {
  const { id, bloodType, unitsNeeded, urgency, hospitalName, city, note, createdAt } =
    request;

  return (
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
  );
}
