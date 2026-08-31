import { cx } from '../../lib/cx';
import type { Urgency } from '../../lib/requests';
import { Icon, type IconName } from '../Icon/Icon';
import styles from './UrgencyPill.module.css';

const URGENCY: Record<Urgency, { label: string; icon: IconName }> = {
  routine:  { label: 'Routine',  icon: 'clock' },
  urgent:   { label: 'Urgent',   icon: 'alertCircle' },
  critical: { label: 'Critical', icon: 'alertTriangle' },
};

export function UrgencyPill({ urgency, className }: { urgency: Urgency; className?: string }) {
  const { label, icon } = URGENCY[urgency];
  return (
    <span className={cx(styles.pill, styles[urgency], className)}>
      <Icon name={icon} className={styles.icon} />
      {label}
    </span>
  );
}
