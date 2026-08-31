import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards the self-hosted font setup (§6.4, §11).
 *
 * Every failure mode here is silent: a renamed family, a missing file, a
 * dropped font-display — the page still renders, just in the wrong face or
 * after a blank pause. None of it shows up as an error anywhere.
 */

const tokensSrc = fileURLToPath(new URL('./', import.meta.url));
const fontsDir = fileURLToPath(
  new URL('../../../apps/web/public/fonts/', import.meta.url),
);

const fontsCss = readFileSync(tokensSrc + 'fonts.css', 'utf8');
const scaleCss = readFileSync(tokensSrc + 'scale.css', 'utf8');
const indexHtml = readFileSync(
  fileURLToPath(new URL('../../../apps/web/index.html', import.meta.url)),
  'utf8',
);

const woff2 = readdirSync(fontsDir).filter((f) => f.endsWith('.woff2'));

/** §11 allows two files; these ceilings leave room without inviting drift. */
const BUDGET_BYTES: Record<string, number> = {
  'inter-latin.woff2': 60_000,
  'inter-cyrillic.woff2': 30_000,
};
const TOTAL_BUDGET_BYTES = 80_000;

describe('the font files', () => {
  it('ships two WOFF2 files, which is the maximum §11 allows', () => {
    expect(woff2).toHaveLength(2);
  });

  it.each(woff2)('%s stays within its size budget', (file) => {
    const bytes = statSync(fontsDir + file).size;
    expect(bytes).toBeLessThanOrEqual(BUDGET_BYTES[file] ?? TOTAL_BUDGET_BYTES);
  });

  it('keeps the combined weight small enough for the 3G device profile', () => {
    const total = woff2.reduce((sum, f) => sum + statSync(fontsDir + f).size, 0);
    expect(total).toBeLessThanOrEqual(TOTAL_BUDGET_BYTES);
  });

  it('ships the licence beside the fonts', () => {
    // Inter is SIL OFL. Redistributing the files means redistributing this.
    expect(readdirSync(fontsDir)).toContain('LICENSE.txt');
  });
});

describe('the @font-face declarations', () => {
  const faces = fontsCss.split('@font-face').slice(1);

  it('declares one face per file', () => {
    expect(faces).toHaveLength(woff2.length);
  });

  it.each(faces.map((face, i) => [i, face]))(
    'face %i swaps rather than blocking',
    (_i, face) => {
      // Anything but swap means the text is invisible while the font loads.
      expect(face).toMatch(/font-display:\s*swap/);
    },
  );

  it.each(faces.map((face, i) => [i, face]))(
    'face %i declares a unicode-range',
    (_i, face) => {
      // Without it a browser downloads both subsets on every page, which throws
      // away the reason for splitting them.
      expect(face).toMatch(/unicode-range:/);
    },
  );

  it.each(faces.map((face, i) => [i, face]))(
    'face %i covers the whole weight axis',
    (_i, face) => {
      // One variable file serving 100-900 is what makes a second weight free.
      expect(face).toMatch(/font-weight:\s*100 900/);
    },
  );

  it('points every src at a file that actually exists', () => {
    const referenced = [...fontsCss.matchAll(/url\('\/fonts\/([^']+)'\)/g)].map(
      (m) => m[1] ?? '',
    );
    expect(referenced).toHaveLength(woff2.length);
    for (const file of referenced) expect(woff2).toContain(file);
  });

  it('covers Latin and Cyrillic, because Macedonian is written in Cyrillic', () => {
    expect(fontsCss).toMatch(/U\+0400-045F/);
  });

  it('keeps U+2212 in the Latin range, which the blood type badges need', () => {
    // Every badge renders a real minus sign. If it fell outside the subset it
    // would render from a fallback face, mid-word, at every badge on the page.
    expect(fontsCss).toMatch(/U\+2212/);
  });
});

describe('the family name matches the font stack', () => {
  it('uses the same name in fonts.css and --font-sans', () => {
    // Rename one side only and every page silently falls back to system UI —
    // which looks fine, so nobody notices.
    const declared = /font-family:\s*'([^']+)'/.exec(fontsCss)?.[1];
    expect(declared).toBeTruthy();
    const stack = /--font-sans:\s*([^;]+);/.exec(scaleCss)?.[1] ?? '';
    expect(stack).toContain(`"${declared ?? ''}"`);
    expect(stack.trimStart().startsWith(`"${declared ?? ''}"`)).toBe(true);
  });
});

describe('the preload', () => {
  it('preloads the Latin subset', () => {
    expect(indexHtml).toMatch(/rel="preload"[\s\S]{0,200}inter-latin\.woff2/);
  });

  it('sets crossorigin, or the preload is wasted', () => {
    // Fonts are fetched in CORS mode even same-origin. Without crossorigin the
    // preloaded file is discarded and downloaded a second time — strictly
    // worse than not preloading.
    const preload = /<link\s+rel="preload"[\s\S]*?\/>/.exec(indexHtml)?.[0] ?? '';
    expect(preload).toContain('crossorigin');
    expect(preload).toContain('as="font"');
    expect(preload).toContain('type="font/woff2"');
  });

  it('does not preload Cyrillic, which no page needs yet', () => {
    // It is declared with a unicode-range and fetched on demand. Preloading it
    // would cost 18KB nobody uses until the product is translated.
    expect(indexHtml).not.toMatch(/rel="preload"[\s\S]{0,200}inter-cyrillic/);
  });
});
