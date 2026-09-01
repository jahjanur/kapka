import { useEffect, useState } from 'react';
import { Icon } from '../Icon/Icon';
import { useOnline } from '../../lib/useOnline';
import styles from './OfflineBanner.module.css';

/** Long enough to be read, short enough not to become furniture. */
const BACK_ONLINE_MS = 4000;

/**
 * One bar, app-wide, saying the connection has gone.
 *
 * App-wide rather than per screen: losing signal is not a property of the
 * page you happen to be on, and six screens each deciding how to say it would
 * be six wordings and five omissions.
 *
 * It also says when the connection comes back, briefly. Without that, someone
 * who lost signal mid-form has no idea whether it is safe to press the button
 * again — and on the request form that button sends an email to strangers.
 */
export function OfflineBanner() {
  const online = useOnline();
  const [showBack, setShowBack] = useState(false);

  /* Subscribed to, rather than derived from `online` inside an effect: the
     state changes in response to an event, and setting it in the effect body
     would be the cascading extra render react-hooks/set-state-in-effect is
     there to catch. The `online` event only fires after an absence, so
     "was it offline before" needs no flag of its own. */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onOnline = () => {
      setShowBack(true);
      timer = setTimeout(() => setShowBack(false), BACK_ONLINE_MS);
    };
    const onOffline = () => {
      if (timer) clearTimeout(timer);
      setShowBack(false);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (online && !showBack) return null;

  return (
    <div
      className={online ? styles.back : styles.offline}
      /* Polite, not assertive: losing signal is not worth cutting across
         whatever a screen reader is in the middle of saying, and the message
         stays on screen for as long as it is true. */
      role="status"
    >
      <Icon name={online ? 'checkCircle' : 'alertCircle'} />
      {online
        ? 'Back online.'
        : 'You are offline. Anything you have typed is still here.'}
    </div>
  );
}
