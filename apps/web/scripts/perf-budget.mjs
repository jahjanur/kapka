import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { exit } from 'node:process';

/**
 * The §11 budget, checked against what a browser actually downloads.
 *
 * vite.config.ts has stated "initial JS under 150KB gzipped" since it was
 * written and nothing measured it. The bundle test cannot: it builds in
 * memory, which hands back chunk code from before esbuild minifies it, so
 * every number there is roughly twice what ships.
 *
 * This reads dist/ after a real build, gzipped, because that is what crosses
 * the wire and it is the unit the budget was written in.
 */

const DIST = new URL('../dist/', import.meta.url).pathname;

/** §11. Gzipped bytes that stand between a reader and the feed. */
const BUDGETS = {
  initialJs: 150 * 1024,
  /* CSS blocks rendering, so it belongs in the same conversation. Set
     generously against today's number: a tripwire, not a target. */
  initialCss: 40 * 1024,
};

const gz = (path) => gzipSync(readFileSync(path)).length;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/**
 * What index.html pulls in before anything renders: the entry module and
 * anything it preloads, plus the stylesheets it links.
 *
 * Lazy route chunks are deliberately not counted. They are the point of the
 * splitting, and counting them would make the budget punish it.
 */
function initialAssets() {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const referenced = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)].map(
    (m) => m[1],
  );
  return {
    js: referenced.filter((name) => name.endsWith('.js')),
    css: referenced.filter((name) => name.endsWith('.css')),
  };
}

const { js, css } = initialAssets();
if (js.length === 0) {
  console.error('No entry script in dist/index.html — run the build first.');
  exit(1);
}

const rows = [
  [
    'initial JS',
    js.reduce((t, n) => t + gz(join(DIST, 'assets', n)), 0),
    BUDGETS.initialJs,
    js,
  ],
  [
    'initial CSS',
    css.reduce((t, n) => t + gz(join(DIST, 'assets', n)), 0),
    BUDGETS.initialCss,
    css,
  ],
];

let failed = false;
console.log('Performance budget (§11), gzipped:\n');
for (const [label, bytes, budget, files] of rows) {
  const over = bytes > budget;
  failed ||= over;
  console.log(
    `  ${over ? 'FAIL' : 'ok  '} ${label.padEnd(12)} ${kb(bytes).padStart(9)} of ${kb(budget)}  (${String(Math.round((bytes / budget) * 100))}%)`,
  );
  for (const file of files) console.log(`         ${file}`);
}

/* The largest chunks that are NOT loaded up front, for context. A route
   growing is not a failure, but it should be possible to see it happen. */
const lazy = readdirSync(join(DIST, 'assets'))
  .filter((name) => name.endsWith('.js') && !js.includes(name))
  .map((name) => [name, gz(join(DIST, 'assets', name))])
  .sort((a, b) => b[1] - a[1])
  .slice(0, 3);
console.log('\n  largest lazy chunks (not counted):');
for (const [name, bytes] of lazy)
  console.log(`         ${kb(bytes).padStart(9)}  ${name}`);

if (failed) {
  console.error('\nOver budget. §11 exists because the reader is on a five-year-old');
  console.error('Android on 3G in a hospital corridor.');
  exit(1);
}
