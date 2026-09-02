import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon/Icon';
import { cx } from '../../lib/cx';
import styles from './AuthLayout.module.css';

interface AuthLayoutProps {
  /** Sits in the band, above the card. */
  title: ReactNode;
  /** One line under the title. */
  subtitle?: ReactNode;
  /** Where the back arrow goes. Omitted, there is no arrow. */
  back?: string;
  /** Shown opposite the arrow — "1 of 2" and its bar. */
  progress?: { step: number; of: number } | undefined;
  /** The brand droplet above the title, for a screen with no back arrow. */
  mark?: boolean;
  children: ReactNode;
  /** Under the card, on the band: the way across to the other screen. */
  footer?: ReactNode;
  /**
   * For a screen whose card is short enough to sit in the middle of the
   * viewport — sign-in. The sign-up form is taller than a phone screen, so it
   * starts at the top and scrolls, and centring it would only push the first
   * field further down.
   */
  centred?: boolean;
}

/**
 * The shell both auth screens sit in: a band in the product's colour, and a
 * card that starts inside it and runs off the bottom of the screen.
 *
 * One component rather than two copies, because the two screens have to look
 * like the same product — a sign-in that is a shade off the sign-up is the
 * kind of thing nobody can name and everybody notices.
 */
export function AuthLayout({
  title,
  subtitle,
  back,
  progress,
  mark = false,
  children,
  footer,
  centred = false,
}: AuthLayoutProps) {
  return (
    <div className={cx(styles.page, centred && styles.pageCentred)}>
      <div className={styles.band}>
        <div className={styles.bandInner}>
          <div className={styles.top}>
            {back && (
              <Link to={back} className={styles.back} aria-label="Back">
                <Icon name="chevronRight" className={styles.backIcon} />
              </Link>
            )}
            <h1 className={cx(styles.title, !back && styles.titleCentred)}>{title}</h1>
            {progress && (
              /* Two of the same fact: the shorthand for whoever is looking at
                 it, and the sentence for whoever is listening. "1 slash 2" is
                 not something to hear read out. */
              <p className={styles.count}>
                <span aria-hidden="true">
                  {progress.step}/{progress.of}
                </span>
                <span className="visually-hidden">
                  Step {progress.step} of {progress.of}
                </span>
              </p>
            )}
          </div>

          {/* The bar repeats what the count says, for everyone who reads the
              shape of a page before its words. Both are hidden from screen
              readers: the form announces its own step heading. */}
          {progress && (
            <ol className={styles.pips} aria-hidden="true">
              {Array.from({ length: progress.of }, (_, i) => (
                <li
                  key={i}
                  className={cx(styles.pip, i < progress.step && styles.pipOn)}
                />
              ))}
            </ol>
          )}

          {mark && (
            <span className={styles.mark} aria-hidden="true">
              <Icon name="droplet" />
            </span>
          )}

          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      </div>

      <div className={styles.card}>{children}</div>

      {footer && <p className={styles.footer}>{footer}</p>}
    </div>
  );
}
