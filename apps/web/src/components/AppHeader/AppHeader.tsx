import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { Button } from '../Button/Button';
import { Container } from '../layout/Container';
import { Icon, type IconName } from '../Icon/Icon';
import { Drawer } from '../Modal/Modal';
import { KapkaMark } from './KapkaMark';
import { MenuActivity } from './MenuActivity';
import { MenuSignoff } from './MenuSignoff';
import { useSession } from '../../lib/session';
import { useDonorStatus } from '../../lib/useDonorStatus';
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

/**
 * The two things people opened the menu for. Raised, in their own block.
 *
 * A menu where every row is the same size says every destination matters the
 * same, and these two do not: one is the list of people who need blood and
 * the other is how you ask. The rest is reference.
 */
const PRIMARY: NavItem[] = [
  {
    to: PATHS.feed,
    label: 'Requests',
    end: true,
    icon: 'droplet',
    note: 'Browse who needs blood now',
  },
  {
    to: PATHS.postRequest,
    label: 'Post a request',
    end: false,
    icon: 'dropletPlus',
    note: 'Ask for blood donation',
  },
];

/** Reference, not action — quieter, and in the one hue that is not blood. */
const SECONDARY: NavItem[] = [
  {
    to: PATHS.howItWorks,
    label: 'How it works',
    end: false,
    icon: 'info',
    note: 'Matching, eligibility, timing',
  },
  {
    to: PATHS.privacy,
    label: 'Privacy',
    end: false,
    icon: 'shieldCheck',
    note: 'What we store, and what we never show',
  },
];

/**
 * The inline nav on a wide screen: labels only, and only the destinations
 * that fit a bar. The notes and the rest belong to the menu.
 */
const NAV: NavItem[] = [...PRIMARY, ...SECONDARY.slice(0, 1)];

/**
 * A destination in the menu, at whichever of the two weights it carries.
 *
 * `--menu-step` is the stagger: rows arrive in sequence rather than as one
 * slab, which is what makes a panel feel opened rather than switched on.
 */
function MenuRow({
  item,
  step,
  tone = 'accent',
  badge,
}: {
  item: NavItem;
  step: number;
  tone?: 'accent' | 'calm';
  badge?: ReactNode;
}) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      data-tone={tone}
      style={{ '--menu-step': step } as React.CSSProperties}
      className={({ isActive }) =>
        isActive ? `${styles.row} ${styles.rowActive}` : styles.row
      }
    >
      <span className={styles.rowMark} aria-hidden="true">
        <Icon name={item.icon} />
      </span>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{item.label}</span>
        <span className={styles.rowNote}>{item.note}</span>
      </span>
      {badge}
      <Icon name="chevronRight" className={styles.rowChevron} />
    </NavLink>
  );
}

/**
 * Sticky, and deliberately thin — on a phone the header is competing with the
 * feed for the space above the fold, and the feed wins (§9.1).
 *
 * The row itself only ever holds the wordmark and one action. What changes at
 * 48rem is where the rest lives: inline as a nav on a wide screen, behind a
 * menu button on a phone.
 */
