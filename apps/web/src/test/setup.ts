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
