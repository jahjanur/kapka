import { useEffect } from 'react';
import { ToastProvider, useToast, type ToastTone } from '../src/components';

const MESSAGE: Record<ToastTone, string> = {
  info: 'Your draft is saved on this device.',
  success: 'Your details are saved.',
  error: 'That did not go through. Try again.',
};

function Raise({ tone }: { tone: ToastTone }) {
  const { show } = useToast();
  useEffect(() => {
    /* 0 is "until dismissed", which the provider already supports — the error
       tone uses it by default. Without it a toast takes itself off screen
       after a few seconds and the snapshot is racing a timer it cannot see.
       The duration changes nothing about how a toast looks, which is the only
       thing being photographed here. */
    show(MESSAGE[tone], { tone, duration: 0 });
  }, [show, tone]);
  return null;
}

/**
 * One toast, raised the only way a toast can be raised.
 *
 * There is no exported component for a single toast — the provider owns them,
 * which is the right design, and it means the specimen has to ask for one
 * rather than reaching past the provider to render its internals.
 */
export function ToastShelf({ tone }: { tone: ToastTone }) {
  return (
    <ToastProvider>
      <Raise tone={tone} />
    </ToastProvider>
  );
}
