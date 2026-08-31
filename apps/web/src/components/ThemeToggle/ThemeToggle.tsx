import { useTheme, type ThemePreference } from '../../lib/theme';
import { Icon, type IconName } from '../Icon/Icon';
import styles from './ThemeToggle.module.css';

const OPTIONS: Array<{ value: ThemePreference; icon: IconName; label: string }> = [
  { value: 'system', icon: 'monitor', label: 'Match system' },
  { value: 'light', icon: 'sun', label: 'Light' },
  { value: 'dark', icon: 'moon', label: 'Dark' },
];

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div className={styles.group} role="radiogroup" aria-label="Colour theme">
      {OPTIONS.map(({ value, icon, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          className={styles.option}
          onClick={() => setPreference(value)}
        >
          <Icon name={icon} />
          <span className="visually-hidden">{label}</span>
        </button>
      ))}
    </div>
  );
}
