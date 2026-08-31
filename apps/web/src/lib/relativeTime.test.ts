import { describe, expect, it } from 'vitest';
import { timeAgo } from './relativeTime';

/** A fixed "now" so these never depend on when the suite runs. */
const NOW = new Date('2026-08-31T12:00:00.000Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('timeAgo', () => {
  it('uses the largest unit that fits', () => {
    expect(timeAgo(ago(30_000), NOW)).toBe('30 seconds ago');
    expect(timeAgo(ago(5 * 60_000), NOW)).toBe('5 minutes ago');
    expect(timeAgo(ago(3 * 3_600_000), NOW)).toBe('3 hours ago');
    expect(timeAgo(ago(2 * 86_400_000), NOW)).toBe('2 days ago');
  });

  it('says "yesterday" rather than "1 day ago"', () => {
    // numeric: 'auto' — reads like a person wrote it.
    expect(timeAgo(ago(86_400_000), NOW)).toBe('yesterday');
  });

  it('handles a request posted seconds ago, which is the common case', () => {
    expect(timeAgo(ago(1_000), NOW)).toBe('1 second ago');
    expect(timeAgo(ago(0), NOW)).toBe('now');
  });

  it('does not crash on a future timestamp from a skewed clock', () => {
    expect(timeAgo(new Date(NOW + 60_000).toISOString(), NOW)).toBe('in 1 minute');
  });
});
