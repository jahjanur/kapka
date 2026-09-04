import { useEffect, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { Button } from '../Button/Button';
import { Container } from '../layout/Container';
import { Icon, type IconName } from '../Icon/Icon';
import { Sheet } from '../Modal/Modal';
import { useSession } from '../../lib/session';
import { PATHS } from '../../routes/paths';
import styles from './AppHeader.module.css';

const NAV: { to: string; label: string; end: boolean; icon: IconName }[] = [
  { to: PATHS.feed, label: 'Requests', end: true, icon: 'droplet' },
  { to: PATHS.postRequest, label: 'Post a request', end: false, icon: 'clipboard' },
  { to: PATHS.howItWorks, label: 'How it works', end: false, icon: 'info' },
];

/**
 * Sticky, and deliberately thin — on a phone the header is competing with the
 * feed for the space above the fold, and the feed wins (§9.1).
 *
 * The row itself only ever holds the wordmark and one action. What changes at
 * 48rem is where the rest lives: inline as a nav on a wide screen, behind a
 * menu button on a phone. It used to live nowhere at all below 48rem, which
 * left a phone with a header of two things and no way to reach a third screen.
 */
export function AppHeader() {
  const { session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  /* Arriving somewhere is what dismisses the menu — a click on a link inside
     it, but equally a Back, a redirect, or any navigation this component did
     not hear about.

     Adjusted during render rather than in an effect: it is React's own
     recommendation for state that has to follow a changing value, and it
     closes the menu in the same pass instead of leaving it standing over the
     new page for a frame. */
  const [menuPathname, setMenuPathname] = useState(pathname);
  if (pathname !== menuPathname) {
    setMenuPathname(pathname);
    setMenuOpen(false);
  }

  /* A hairline under the header is a line across the page while the page is
     at rest. It earns itself once there is something scrolled beneath it —
     which is also the moment it starts doing the job of separating them. */
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={styles.header} data-scrolled={scrolled || undefined}>
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
            {session ? (
              /* The way in to your own profile, and on a phone the only one
                 outside the menu. Labelled rather than left to the initial,
                 which is decoration — a screen reader announcing "A" is not a
                 destination. */
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

            {/* Phone only — from 48rem the nav is on the row and this button
                would open a menu holding what is already visible. */}
            <button
              type="button"
              className={styles.menuButton}
              aria-expanded={menuOpen}
              aria-haspopup="dialog"
              onClick={() => setMenuOpen(true)}
            >
              <Icon name="menu" />
              <span className="visually-hidden">Menu</span>
            </button>
          </div>
        </div>
      </Container>

      {/*
        Mounted only while open, so the links inside are not a second copy of
        every destination sitting in the accessibility tree behind a closed
        dialog.

        A Sheet rather than a drawer of its own: <dialog> brings the focus
        trap, the inertness and the top layer with it, and a second overlay
        would be a second chance to get all three wrong (see Modal).
      */}
      {menuOpen && (
        <Sheet open title="Menu" onClose={() => setMenuOpen(false)}>
          <nav className={styles.menuNav} aria-label="Main">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive
                    ? `${styles.menuLink} ${styles.menuLinkActive}`
                    : styles.menuLink
                }
              >
                <Icon name={item.icon} className={styles.menuIcon} />
                {item.label}
                <Icon name="chevronRight" className={styles.menuChevron} />
              </NavLink>
            ))}

            {session && (
              <NavLink
                to={PATHS.dashboard}
                className={({ isActive }) =>
                  isActive
                    ? `${styles.menuLink} ${styles.menuLinkActive}`
                    : styles.menuLink
                }
              >
                <Icon name="user" className={styles.menuIcon} />
                Your profile
                <Icon name="chevronRight" className={styles.menuChevron} />
              </NavLink>
            )}
          </nav>
        </Sheet>
      )}
    </header>
  );
}