export function AppHeader({
  /**
   * How many requests are open, for the badge on Requests.
   *
   * A prop rather than a fetch of its own: this header is on nineteen
   * screens, useRequests has no shared cache, and a badge is not worth asking
   * the API for the whole feed on Privacy and Login. The feed already holds
   * this number and hands it over; everywhere else the badge is simply absent,
   * which is honest rather than a zero nobody counted.
   */
  openRequests,
}: {
  openRequests?: number | undefined;
} = {}) {
  const { session } = useSession();
  /* The one answer to "should this person be asked to register" — see
     useDonorStatus for why it is not `session &&` or the role. */
  const { isLoading, isAuthenticated, isRegisteredDonor } = useDonorStatus();
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
            <KapkaMark className={styles.mark} />
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
            {/* Nothing until the boot refresh answers. This slot used to render
                "Register" optimistically, so a returning donor watched it turn
                into their own avatar a moment later — the flash that makes
                somebody doubt their registration went through. The slot keeps
                its width either way, so nothing moves when the answer
                arrives. */}
            {isLoading ? null : session ? (
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
        brings role="dialog", aria-modal, the focus trap, Escape, focus
        restoration and the top layer with it. A second overlay would be a
        second chance to get all six wrong (see Modal).
      */}
      {menuOpen && (
        <Drawer
          open
          title="Menu"
          onClose={() => setMenuOpen(false)}
          head={
            <span className={styles.lockup}>
              <span className={styles.lockupMark} aria-hidden="true">
                <KapkaMark />
              </span>
              <span className={styles.lockupText}>
                <span className={styles.lockupName}>Kapka</span>
                <span className={styles.lockupLine}>
                  Together for a healthier tomorrow
                </span>
              </span>
            </span>
          }
        >
          <div className={styles.menu}>
            {/* ── 2. Identity ─────────────────────────────────────────────
                Signed out this is a door, not a fault: no warning colour, no
                alert icon, and the sentence says what is on the other side
                rather than what is missing. */}
            <Link
              to={session ? PATHS.dashboard : PATHS.login}
              className={styles.identity}
              style={{ '--menu-step': 0 } as React.CSSProperties}
            >
              <span className={styles.identityAvatar} aria-hidden="true">
                {session ? (
                  session.user.fullName.slice(0, 1).toUpperCase()
                ) : (
                  <Icon name="user" />
                )}
              </span>
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>
                  {session ? session.user.fullName : 'Not signed in'}
                </span>
                <span
                  className={
                    session ? `${styles.rowNote} ${styles.rowNoteClamp}` : styles.rowNote
                  }
                >
                  {session ? session.user.email : 'Sign in to see your matches'}
                </span>
              </span>
              <Icon name="chevronRight" className={styles.rowChevron} />
            </Link>

            {/* ── 3. Primary ─────────────────────────────────────────────── */}
            <nav className={styles.primary} aria-label="Main">
              {PRIMARY.map((item, index) => (
                <MenuRow
                  key={item.to}
                  item={item}
                  step={index + 1}
                  {...(item.to === PATHS.feed && openRequests !== undefined
                    ? {
                        badge: (
                          <span className={styles.count}>
                            <span data-numeric>{openRequests}</span> open
                          </span>
                        ),
                      }
                    : {})}
                />
              ))}
            </nav>

            {/* ── 4. Secondary ───────────────────────────────────────────── */}
            <nav className={styles.secondary} aria-label="About Kapka">
              {SECONDARY.map((item, index) => (
                <MenuRow key={item.to} item={item} step={index + 3} tone="calm" />
              ))}
            </nav>

            {/* ── 5. The ask ───────────────────────────────────────────────
                Nothing while the session is still resolving: a register card
                that appears and then disappears reads as the registration
                having failed, which is the exact doubt this is here to
                remove. */}
            {isLoading ? null : isRegisteredDonor ? (
              <p
                className={styles.pledge}
                style={{ '--menu-step': 5 } as React.CSSProperties}
              >
                <span className={styles.pledgeMark} aria-hidden="true">
                  <Icon name="heart" />
                </span>
                <span className={styles.rowText}>
                  <span className={styles.pledgeTitle}>You are on the list.</span>
                  <span className={styles.rowNote}>
                    We email you when someone nearby matches your type.
                  </span>
                </span>
              </p>
            ) : (
              /* Signed in without a profile lands here too, and should: an
                 account is not a donor. What changes is where it goes — the
                 form knows to ask for the two missing fields rather than for
                 an account this person already has. */
              <Link
                to={isAuthenticated ? PATHS.createAccount : PATHS.register}
                className={styles.pledge}
                style={{ '--menu-step': 5 } as React.CSSProperties}
              >
                <span className={styles.pledgeMark} aria-hidden="true">
                  <Icon name="heart" />
                </span>
                <span className={styles.rowText}>
                  <span className={styles.pledgeTitle}>
                    {isAuthenticated ? 'Finish becoming a donor' : 'Register as a donor'}
                  </span>
                  <span className={styles.rowNote}>
                    {isAuthenticated
                      ? 'Your blood type and city are all that is missing.'
                      : 'One minute, and we only write when you can help.'}
                  </span>
                </span>
                <Icon name="chevronRight" className={styles.rowChevron} />
              </Link>
            )}

            {/* ── 6. What is happening ────────────────────────────────────
                A chip row and an illustration used to close the menu, and
                both were there because the space was: a legend of categories
                nobody could act on, over a drawing that would have suited any
                app about water. The foot of this panel now says something
                true or is not there at all. */}
            <MenuActivity />

            <MenuSignoff />
          </div>
        </Drawer>
      )}
    </header>
  );
}
