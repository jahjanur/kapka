import { useEffect, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { Button } from '../Button/Button';
import { Container } from '../layout/Container';
import { Icon, type IconName } from '../Icon/Icon';
import { Drawer } from '../Modal/Modal';
import { useSession } from '../../lib/session';
import { PATHS } from '../../routes/paths';
import styles from './AppHeader.module.css';

interface NavItem {
  to: string;
  label: string;
  end: boolean;
  icon: IconName;
  /** The line under the label in the menu. The inline nav shows the label alone. */
  note: string;
}

const NAV: NavItem[] = [
  {
    to: PATHS.feed,
    label: 'Requests',
    end: true,
    icon: 'droplet',
    note: 'Browse blood requests',
  },
  {
    to: PATHS.postRequest,
    label: 'Post a request',
    end: false,
    icon: 'clipboard',
    note: 'Ask for blood donation',
  },
  {
    to: PATHS.howItWorks,
    label: 'How it works',
    end: false,
    icon: 'info',
    note: 'Learn more about Kapka',
  },
];

/**
 * One destination in the menu: an icon, what it is, and what you would go
 * there for.
 *
 * The note is not decoration — "Post a request" and "Requests" are two words
 * apart and mean opposite things, and the line under each is what tells them
 * apart at a glance.
 */
function MenuRow({
  to,
  end,
  icon,
  label,
  note,
}: Omit<NavItem, 'note'> & { note: string }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        isActive ? `${styles.menuRow} ${styles.menuRowActive}` : styles.menuRow
      }
    >
      <span className={styles.menuRowMark} aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span className={styles.menuRowText}>
        <span className={styles.menuRowTitle}>{label}</span>
        <span className={styles.menuRowNote}>{note}</span>
      </span>
      <Icon name="chevronRight" className={styles.menuChevron} />
    </NavLink>
  );
}

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

        A shape of the one dialog rather than a panel of its own: <dialog>
        brings the focus trap, the inertness and the top layer with it, and a
        second overlay would be a second chance to get all three wrong (see
        Modal).
      */}
      {menuOpen && (
        <Drawer
          open
          title="Menu"
          onClose={() => setMenuOpen(false)}
          head={
            <span className={styles.menuBrand}>
              <Icon name="droplet" className={styles.menuBrandMark} />
              <span>
                <span className={styles.menuBrandName}>Kapka</span>
                <span className={styles.menuBrandLine}>
                  Together for a healthier tomorrow
                </span>
              </span>
            </span>
          }
        >
          {/* Who you are, before where you can go: signed out, the way in is
              the first thing the menu offers rather than an afterthought
              under the destinations. */}
          <Link
            to={session ? PATHS.dashboard : PATHS.login}
            className={styles.menuAccount}
          >
            <span className={styles.menuAccountAvatar} aria-hidden="true">
              {session ? (
                session.user.fullName.slice(0, 1).toUpperCase()
              ) : (
                <Icon name="user" />
              )}
            </span>
            <span className={styles.menuRowText}>
              <span className={styles.menuRowTitle}>
                {session ? session.user.fullName : 'Not signed in'}
              </span>
              <span
                className={
                  session
                    ? `${styles.menuRowNote} ${styles.menuRowNoteClamp}`
                    : styles.menuRowNote
                }
              >
                {session ? session.user.email : 'Sign in to access more features'}
              </span>
            </span>
            <Icon name="chevronRight" className={styles.menuChevron} />
          </Link>

          <nav className={styles.menuGroup} aria-label="Main">
            {NAV.map((item) => (
              <MenuRow key={item.to} {...item} />
            ))}
          </nav>

          {/* No "Profile" row: signed in, the card above already goes there,
              and two links to one screen in a panel this size is noise. */}
          <div className={styles.menuGroup}>
            <MenuRow
              to={PATHS.privacy}
              end={false}
              icon="shieldCheck"
              label="Privacy"
              note="What we store, and what we never show"
            />
          </div>

          {/* Signed out this is the ask, so it is a link; signed in the ask has
              been answered and a chevron would point at nothing. */}
          {session ? (
            <p className={styles.menuPitch}>
              <span className={styles.menuPitchMark} aria-hidden="true">
                <Icon name="heart" />
              </span>
              <span className={styles.menuRowText}>
                <span className={styles.menuPitchTitle}>Small actions save lives.</span>
                <span className={styles.menuRowNote}>
                  Thank you for being part of the change.
                </span>
              </span>
            </p>
          ) : (
            <Link to={PATHS.register} className={styles.menuPitch}>
              <span className={styles.menuPitchMark} aria-hidden="true">
                <Icon name="heart" />
              </span>
              <span className={styles.menuRowText}>
                <span className={styles.menuPitchTitle}>Small actions save lives.</span>
                <span className={styles.menuRowNote}>
                  Register as a donor and we will email you when you match.
                </span>
              </span>
              <Icon name="chevronRight" className={styles.menuChevron} />
            </Link>
          )}

          {/* Decorative, and the only thing in the menu that is. It signs the
              panel off rather than saying anything a reader has to act on. */}
          <span className={styles.menuFlourish} aria-hidden="true">
            <span className={styles.menuFlourishText}>Donate. Save lives.</span>
            <Icon name="heart" />
          </span>
        </Drawer>
      )}
    </header>
  );
}
