import { NavLink, Link } from 'react-router-dom';
import { Button } from '../Button/Button';
import { Container } from '../layout/Container';
import { Icon } from '../Icon/Icon';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle';
import { useSession } from '../../lib/session';
import { PATHS } from '../../routes/paths';
import styles from './AppHeader.module.css';

const NAV = [
  { to: PATHS.feed, label: 'Requests', end: true },
  { to: PATHS.postRequest, label: 'Post a request', end: false },
  { to: PATHS.howItWorks, label: 'How it works', end: false },
];

/**
 * Sticky, and deliberately thin — on a phone the header is competing with the
 * feed for the space above the fold, and the feed wins (§9.1).
 *
 * The nav appears from the medium breakpoint up. On a phone it would push the
 * one action that matters off the row, and both destinations are reachable
 * from the page anyway.
 */
export function AppHeader() {
  const { session } = useSession();

  return (
    <header className={styles.header}>
      <Container>
        <div className={styles.inner}>
          <Link to={PATHS.feed} className={styles.brand}>
            <Icon name="droplet" className={styles.mark} />
            Kapka
          </Link>

          <nav className={styles.nav} aria-label="Main">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className={styles.actions}>
            <span className={styles.themeToggle}>
              <ThemeToggle />
            </span>

            {session ? (
              /* The way in to your own profile, and on a phone the only one:
                 the nav is hidden below 48rem, so an avatar that was not a
                 link left /me reachable by typing the URL and no other way.
                 Labelled rather than left to the initial, which is decoration
                 — a screen reader announcing "A" is not a destination. */
              <Link to={PATHS.dashboard} className={styles.who} aria-label="Your profile">
                <span className={styles.whoAvatar} aria-hidden="true">
                  {session.user.fullName.slice(0, 1).toUpperCase()}
                </span>
                <span className={styles.whoName}>{session.user.fullName}</span>
              </Link>
            ) : (
              <Button to={PATHS.register} size="sm">
                <span className={styles.registerShort}>Register</span>
                <span className={styles.registerLong}>Register as donor</span>
              </Button>
            )}
          </div>
        </div>
      </Container>
    </header>
  );
}
