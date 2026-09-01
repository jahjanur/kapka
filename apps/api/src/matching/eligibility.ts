import { DONATION_INTERVAL_DAYS } from '@kapka/shared';

/**
 * When a donor becomes eligible again, as SQL.
 *
 * A fragment rather than three hand-written CASE expressions. Two places need
 * this date — the donor's own dashboard and the compatibility banner — and a
 * third asks the same question as a comparison inside the matching query. The
 * answer has to be the same in all of them, and 56 is a clinical number, not
 * a formatting choice.
 *
 * Evaluated in SQL against CURRENT_DATE, never in JavaScript, for the reason
 * §5.2 gives: otherwise the server's timezone decides who is eligible.
 *
 * to_char, not a bare date: node-pg parses a DATE column into a Date at LOCAL
 * midnight, so calling toISOString() on it yields the previous day everywhere
 * east of UTC. Postgres formats the day and nothing reinterprets it.
 *
 * The interval is interpolated from a constant in our own source, never from
 * anything a caller supplies.
 */
export function eligibleFromSql(lastDonationColumn: string): string {
  return `CASE
            WHEN ${lastDonationColumn} IS NULL
              OR ${lastDonationColumn} <= CURRENT_DATE - INTERVAL '${String(DONATION_INTERVAL_DAYS)} days'
            THEN NULL
            ELSE to_char(
                   (${lastDonationColumn} + INTERVAL '${String(DONATION_INTERVAL_DAYS)} days')::date,
                   'YYYY-MM-DD')
          END`;
}
