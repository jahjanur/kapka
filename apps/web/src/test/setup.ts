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

/**
 * jsdom does not implement scrollIntoView either. The Picker calls it to keep
 * the option the arrow keys are on inside its scroller — a real behaviour with
 * nothing to assert in jsdom, which has no layout and no scrolling. Another
 * gap filled here rather than guarded against in the component.
 */
Element.prototype.scrollIntoView = function scrollIntoView() {
  /* Nothing to do: jsdom has no viewport to scroll within. */
};

/**
 * jsdom implements <dialog> as an element and nothing else — showModal is not
 * a function on it, so any component that opens one throws on render.
 *
 * This fills in the parts of the spec the tests need, and only those: the open
 * state, the close event, and returning focus to whatever had it when the
 * dialog opened. What it deliberately does NOT do is trap focus. That is the
 * browser's job in the real product, it is the reason the components use
 * showModal rather than a hand-rolled overlay, and a shim pretending to do it
 * here would only produce tests that pass against this file.
 */
interface ShimmedDialog extends HTMLDialogElement {
  __restoreFocusTo?: Element | null;
}

/* Assigned unconditionally, like matchMedia above: TypeScript's DOM types say
   these methods always exist, so guarding on them is dead code the linter
   rightly rejects. */
HTMLDialogElement.prototype.showModal = function showModal(this: ShimmedDialog) {
  this.__restoreFocusTo = document.activeElement;
  this.open = true;
  // The spec focuses the first focusable thing inside, or the dialog itself.
  const target = this.querySelector<HTMLElement>(
    '[autofocus], button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  (target ?? this).focus();
};

HTMLDialogElement.prototype.close = function close(this: ShimmedDialog) {
  if (!this.open) return;
  this.open = false;
  const restore = this.__restoreFocusTo;
  if (restore instanceof HTMLElement) restore.focus();
  this.dispatchEvent(new Event('close'));
};
