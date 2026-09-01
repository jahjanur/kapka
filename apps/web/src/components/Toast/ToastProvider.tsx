import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { Icon, type IconName } from '../Icon/Icon';
import { ToastContext, type ToastOptions, type ToastTone } from './toastContext';
import styles from './Toast.module.css';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

/** Long enough to read a sentence, short enough not to sit in the way. */
const DEFAULT_DURATION = 5000;

const ICON: Record<ToastTone, IconName> = {
  info: 'info',
  success: 'checkCircle',
  error: 'alertCircle',
};

/**
 * Transient messages, announced rather than shown.
 *
 * A toast never takes focus. Moving focus to something that is about to
 * disappear on a timer strands a keyboard user on an element that no longer
 * exists, and interrupts whatever they were doing to tell them a thing they
 * did worked. The live region does the telling instead.
 *
 * Errors are announced assertively and do not time out. A message saying
 * something failed is one the reader has to act on, and taking it away after
 * five seconds is how a failure goes unnoticed.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const tone = options.tone ?? 'info';
      // An error stays until it is dismissed, unless the caller insists.
      const duration = options.duration ?? (tone === 'error' ? 0 : DEFAULT_DURATION);
      const id = nextId.current++;

      setToasts((current) => [...current, { id, message, tone }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
    },
    [dismiss],
  );

  /* Every pending timer, cleared on unmount. A stray setTimeout calling
     setState after the tree has gone is a warning in development and a leak
     in a long-lived tab. */
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext value={value}>
      {children}

      {/*
        Two regions, because politeness is a property of the region and not of
        the message: an assertive live region interrupts whatever a screen
        reader is saying, which is right for a failure and rude for "saved".
      */}
      <div className={styles.region}>
        <div aria-live="polite" className={styles.stack}>
          {toasts
            .filter((toast) => toast.tone !== 'error')
            .map((toast) => (
              <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
            ))}
        </div>
        <div aria-live="assertive" className={styles.stack}>
          {toasts
            .filter((toast) => toast.tone === 'error')
            .map((toast) => (
              <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
            ))}
        </div>
      </div>
    </ToastContext>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  return (
    <div className={cx(styles.toast, styles[toast.tone])}>
      <Icon name={ICON[toast.tone]} className={styles.icon} />
      <p className={styles.message}>{toast.message}</p>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => onDismiss(toast.id)}
      >
        <Icon name="close" />
        <span className="visually-hidden">Dismiss</span>
      </button>
    </div>
  );
}
