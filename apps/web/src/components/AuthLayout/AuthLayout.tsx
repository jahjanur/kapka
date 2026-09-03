import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon/Icon';
import { cx } from '../../lib/cx';
import { DROP_PATH } from '../Icon/brandPaths';
import { AuthScene } from './AuthScene';
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
  /** The brand emblem astride the band's edge — the screen that leads with
   *  the product rather than a step. */
  mark?: boolean;
  /** The landscape along the bottom — for a screen short enough to have a
   *  bottom. The sign-up form scrolls; drawing under it would only put
   *  texture behind the last field. */
  scene?: boolean;
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
  scene = false,
  children,
  footer,
  centred = false,
}: AuthLayoutProps) {
  return (
    <div className={cx(styles.page, centred && styles.pageCentred)}>
      <div className={styles.band}>
        {/* Both of these sit in the screen's corners rather than in the
            card's column: a back arrow an inch from the title reads as part
            of the title, and on a wide screen it floated in the middle of a
            red field with nothing to anchor it. */}
        {back && (
          <Link to={back} className={styles.back} aria-label="Back">
            <Icon name="chevronRight" className={styles.backIcon} />
          </Link>
        )}
        {progress && (
          /* Two of the same fact: the shorthand for whoever is looking at it,
             and the sentence for whoever is listening. "1 slash 2" is not
             something to hear read out. */
          <p className={styles.count}>
            <span aria-hidden="true">
              {progress.step}/{progress.of}
            </span>
            <span className="visually-hidden">
              Step {progress.step} of {progress.of}
            </span>
          </p>
        )}

        <div className={styles.bandInner}>
          <h1 className={styles.title}>{title}</h1>

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

          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>

        {mark && (
          /* The product's drop, filled and lit, seated on the curve with the
             lower half on the white — the one place on the screen where the
             brand is the subject. Drawn from the sprite's own droplet path,
             with a darker pool clipped inside it, so the emblem and the
             favicon can never drift apart. */
          <span className={styles.mark} aria-hidden="true">
            <svg className={styles.markDrop} viewBox="0 0 24 24" focusable="false">
              <defs>
                <clipPath id="kapka-auth-mark">
                  <path d={DROP_PATH} />
                </clipPath>
              </defs>
              <path className={styles.markBody} d={DROP_PATH} />
              {/* Centred in the lower bulb with a rim of white all round —
                  liquid held in the drop. Flush with an edge it reads as a
                  hole in it. */}
              <circle
                className={styles.markPool}
                cx="12"
                cy="17.6"
                r="3.9"
                clipPath="url(#kapka-auth-mark)"
              />
            </svg>
          </span>
        )}
      </div>

      <div className={styles.card}>{children}</div>

      {footer && <p className={styles.footer}>{footer}</p>}

      {scene && <AuthScene />}
    </div>
  );
}
