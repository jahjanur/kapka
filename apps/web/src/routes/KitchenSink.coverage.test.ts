import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The kitchen sink claims to render every component. That claim rots the
 * moment someone adds a component and forgets — which is exactly what had
 * happened: 20 components were exported and 8 were shown, so the whole Tier 2
 * set had no specimen and no visual-regression coverage.
 *
 * This makes the claim self-enforcing rather than aspirational.
 */

const BARREL = 'apps/web/src/components/index.ts';
const GALLERY = 'apps/web/src/routes/Gallery.tsx';

/**
 * Exported things that are deliberately not specimens. Each needs a reason —
 * "it is awkward to render" is not one.
 */
const NOT_SPECIMENS: Record<string, string> = {
  IconSprite:
    'infrastructure, not a visual. Mounted once in App.tsx; the gallery shows the glyphs it defines.',
  AppHeader:
    'a page shell with position: sticky. Inside a gallery it would pin over the specimens; it is visible on the feed itself.',
};

function read(path: string): string {
  // Vitest runs with the workspace root as cwd. Fail loudly rather than
  // silently passing on an empty string if that ever changes.
  expect(
    existsSync(path),
    `expected to find ${path} — is the cwd still the repo root?`,
  ).toBe(true);
  return readFileSync(path, 'utf8');
}

/** Component-shaped exports: PascalCase, no trailing constants or types. */
function exportedComponents(): string[] {
  const barrel = read(BARREL);
  return [...barrel.matchAll(/export \{([^}]+)\}/g)]
    .flatMap((match) =>
      (match[1] ?? '').split(',').map((name) => name.trim().split(' ')[0] ?? ''),
    )
    .filter((name) => /^[A-Z][a-zA-Z]*$/.test(name));
}

describe('the kitchen sink renders every component', () => {
  const gallery = read(GALLERY);
  const components = exportedComponents();

  it('finds the components to check', () => {
    // A regex that matched nothing would make every assertion below vacuous.
    expect(components.length).toBeGreaterThan(10);
  });

  it.each(components)('%s has a specimen, or a documented reason not to', (name) => {
    const shown = new RegExp(`<${name}[\\s/>]`).test(gallery);
    if (!shown) {
      expect(
        NOT_SPECIMENS[name],
        `${name} is exported but not in the kitchen sink. Add a specimen, or ` +
          'add it to NOT_SPECIMENS with a reason.',
      ).toBeTruthy();
    }
  });

  it('keeps the exemption list honest', () => {
    // An exemption for something that no longer exists hides the next gap.
    for (const name of Object.keys(NOT_SPECIMENS)) {
      expect(components, `${name} is exempt but no longer exported`).toContain(name);
    }
  });
});

describe('the preview frames cover both themes', () => {
  it('pins one frame to each theme rather than relying on the page toggle', () => {
    // A dark-mode regression should be visible without switching and
    // re-reading the whole page.
    const frame = read('apps/web/src/components/ViewportFrame/ViewportFrame.tsx');
    expect(frame).toMatch(/theme="light"/);
    expect(frame).toMatch(/theme="dark"/);
  });

  it('offers 360px, the floor the layout must survive', () => {
    const frame = read('apps/web/src/components/ViewportFrame/ViewportFrame.tsx');
    expect(frame).toMatch(/\b360\b/);
  });
});
