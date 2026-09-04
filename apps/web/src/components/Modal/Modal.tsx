import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { Icon } from '../Icon/Icon';
import styles from './Modal.module.css';

export type ModalShape = 'auto' | 'centre' | 'sheet' | 'drawer';

interface ModalProps {
  open: boolean;
  /** Called for every way out: Escape, the close button, the backdrop. */
  onClose: () => void;
  /** Names the dialog for a screen reader, and heads it for everyone else. */
  title: string;
  /**
   * Shown in the head instead of the title — a brand lockup, a summary,
   * anything a plain heading cannot be.
   *
   * `title` is still required and still names the dialog; it is rendered
   * visually hidden rather than dropped, because the accessible name is not
   * decoration to be replaced by a nicer-looking one.
   */
  head?: ReactNode;
  children: ReactNode;
  /** Actions, kept below the content so a long body scrolls under them. */
  footer?: ReactNode;
  /**
   * 'auto' is a centre dialog from 48rem and a bottom sheet below it — the
   * same dialog, two shapes, decided in CSS. Force one with 'centre',
   * 'sheet' or 'drawer' when the content only makes sense that way.
   */
  shape?: ModalShape;
  /**
   * Whether Escape and the backdrop may dismiss it. Turn it off for a
   * decision that must be made rather than avoided — never for a dialog that
   * is merely showing something, where it leaves a user with no way out.
   */
  dismissible?: boolean;
  className?: string | undefined;
}

/**
 * A modal dialog: centred on a wide screen, a bottom sheet on a phone.
 *
 * Built on <dialog> and showModal() rather than a div with role="dialog", and
 * what that buys is exactly the three things hardest to hand-roll:
 *
 *   focus trap     the browser holds focus inside, including for a screen
 *                  reader's virtual cursor, which a keydown-based Tab trap
 *                  does not;
 *   inertness      everything behind is inert, with no sweep of aria-hidden
 *                  that has to be undone correctly afterwards;
 *   the top layer  it renders above the sticky header and the two fixed
 *                  action bars this app already has, with no z-index to keep
 *                  track of.
 *
 * Escape and focus restoration come from the same place: the browser fires
 * `close`, and returns focus to whatever had it when showModal ran.
 */
export function Modal({
  open,
  onClose,
  title,
  head,
  children,
  footer,
  shape = 'auto',
  dismissible = true,
  className,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  /* onClose in a ref, so the listener below is attached once rather than
     re-bound on every render of whatever owns the open state. */
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    /* Every exit lands here. Escape, the close button and the backdrop all
       end at dialog.close(), which fires this — one path out, so the owner's
       state cannot drift from what is on screen. */
    const handleClose = () => close.current();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, []);

  return (
    /* The click handler below is the backdrop dismissal. Its keyboard
       equivalent is Escape, which <dialog> handles natively and onCancel
       gates — there is no listener to add here that would not duplicate it,
       and the rule cannot see that the platform already did the work. */
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events
    <dialog
      ref={ref}
      className={cx(styles.dialog, styles[shape], className)}
      aria-labelledby="modal-title"
      onCancel={(event) => {
        // Escape reaches the dialog as `cancel` before it closes. Refusing it
        // here is what makes dismissible={false} mean anything.
        if (!dismissible) event.preventDefault();
      }}
      onClick={(event) => {
        /* A click on the backdrop targets the dialog element itself; a click
           on anything inside targets that. Comparing them is the whole test. */
        if (dismissible && event.target === ref.current) ref.current.close();
      }}
    >
      <div className={styles.panel}>
        {/* Not a control — a sheet is dismissed by the button or by Escape.
            It is here because a sheet with no visible top edge reads as the
            page having jumped. */}
        <span className={styles.grabber} aria-hidden="true" />

        <header className={styles.head}>
          <h2
            id="modal-title"
            className={head === undefined ? styles.title : 'visually-hidden'}
          >
            {title}
          </h2>
          {head}
          {dismissible && (
            <button
              type="button"
              className={styles.close}
              onClick={() => ref.current?.close()}
            >
              <Icon name="close" />
              <span className="visually-hidden">Close</span>
            </button>
          )}
        </header>

        <div className={styles.body}>{children}</div>

        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </dialog>
  );
}

/**
 * The same dialog, pinned to the bottom edge at every width.
 *
 * Not a second implementation: two overlays would be two focus traps, two
 * Escape handlers and two chances to get either of them wrong. A sheet is a
 * shape this one takes, not a different thing.
 */
export function Sheet(props: Omit<ModalProps, 'shape'>) {
  return <Modal {...props} shape="sheet" />;
}

/**
 * The same dialog again, pinned to the inline-end edge and the full height of
 * the screen.
 *
 * For navigation rather than a decision: a menu is a list you scan down, and
 * a panel down the side of the screen is the shape that gives it room to be
 * one. A sheet has to stop at 85vh so the page behind it says it is a sheet,
 * which is the right trade for "email 23 donors?" and the wrong one for a
 * list that wants the height.
 */
export function Drawer(props: Omit<ModalProps, 'shape'>) {
  return <Modal {...props} shape="drawer" />;
}
