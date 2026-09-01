import type { BloodType } from '@kapka/shared';
import { pool, type Queryable } from '../db';

export interface MatchedDonor {
  id: string;
  email: string;
  fullName: string;
  bloodType: BloodType;
}

/**
 * The matching query (§5.1). Run when an admin approves a request.
 *
 * READ THE JOIN DIRECTION. `bc.recipient_type = r.blood_type` — the request's
 * blood type is what the PATIENT NEEDS, and it matches the recipient side of
 * the matrix. `dp.blood_type = bc.donor_type` — the donor's type matches the
 * donor side. Swapping those two produces a system that runs, returns donors,
 * and is medically wrong: it would email O− donors for an AB+ patient and tell
 * an O− patient that AB+ donors can help.
 *
 * Three things at once, all of them exclusions rather than rankings:
 *   compatibility  the matrix, as data (§3)
 *   city           exact string, which is why city is a controlled list
 *   eligibility    56 days per WHO, computed in SQL against CURRENT_DATE
 *                  rather than in JavaScript, where the server's timezone
 *                  decides who is eligible (§5.2)
 *
 * The NOT EXISTS is the second half of the duplicate guarantee: the unique
 * index on notification_log stops a double insert, and this stops us building
 * a batch that was always going to collide.
 */
const MATCHING_QUERY = `
  SELECT u.id, u.email, u.full_name, dp.blood_type
  FROM   blood_requests r
  JOIN   blood_compatibility bc ON bc.recipient_type = r.blood_type
  JOIN   donor_profiles dp      ON dp.blood_type = bc.donor_type
                               AND dp.city = r.city
  JOIN   users u                ON u.id = dp.user_id
  WHERE  r.id = $1
    AND  u.is_active
    AND  u.email_verified
    AND  dp.is_available
    AND  dp.notify_by_email
    AND  (dp.last_donation_date IS NULL
          OR dp.last_donation_date <= CURRENT_DATE - INTERVAL '56 days')
    AND  NOT EXISTS (
           SELECT 1 FROM notification_log nl
           WHERE nl.request_id = r.id AND nl.donor_id = u.id
         )
  ORDER BY dp.last_donation_date NULLS FIRST, u.id
`;

/**
 * Every donor who should hear about this request.
 *
 * Ordered by how long since they last gave, never-donated first, so that
 * capping the batch at the free-tier ceiling (§5.3) takes the donors most
 * likely to be able to come rather than an arbitrary slice.
 */
export async function findMatchingDonors(
  requestId: string,
  db: Queryable = pool,
): Promise<MatchedDonor[]> {
  const { rows } = await db.query<{
    id: string;
    email: string;
    full_name: string;
    blood_type: BloodType;
  }>(MATCHING_QUERY, [requestId]);

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    bloodType: row.blood_type,
  }));
}

/** Exported so a test can assert the query itself, not only its results. */
export const MATCHING_SQL = MATCHING_QUERY;

/**
 * How many donors a request would reach, without building the list.
 *
 * Wraps the matching query rather than restating its joins. A second copy of
 * those five conditions would be a second answer to "who gets emailed", free
 * to drift from the one that actually sends — which is the whole reason the
 * compatibility matrix is a table and not code (§3).
 */
const MATCHING_COUNT_QUERY = `SELECT count(*)::int AS count FROM (${MATCHING_QUERY}) matched`;

export async function countMatchingDonors(
  requestId: string,
  db: Queryable = pool,
): Promise<number> {
  const { rows } = await db.query<{ count: number }>(MATCHING_COUNT_QUERY, [requestId]);
  return rows[0]?.count ?? 0;
}
