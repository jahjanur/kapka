import { Button } from '../Button/Button';
import { BloodTypeBadge } from '../BloodTypeBadge/BloodTypeBadge';
import { Card } from '../Card/Card';
import { Icon } from '../Icon/Icon';
import { UrgencyPill } from '../UrgencyPill/UrgencyPill';
import { timeAgo } from '../../lib/relativeTime';
import type { BloodRequest } from '../../lib/requests';
import styles from './RequestCard.module.css';

export function RequestCard({ request }: { request: BloodRequest }) {
  const {
    id, bloodType, unitsNeeded, urgency, hospitalName, city, note, createdAt,
  } = request;

  return (
    <div className={styles.shell}>
      <Card>
        <div className={styles.card}>
          <div className={styles.top}>
            <BloodTypeBadge type={bloodType} size="lg" />
            <UrgencyPill urgency={urgency} />
          </div>

          <div className={styles.body}>
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
              <span className={styles.metaItem}>
                <Icon name="clock" />
                <time dateTime={createdAt}>{timeAgo(createdAt)}</time>
              </span>
            </div>
            {note && <p className={styles.note}>{note}</p>}
          </div>

          <div className={styles.actions}>
            <Button variant="secondary" aria-describedby={`req-${id}-label`}>
              View request
              <Icon name="chevronRight" />
            </Button>
            {/* Gives the button an accessible name that says WHICH request,
                so a screen reader does not hear seven identical buttons. */}
            <span id={`req-${id}-label`} className="visually-hidden">
              {`${bloodType} at ${hospitalName}, ${city}`}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
