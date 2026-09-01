import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';
import type pg from 'pg';
import { pool, withTransaction } from '../db';

export interface ExpiryResult {
  expired: number;
  /** How many had never been moderated. A queue nobody worked through. */
  werePending: number;
}

/**
 * Flips every request whose window has closed to `expired` (§3).
 *
 * The public feed already hides them — it filters on expires_at — so this is
 * not what keeps a stale request off the front page. What it does is make the
 * status column true, and three things follow from that:
 *
 *   the moderation queue empties, because it lists what is still pending and
 *   an expired request no longer is;
 *
 *   nobody can approve one by accident, which would email every matching
 *   donor about a hospital that stopped needing blood a week ago;
 *
 *   the count of what is open is the count of what is open.
 *
 * Rides idx_requests_expiry, a partial index created for this on the first
 * day: a request that is already fulfilled, rejected or expired is never a
 * candidate again, so it is not in the index.
 */
export async function expireStaleRequests(db: pg.Pool = pool): Promise<ExpiryResult> {
  return withTransaction(async (client) => {
    /*
     * Read then write, rather than UPDATE ... RETURNING, because the audit
     * row needs the status the request had before this ran — whether it
     * lapsed unmoderated or expired while live is the useful part, and
     * RETURNING hands back the new value.
     *
     * FOR UPDATE holds the rows for the length of the transaction, so a run
     * that overlaps an admin pressing approve resolves one way or the other
     * rather than both.
     */
    const { rows } = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM blood_requests
       WHERE status IN ('pending', 'approved') AND expires_at <= now()
       ORDER BY expires_at
       FOR UPDATE`,
    );
    if (rows.length === 0) return { expired: 0, werePending: 0 };

    const ids = rows.map((row) => row.id);
    const statuses = rows.map((row) => row.status);

    await client.query(
      `UPDATE blood_requests SET status = 'expired' WHERE id = ANY($1::uuid[])`,
      [ids],
    );

    /* A row per request, with no actor: this is the system, and audit_log's
       actor_id is nullable for exactly that. Without it a request changes
       state with nothing anywhere saying why, and the trail for that request
       — which idx_audit_entity exists to serve — has a hole in it. */
    await client.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, metadata)
       SELECT NULL, 'request.expire', 'blood_request', x.id,
              jsonb_build_object('previousStatus', x.status)
       FROM unnest($1::uuid[], $2::text[]) AS x(id, status)`,
      [ids, statuses],
    );

    return {
      expired: rows.length,
      werePending: statuses.filter((status) => status === 'pending').length,
    };
  }, db);
}

async function main(): Promise<void> {
  const result = await expireStaleRequests();
  console.log(
    `Expired ${String(result.expired)} request${result.expired === 1 ? '' : 's'}` +
      (result.werePending > 0
        ? ` (${String(result.werePending)} never moderated).`
        : '.'),
  );
  await pool.end();
}

/* Only when run as a script, so importing expireStaleRequests for a test does
   not open a pool and close it again underneath the caller. */
if (import.meta.url === pathToFileURL(argv[1] ?? '').href) {
  await main();
}
