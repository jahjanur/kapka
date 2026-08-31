import type pg from 'pg';
import { pool, withTransaction } from '../db';
import { findMatchingDonors, type MatchedDonor } from '../matching/repository';

export type ModerationOutcome =
  | { kind: 'not-found' }
  /** Someone already approved or rejected it. */
  | { kind: 'already-moderated'; status: string }
  | { kind: 'approved'; matchedDonors: MatchedDonor[] }
  | { kind: 'rejected' };

export interface AdminRepository {
  approve(requestId: string, adminId: string): Promise<ModerationOutcome>;
  reject(requestId: string, adminId: string, reason: string): Promise<ModerationOutcome>;
}

/** Written for every admin action (§4). */
async function writeAudit(
  client: pg.PoolClient,
  actorId: string,
  action: string,
  entityId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  // Counts and reasons only. §12 forbids logging full email addresses, and an
  // audit row is exactly the sort of place a list of donor emails would end up
  // if nobody thought about it.
  await client.query(
    `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, 'blood_request', $3, $4)`,
    [actorId, action, entityId, JSON.stringify(metadata)],
  );
}

/**
 * Moves a request out of `pending`, in one transaction with its audit row.
 *
 * The status change is the lock. `WHERE status = 'pending'` means two admins
 * clicking approve at the same moment produce one winner and one
 * already-moderated — rather than two approvals, two audit rows, and later two
 * rounds of emails to the same donors.
 */
async function moderate(
  db: pg.Pool,
  requestId: string,
  adminId: string,
  next: 'approved' | 'rejected',
  reason: string | null,
): Promise<ModerationOutcome> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `UPDATE blood_requests
       SET status = $2, moderated_by = $3, moderated_at = now(), reject_reason = $4
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [requestId, next, adminId, reason],
    );

    if (!rows[0]) {
      // Nothing moved. Either it does not exist, or it was moderated already —
      // and those need different answers.
      const { rows: existing } = await client.query<{ status: string }>(
        'SELECT status FROM blood_requests WHERE id = $1',
        [requestId],
      );
      const status = existing[0]?.status;
      return status
        ? { kind: 'already-moderated' as const, status }
        : { kind: 'not-found' as const };
    }

    if (next === 'rejected') {
      await writeAudit(client, adminId, 'request.reject', requestId, { reason });
      return { kind: 'rejected' as const };
    }

    /*
     * Who this will reach, computed inside the transaction so the number in
     * the audit row is the number the query actually returned — not one taken
     * a moment later against a table that has since changed.
     *
     * §9.6 wants this count in front of the admin before they confirm, because
     * an irreversible mass action needs a visible number.
     */
    const matchedDonors = await findMatchingDonors(requestId, client);
    await writeAudit(client, adminId, 'request.approve', requestId, {
      matchedDonors: matchedDonors.length,
    });
    return { kind: 'approved' as const, matchedDonors };
  }, db);
}

export function createPgAdminRepository(db: pg.Pool = pool): AdminRepository {
  return {
    approve: (requestId, adminId) => moderate(db, requestId, adminId, 'approved', null),
    reject: (requestId, adminId, reason) =>
      moderate(db, requestId, adminId, 'rejected', reason),
  };
}
