import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Testing Library only registers its own cleanup when Vitest globals are on.
 * We keep imports explicit instead, so unmount between tests is wired here —
 * without it, renders pile up in the same document and queries start matching
 * elements left over from the previous test.
 */
afterEach(() => {
  cleanup();
});

/**
 * jsdom does not implement matchMedia, so anything reading a media query —
 * ThemeProvider asking for prefers-color-scheme — throws on render. This is a
 * jsdom gap rather than a defect in the component, so it is filled here rather
 * than defended against in the code.
 *
 * Defaults to "no match", i.e. the light theme, which is the neutral answer.
 *
 * Assigned unconditionally: TypeScript's DOM types say matchMedia always
 * exists, so guarding on it is dead code the linter rightly rejects.
 */
window.matchMedia = (query: string): MediaQueryList =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }) as MediaQueryList;
