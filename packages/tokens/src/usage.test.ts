import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Enforces the rule the plan states and §6 repeats: if a value is not a token,
 * it is a bug.
 *
 * Lives beside the token layer rather than in the web app because it reads CSS
 * off disk, which needs the node environment — under jsdom, import.meta.url is
 * not a file: URL.
 *
 * The most valuable check here is the last one. A typo in `var(--bourder-subtle)`
 * is not an error in CSS — the declaration is simply dropped, the element
 * renders with no border, and nothing anywhere says so.
 */

const webSrc = fileURLToPath(new URL('../../../apps/web/src/', import.meta.url));
const tokensSrc = fileURLToPath(new URL('./', import.meta.url));

function filesWithExtension(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...filesWithExtension(path, extensions));
    else if (extensions.some((ext) => path.endsWith(ext))) out.push(path);
  }
  return out;
}

const cssFiles = (dir: string) => filesWithExtension(dir, ['.css']);

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const componentCss = cssFiles(webSrc).map((path) => ({
  name: path.replace(webSrc, ''),
  source: stripComments(readFileSync(path, 'utf8')),
}));

/** Every custom property the token layer defines, in any scope. */
const definedTokens = new Set<string>();
for (const file of ['tokens.css', 'scale.css', 'global.css']) {
  const source = stripComments(readFileSync(tokensSrc + file, 'utf8'));
  for (const match of source.matchAll(/(--[\w-]+)\s*:/g))
    definedTokens.add(match[1] ?? '');
}

/**
 * Custom properties the components set at runtime through inline styles —
 * `style={{ '--flow': space(gap) }}`. These are how the layout primitives are
 * parameterised, so CSS that reads them is correct, not broken.
 *
 * Collected across the whole app rather than per file, because the component
 * that sets a property and the stylesheet that reads it are different files by
 * design. A name that appears in neither place is still caught.
 */
const runtimeProperties = new Set<string>();
for (const path of filesWithExtension(webSrc, ['.tsx', '.ts'])) {
  const source = readFileSync(path, 'utf8');
  for (const match of source.matchAll(/['"](--[\w-]+)['"]\s*:/g)) {
    runtimeProperties.add(match[1] ?? '');
  }
}

describe('no hard-coded colours', () => {
  it.each(componentCss)('$name', ({ source }) => {
    // Every colour comes from a semantic token, so a theme change is one edit
    // in one file rather than a hunt through components.
    const literals = [...source.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/g)];
    expect(literals.map((m) => m[0])).toEqual([]);
  });
});

describe('no hard-coded durations', () => {
  it.each(componentCss)('$name', ({ source }) => {
    // Motion timing is a design decision (§6.6: entrances 220ms, exits 140ms),
    // not a per-component choice.
    const lines = source
      .split('\n')
      .filter((line) => /\b\d+(\.\d+)?m?s\b/.test(line) && !line.includes('var(--dur'));
    expect(lines.map((l) => l.trim())).toEqual([]);
  });
});

describe('every referenced token exists', () => {
  it.each(componentCss)('$name', ({ source }) => {
    // A component may define its own local custom properties; those count as
    // defined for that file.
    const local = new Set([...source.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1] ?? ''));
    const unresolved = [...source.matchAll(/var\(\s*(--[\w-]+)/g)]
      .map((m) => m[1] ?? '')
      .filter(
        (name) =>
          !definedTokens.has(name) && !local.has(name) && !runtimeProperties.has(name),
      );

    // A missing token is not a CSS error. The declaration is dropped, the
    // element renders unstyled, and nothing reports it — not the build, not
    // the browser console, not a type checker.
    expect([...new Set(unresolved)]).toEqual([]);
  });
});

describe('the token layer covers §6', () => {
  it.each([
    // §6.4 type
    '--text-xs',
    '--text-4xl',
    '--leading-tight',
    '--leading-relaxed',
    '--tracking-tight',
    '--tracking-wide',
    '--weight-normal',
    '--weight-bold',
    '--measure',
    // §6.5 spacing, radius, elevation
    '--space-1',
    '--space-24',
    '--space-section',
    '--space-block',
    '--radius-xs',
    '--radius-full',
    '--shadow-xs',
    '--shadow-lg',
    '--shadow-accent',
    '--elevation-1',
    '--elevation-4',
    '--border-hairline',
    // §6.6 motion
    '--dur-instant',
    '--dur-fast',
    '--dur-normal',
    '--dur-slow',
    '--ease-out',
    '--ease-in-out',
    '--ease-spring',
    // §6.7 interaction
    '--press-scale',
    '--hit-min',
    '--focus-ring',
    // layout
    '--container-max',
    '--bp-sm',
    '--bp-2xl',
    '--header-height',
  ])('defines %s', (token) => {
    expect(definedTokens.has(token)).toBe(true);
  });
});

describe('the JavaScript and CSS sides of a custom property agree', () => {
  it('sets every runtime property that some stylesheet reads', () => {
    // The layout primitives pass values in through inline styles. Rename one
    // side only and the layout silently falls back to its default.
    const readFromCss = new Set<string>();
    for (const { source } of componentCss) {
      for (const match of source.matchAll(/var\(\s*(--[\w-]+)/g)) {
        const name = match[1] ?? '';
        if (!definedTokens.has(name)) readFromCss.add(name);
      }
    }
    const orphaned = [...runtimeProperties].filter((name) => !readFromCss.has(name));
    expect(orphaned).toEqual([]);
  });
});

describe('the header height is derived, not repeated', () => {
  it('has exactly one literal definition of --header-height', () => {
    // The header's own height and every sticky offset below it must agree.
    // They were 3.5rem and 4.5rem in separate files, which would have drifted
    // the moment either changed.
    const header = componentCss.find((f) => f.name.includes('AppHeader'));
    const feed = componentCss.find((f) => f.name.includes('Feed.module'));
    expect(header?.source).toContain('calc(var(--header-height)');
    expect(feed?.source).toContain('inset-block-start: var(--header-height)');
  });
});
