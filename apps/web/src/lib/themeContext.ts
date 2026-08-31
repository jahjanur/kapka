import { createContext, useContext } from 'react';

/**
 * Theme handling. Dark is built alongside light, never bolted on (§6.2).
 *
 * Three states, matching the token layer:
 *   'system' — no data-theme attribute; prefers-color-scheme decides.
 *   'light'  — data-theme="light" pins light even if the OS is dark.
 *   'dark'   — data-theme="dark" pins dark and wins by specificity.
 *
 * The context and the hook live apart from the provider component so a file
 * never exports both a component and a non-component — which is what keeps
 * React Fast Refresh working across edits.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'kapka.theme';

export interface ThemeContextValue {
  /** What the user chose. */
  preference: ThemePreference;
  /** What is actually on screen right now. */
  resolved: 'light' | 'dark';
  setPreference: (next: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside a <ThemeProvider>');
  return context;
}

/**
 * A `?theme=` override, used by the kitchen sink's preview frames so light and
 * dark can be shown side by side. Deliberately not persisted: the frame and
 * the page share an origin and therefore a localStorage, so writing it would
 * change the theme of the page doing the previewing.
 */
export function themeFromUrl(): ThemePreference | null {
  const value = new URLSearchParams(window.location.search).get('theme');
  return value === 'light' || value === 'dark' ? value : null;
}

export function readStoredPreference(): ThemePreference {
  // Private windows and blocked site data both throw here, not just return null.
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    /* no stored preference available — fall through to system */
  }
  return 'system';
}
