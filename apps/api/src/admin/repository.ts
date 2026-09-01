import type pg from 'pg';
import type { ModerationQueueItem, Urgency, BloodType } from '@kapka/shared';
import { pool, withTransaction } from '../db';
import {
  countMatchingDonors,
  findMatchingDonors,
  type MatchedDonor,
} from '../matching/repository';

export type ModerationOutcome =
  | { kind: 'not-found' }
  /** Someone already approved or rejected it. */
  | { kind: 'already-moderated'; status: string }
  | { kind: 'approved'; matchedDonors: MatchedDonor[] }
  | { kind: 'rejected' };

/** A queue nobody can work through is not a queue; it is also a slow query. */
export const QUEUE_LIMIT = 50;

export interface AdminRepository {
  /** Everything waiting on a decision, oldest first (§9.6). */
  listPending(): Promise<ModerationQueueItem[]>;
  approve(requestId: string, adminId: string): Promise<ModerationOutcome>;
  reject(requestId: string, adminId: string, reason: string): Promise<ModerationOutcome>;
}

interface PendingRow {
  id: string;
  blood_type: BloodType;
  units_needed: number;
  urgency: Urgency;
  hospital_name: string;
  hospital_lat: string | null;
  hospital_lng: string | null;
  city: string;
  note: string | null;
  contact_phone: string;
  created_at: Date;
  expires_at: Date;
  requester_name: string;
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
    async listPending() {
      /*
       * Oldest first, which is the opposite of the public feed. A queue is
       * worked through, and the request that has been waiting longest is the
       * one somebody is still waiting on an answer for.
       *
       * contact_phone is selected here where it is not for the public feed:
       * an admin deciding whether a request is real is exactly who §4 means
       * by an authenticated viewer, and the route above this is admin-only.
       */
      const { rows } = await db.query<PendingRow>(
        `SELECT r.id, r.blood_type, r.units_needed, r.urgency, r.hospital_name,
                r.hospital_lat, r.hospital_lng, r.city, r.note, r.contact_phone,
                r.created_at, r.expires_at, u.full_name AS requester_name
         FROM blood_requests r
         JOIN users u ON u.id = r.requester_id
         WHERE r.status = 'pending'
         ORDER BY r.created_at ASC
         LIMIT ${String(QUEUE_LIMIT)}`,
      );

      /*
       * The reach, one query per row. It is an N+1 and that is the deliberate
       * choice: the alternative is inlining the matching query's five
       * conditions into a lateral join here, which would be a second copy of
       * the rule that decides who gets emailed. The queue is capped at 50 and
       * each count rides the index the matching query was built for; a second
       * copy of a medical rule is the more expensive thing.
       */
      return Promise.all(
        rows.map(async (row) => ({
          id: row.id,
          bloodType: row.blood_type,
          unitsNeeded: row.units_needed,
          urgency: row.urgency,
          hospitalName: row.hospital_name,
          hospitalLat: row.hospital_lat === null ? null : Number(row.hospital_lat),
          hospitalLng: row.hospital_lng === null ? null : Number(row.hospital_lng),
          city: row.city,
          note: row.note,
          status: 'pending' as const,
          createdAt: row.created_at.toISOString(),
          expiresAt: row.expires_at.toISOString(),
          contactPhone: row.contact_phone,
          requesterName: row.requester_name,
          matchedDonors: await countMatchingDonors(row.id, db),
        })),
      );
    },

    approve: (requestId, adminId) => moderate(db, requestId, adminId, 'approved', null),
    reject: (requestId, adminId, reason) =>
      moderate(db, requestId, adminId, 'rejected', reason),
  };
}
