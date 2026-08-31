/**
 * "3 hours ago", natively. §11 rules out moment.js and date-fns for this —
 * Intl.RelativeTimeFormat is built in and costs zero bytes.
 */
const UNITS = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['week', 604_800_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
] as const;

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function timeAgo(iso: string, now: number = Date.now()): string {
  const delta = new Date(iso).getTime() - now;   // negative in the past
  for (const [unit, ms] of UNITS) {
    if (Math.abs(delta) >= ms) return formatter.format(Math.round(delta / ms), unit);
  }
  return formatter.format(Math.round(delta / 1000), 'second');
}

/** Machine-readable form for the <time datetime> attribute. */
export function isoDate(iso: string): string {
  return new Date(iso).toISOString();
}
