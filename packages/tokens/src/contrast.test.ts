import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio, oklchToSrgb, parseOklch, type Oklch } from './color';

/**
 * §6.2 claims every pairing clears WCAG AA, and §10 requires verifying every
 * token pair in both themes. This is that verification, run on every commit.
 *
 * It reads tokens.css rather than a copy of the values, so it fails if someone
 * changes a token and not the claim.
 */

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');

/** Pulls the custom-property declarations out of one rule block. */
function block(selector: string): Record<string, string> {
  const at = css.indexOf(selector);
  if (at === -1) throw new Error(`missing selector: ${selector}`);
  const start = css.indexOf('{', at);
  let depth = 0;
  let end = start;
  for (; end < css.length; end += 1) {
    if (css[end] === '{') depth += 1;
    else if (css[end] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const out: Record<string, string> = {};
  for (const match of css.slice(start + 1, end).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[match[1] ?? ''] = (match[2] ?? '').trim();
  }
  return out;
}

const light = block(':root {');
const darkMedia = block('@media (prefers-color-scheme: dark)');
const darkManual = block(':root[data-theme="dark"]');

/** Follows var() chains, falling back to the light scope for shared values. */
function resolve(name: string, scope: Record<string, string>): Oklch {
  let value = scope[name] ?? light[name];
  for (let hop = 0; value?.startsWith('var(') && hop < 10; hop += 1) {
    const ref = /var\(\s*(--[\w-]+)/.exec(value)?.[1] ?? '';
    value = scope[ref] ?? light[ref];
  }
  const parsed = value ? parseOklch(value) : null;
  if (!parsed)
    throw new Error(`could not resolve ${name} to a colour (got ${value ?? 'nothing'})`);
  return parsed;
}

/** [foreground, background, minimum ratio, what it is]. */
type Pairing = [string, string, number, string];

const PAIRINGS: Pairing[] = [
  // 4.5:1 — body text (§10).
  ['--fg-primary', '--bg-canvas', 4.5, 'body text on the page'],
  ['--fg-primary', '--bg-surface', 4.5, 'body text on a card'],
  ['--fg-primary', '--bg-surface-alt', 4.5, 'body text on a muted surface'],
  ['--fg-primary', '--bg-inset', 4.5, 'text typed into an input'],
  ['--fg-secondary', '--bg-canvas', 4.5, 'secondary text on the page'],
  ['--fg-secondary', '--bg-surface', 4.5, 'secondary text on a card'],
  ['--fg-secondary', '--bg-surface-alt', 4.5, 'secondary text on a muted surface'],
  ['--fg-muted', '--bg-canvas', 4.5, 'muted text on the page'],
  ['--fg-muted', '--bg-surface', 4.5, "a card's city, units and time-ago"],
  ['--fg-muted', '--bg-inset', 4.5, 'input placeholder'],
  ['--fg-onAccent', '--accent', 4.5, 'primary button label'],
  ['--fg-onAccent', '--accent-hover', 4.5, 'primary button label, hovered'],
  ['--fg-onAccent', '--accent-active', 4.5, 'primary button label, pressed'],
  ['--fg-onDanger', '--danger', 4.5, 'destructive button label'],
  ['--fg-onDanger', '--danger-hover', 4.5, 'destructive button label, hovered'],
  ['--fg-onDanger', '--danger-active', 4.5, 'destructive button label, pressed'],
  ['--accent-ink', '--bg-surface', 4.5, 'link on a card'],
  ['--accent-ink', '--accent-surface', 4.5, 'accent text on an accent surface'],
  ['--success-ink', '--success-surface', 4.5, 'success message'],
  ['--warning-ink', '--warning-surface', 4.5, 'warning message'],
  ['--danger-ink', '--danger-surface', 4.5, 'field error message'],
  ['--info-ink', '--info-surface', 4.5, 'info message'],

  // 3:1 — non-text contrast (WCAG 1.4.11).
  ['--border-control', '--bg-surface', 3, 'input border on a card'],
  ['--border-control', '--bg-canvas', 3, 'input border on the page'],
  ['--focus-ring', '--bg-canvas', 3, 'focus ring on the page'],
  ['--focus-ring', '--bg-surface', 3, 'focus ring on a card'],
  ['--accent', '--bg-surface', 3, 'accent used as a boundary'],
];

for (const group of ['o', 'a', 'b', 'ab']) {
  const upper = group.toUpperCase();
  PAIRINGS.push(
    [
      `--bt-${group}-solid-fg`,
      `--bt-${group}-solid-bg`,
      4.5,
      `${upper}+ badge, solid fill`,
    ],
    [`--bt-${group}-ink`, `--bt-${group}-surface`, 4.5, `${upper}− badge, outlined`],
  );
}

const THEMES: [string, Record<string, string>][] = [
  ['light', {}],
  ['dark (system preference)', darkMedia],
  ['dark (manual toggle)', darkManual],
];

describe.each(THEMES)('%s theme clears WCAG AA', (_theme, scope) => {
  it.each(PAIRINGS)('%s on %s ≥ %s:1 — %s', (fg, bg, min, _label) => {
    const ratio = contrastRatio(resolve(fg, scope), resolve(bg, scope));
    expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(min);
  });
});

describe('the two dark blocks stay identical', () => {
  it('declares the same tokens with the same values', () => {
    // Plain CSS cannot share a declaration list across a media-query
    // boundary, so the file holds the dark values twice. They drift silently:
    // the OS-preference path and the manual toggle would then disagree.
    expect(Object.keys(darkManual).sort()).toEqual(Object.keys(darkMedia).sort());
    for (const key of Object.keys(darkMedia)) {
      expect(darkManual[key], key).toBe(darkMedia[key]);
    }
  });
});

describe('colour maths', () => {
  it('matches the known extremes', () => {
    const white = parseOklch('oklch(1 0 0)');
    const black = parseOklch('oklch(0 0 0)');
    expect(white).not.toBeNull();
    expect(black).not.toBeNull();
    if (!white || !black) return;
    expect(contrastRatio(white, black)).toBeCloseTo(21, 1);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });

  it('clamps out-of-gamut colours to what a display actually shows', () => {
    // An OKLCH value can name a colour sRGB cannot reach. Measuring the
    // unclamped value would report a contrast nobody can see.
    const vivid = parseOklch('oklch(0.6 0.4 25)');
    expect(vivid).not.toBeNull();
    if (!vivid) return;
    for (const channel of oklchToSrgb(vivid)) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });
});
