import { Link } from 'react-router-dom';
import { Button } from '../Button/Button';
import { Container } from '../layout/Container';
import { Icon } from '../Icon/Icon';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle';
import styles from './AppHeader.module.css';

/**
 * Compact and sticky. On a phone it is the wordmark plus one action — nothing
 * competes with the feed for the space above the fold (§9.1).
 */
export function AppHeader() {
  return (
    <header className={styles.header}>
      <Container>
        <div className={styles.inner}>
          <Link to="/" className={styles.brand}>
            <Icon name="droplet" className={styles.mark} />
            Kapka
          </Link>

          {/*
            No nav yet. The only screen that exists is this one, and the logo
            already goes there — a nav listing where you already are is noise.
            It comes back when §9.2–§9.6 give it somewhere to point.

            Nothing developer-facing belongs here. Someone reading this header
            is looking for blood or offering to give it.
          */}

          <div className={styles.actions}>
            <span className={styles.themeToggle}>
              <ThemeToggle />
            </span>
            <Button size="sm">
              <span className={styles.registerShort}>Register</span>
              <span className={styles.registerLong}>Register as donor</span>
            </Button>
          </div>
        </div>
      </Container>
    </header>
  );
}
