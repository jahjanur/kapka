import { createContext, useContext } from 'react';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastOptions {
  tone?: ToastTone;
  /** Milliseconds before it leaves on its own. 0 keeps it until dismissed. */
  duration?: number;
}

export interface ToastValue {
  /** Shows a message. Returns nothing: a toast is told, not managed. */
  show: (message: string, options?: ToastOptions) => void;
}

export const ToastContext = createContext<ToastValue | null>(null);

/**
 * The context and the hook live apart from the provider so no file exports
 * both a component and a non-component, which is what keeps Fast Refresh
 * working across edits.
 */
export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside a <ToastProvider>');
  return value;
}
