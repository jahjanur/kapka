import type { ReactNode } from 'react';
import { Icon, type IconName } from '../Icon/Icon';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon?: IconName;
  headline: string;
  /** One sentence. Say what will appear here, or what to change. */
  body?: ReactNode;
  /** One action. Not three. */
  action?: ReactNode;
}

export function EmptyState({
  icon = 'droplet',
  headline,
  body,
  action,
}: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <span className={styles.art}>
        <Icon name={icon} />
      </span>
      <h2 className={styles.headline}>{headline}</h2>
      {body && <p className={styles.body}>{body}</p>}
      {action}
    </div>
  );
}
