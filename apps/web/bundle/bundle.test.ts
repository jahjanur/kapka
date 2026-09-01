// Rollup's types come through Vite, which re-exports them — rollup itself is
// a transitive dependency and not ours to import from directly.
import { build, type Rollup } from 'vite';
import { describe, expect, it } from 'vitest';

/**
 * The initial bundle, held to what three comments in the source already claim
 * about it: "Leaflet and the map screens must never reach the initial bundle"
 * (§11).
 *
 * That has been true since the day it was written and nothing has ever
 * checked it. One `import HospitalMap from '...'` in place of a lazy import
 * would put 148kB of mapping library in front of every donor on 3G, and the
 * build would succeed, the tests would pass, and nobody would find out until
 * somebody measured.
 *
 * Built in memory rather than read off disk: CI runs the build after the
 * tests, so a test reading dist/ would either fail on a clean checkout or
 * quietly skip itself forever.
 */

const ROOT = new URL('..', import.meta.url).pathname;

/** Chunk names that are screens, which is what App.tsx lazily imports. */
const ROUTE_CHUNK =
  /(Feed|RequestDetail|PostRequest|Register|Dashboard|AdminQueue|VerifyEmail|HowItWorks|NotFound)-/;

/** Strings that only appear in Leaflet's own source. */
const LEAFLET_FINGERPRINTS = ['_animateZoom', 'TileLayer', 'LatLngBounds'];

/**
 * Strings that only appear in zod. It is 80kB and every route that validates
 * a form needs it — but the feed does not, and a donor reading a list should
 * not be downloading a validation library to do it.
 */
const ZOD_FINGERPRINTS = ['ZodError', 'invalid_type', 'addIssue'];

async function buildOnce(): Promise<Rollup.OutputChunk[]> {
  const result = (await build({
    root: ROOT,
    logLevel: 'silent',
    build: { write: false },
    // Vite 8 bundles with Rolldown; RollupOutput is its deprecated alias.
  })) as Rollup.RolldownOutput | Rollup.RolldownOutput[];

  /* noUncheckedIndexedAccess: an array build result is one output per config
     in the array, and this app has one config — but the type does not know
     that, and a cast would be worse than saying so. */
  const first = Array.isArray(result) ? result[0] : result;
  if (!first) throw new Error('the build produced no output');
  const output = first.output;
  return output.filter((part): part is Rollup.OutputChunk => part.type === 'chunk');
}

const chunks = await buildOnce();
const entry = chunks.find((chunk) => chunk.isEntry);

describe('the initial bundle', () => {
  it('has an entry chunk to talk about', () => {
    expect(entry).toBeDefined();
  });

  it('contains no Leaflet', () => {
    /* The load-bearing assertion. A donor opening the feed on a phone in a
       corridor should not be waiting on a mapping library to render a list. */
    const found = LEAFLET_FINGERPRINTS.filter((mark) => entry?.code.includes(mark));
    expect(found).toEqual([]);
  });

  it('does not reach Leaflet through a static import either', () => {
    /* A lazy component that statically imports the map would put it in a
       chunk the entry pulls in eagerly — split by the bundler, downloaded
       anyway, and invisible to the check above. */
    const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
    const seen = new Set<string>();
    const walk = (name: string) => {
      if (seen.has(name)) return;
      seen.add(name);
      for (const next of byName.get(name)?.imports ?? []) walk(next);
    };
    if (entry) walk(entry.fileName);

    const eagerWithLeaflet = [...seen].filter((name) =>
      LEAFLET_FINGERPRINTS.some((mark) => byName.get(name)?.code.includes(mark)),
    );
    expect(eagerWithLeaflet).toEqual([]);
  });

  it('is fetched only when a map is actually mounted', () => {
    /*
     * The assertion above is not enough on its own, and I know because I
     * broke it on purpose to check: turning the lazy import in RequestDetail
     * into a plain one kept Leaflet out of the entry — the screen is lazy
     * itself — and every test still passed. What it did instead was inline
     * 148kB into the request-detail chunk, so opening any request would
     * fetch a mapping library whether or not that request has a pin.
     *
     * So: exactly one chunk may carry Leaflet, it must not be a screen, and
     * nothing may reach it by a static import.
     */
    const carriers = chunks.filter((chunk) =>
      LEAFLET_FINGERPRINTS.some((mark) => chunk.code.includes(mark)),
    );
    expect(carriers).toHaveLength(1);

    const carrier = carriers[0];
    expect(carrier?.isEntry).toBe(false);
    expect(carrier?.fileName).not.toMatch(ROUTE_CHUNK);

    const staticReferrers = chunks
      .filter((chunk) => chunk.imports.includes(carrier?.fileName ?? ''))
      .map((chunk) => chunk.fileName);
    expect(staticReferrers).toEqual([]);
  });

  it('carries no validation library either', () => {
    /* zod is 80kB and belongs to the forms. The feed imports CITIES and
       BLOOD_TYPES from the same package — both deliberately zod-free, per
       the note in cities.ts — and this is what keeps that true through the
       barrel that re-exports the schemas beside them. */
    const found = ZOD_FINGERPRINTS.filter((mark) => entry?.code.includes(mark));
    expect(found).toEqual([]);
  });

  /*
   * There is deliberately no byte budget here. An in-memory build hands back
   * chunk code from before esbuild minifies it, so any number would be
   * policing roughly twice what a browser actually downloads — a threshold
   * measuring something nobody ships is worse than no threshold, because it
   * looks like a guarantee. What the entry may contain is the real question,
   * and that is what the assertions above ask.
   */

  it('splits every route out of the entry', () => {
    /* Route-level splitting from the start (§11). If a screen stops being
       lazy it lands in the entry, and the feed pays for the admin queue. */
    const routeChunks = chunks.filter((chunk) =>
      ROUTE_CHUNK.test(chunk.fileName.replace('assets/', '')),
    );
    expect(routeChunks.length).toBeGreaterThanOrEqual(8);
  });
});
