import type pg from 'pg';
import type { BloodType, Urgency } from '@kapka/shared';
import { pool } from '../db';
import { redact } from '../redact';
import { findMatchingDonors, type MatchedDonor } from '../matching/repository';
import { buildEmail, type RequestSummary } from './email';
import type { Mailer } from './mailer';

/**
 * Donors contacted for one request in one go (§5.3).
 *
 * Dispatching synchronously inside the approval request is acceptable at pilot
 * scale, but not for three hundred sequential API calls — so the batch is
 * capped and the remainder is left queued rather than dropped.
 */
export const BATCH_CAP = 50;

/** SendGrid's free tier. A known ceiling to design around, not discover (§2). */
export const DAILY_EMAIL_LIMIT = 100;

/** Postgres unique-violation. Here it means "already notified". */
const UNIQUE_VIOLATION = '23505';

export interface DispatchResult {
  /** Everyone the matching query returned. */
  matched: number;
  sent: number;
  failed: number;
  /** Already had a notification row — a duplicate we did not send twice. */
  skipped: number;
  /** Beyond the batch cap or the daily budget. Logged, not lost. */
  queued: number;
  /** True when the daily ceiling stopped us short. */
  budgetExhausted: boolean;
  /** How many more emails today's free tier allows, after this batch. */
  dailyBudgetRemaining: number;
  /**
   * A sentence for the admin, or null. §5.3 wants a clear warning in the
   * dashboard rather than a flag they have to interpret — the whole point is
   * that people should not have to notice a silent shortfall.
   */
  warning: string | null;
}

export interface DispatchDeps {
  db?: pg.Pool;
  mailer: Mailer;
  /** Where the email's links point. */
  baseUrl?: string;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}

/** How many more we may send today before the free tier is spent. */
async function remainingDailyBudget(db: pg.Pool): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM notification_log
     WHERE status = 'sent' AND sent_at >= CURRENT_DATE`,
  );
  return Math.max(0, DAILY_EMAIL_LIMIT - Number(rows[0]?.count ?? '0'));
}

async function loadRequest(
  db: pg.Pool,
  requestId: string,
): Promise<RequestSummary | null> {
  const { rows } = await db.query<{
    id: string;
    blood_type: BloodType;
    units_needed: number;
    urgency: Urgency;
    hospital_name: string;
    city: string;
  }>(
    `SELECT id, blood_type, units_needed, urgency, hospital_name, city
     FROM blood_requests WHERE id = $1`,
    [requestId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    bloodType: row.blood_type,
    unitsNeeded: row.units_needed,
    urgency: row.urgency,
    hospitalName: row.hospital_name,
    city: row.city,
  };
}

/**
 * Claims a donor by writing their notification row, and says whether we got
 * them.
 *
 * The row is written AND COMMITTED before the email is sent. That ordering is
 * the whole guarantee: the worst case becomes a row that says `queued` for a
 * message that never went — which a retry can fix — rather than a message that
 * went with nothing recorded, which sends again on the next approval.
 *
 * Holding the transaction open across the network call would reintroduce
 * exactly that: a crash mid-send rolls the row back and the donor is emailed
 * twice.
 */
export async function claimNotification(
  db: pg.Pool,
  requestId: string,
  donorId: string,
): Promise<string | null> {
  try {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO notification_log (request_id, donor_id, status)
       VALUES ($1, $2, 'queued') RETURNING id`,
      [requestId, donorId],
    );
    return rows[0]?.id ?? null;
  } catch (error) {
    // UNIQUE (request_id, donor_id) did its job: somebody already has this
    // one. Skip silently — it is the guarantee working, not a failure (§5.3).
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

/**
 * Emails every eligible donor about an approved request.
 *
 * Never throws for a delivery problem. A provider outage must not roll back an
 * approval or take down the request that triggered it (§5.3) — failures are
 * recorded against their own rows and reported in the result.
 */
export async function dispatchNotifications(
  requestId: string,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  const db = deps.db ?? pool;
  const baseUrl = deps.baseUrl ?? 'https://kapka.mk';

  const request = await loadRequest(db, requestId);
  const result: DispatchResult = {
    matched: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    queued: 0,
    budgetExhausted: false,
    dailyBudgetRemaining: DAILY_EMAIL_LIMIT,
    warning: null,
  };
  if (!request) return result;

  const donors = await findMatchingDonors(requestId, db);
  result.matched = donors.length;
  if (donors.length === 0) return result;

  const budget = await remainingDailyBudget(db);
  const capacity = Math.min(BATCH_CAP, budget);
  result.budgetExhausted = budget < Math.min(BATCH_CAP, donors.length);

  // Matching returns donors ordered by how long since they last gave, never
  // donated first, so a cap takes the people most likely to be able to come
  // rather than an arbitrary slice.
  const toSend = donors.slice(0, capacity);
  const overflow = donors.slice(capacity);

  for (const donor of overflow) {
    // Recorded as queued, not dropped. Silently dropping emails is the worst
    // possible failure mode here (§5.3).
    if (await claimNotification(db, requestId, donor.id)) result.queued += 1;
    else result.skipped += 1;
  }

  for (const donor of toSend) {
    const notificationId = await claimNotification(db, requestId, donor.id);
    if (!notificationId) {
      result.skipped += 1;
      continue;
    }
    await deliver(db, notificationId, request, donor, baseUrl, deps.mailer, result);
  }

  // What is left after this batch — counted from what was actually sent, not
  // from what we were allowed to send. Those differ whenever the batch was
  // smaller than the cap, which is most of the time.
  result.dailyBudgetRemaining = Math.max(0, budget - result.sent);

  if (result.budgetExhausted) {
    result.warning =
      `Today's email budget is spent: ${String(DAILY_EMAIL_LIMIT)} of ${String(DAILY_EMAIL_LIMIT)} sent. ` +
      `${String(result.queued)} ${result.queued === 1 ? 'donor has' : 'donors have'} not been ` +
      `contacted about this request and ${result.queued === 1 ? 'is' : 'are'} queued for tomorrow. ` +
      `Reach them another way if this cannot wait.`;
    // Logged as well as returned: an admin closing the tab is not a reason
    // for a shortfall to go unrecorded (§5.3).
    console.warn(
      `[notify] daily email budget exhausted; ${String(result.queued)} queued`,
    );
  }

  return result;
}

async function deliver(
  db: pg.Pool,
  notificationId: string,
  request: RequestSummary,
  donor: MatchedDonor,
  baseUrl: string,
  mailer: Mailer,
  result: DispatchResult,
): Promise<void> {
  const email = buildEmail(request, donor.fullName, {
    request: `${baseUrl}/requests/${request.id}`,
    pauseNotifications: `${baseUrl}/me/notifications`,
  });

  try {
    const { providerId } = await mailer.send({ ...email, to: donor.email });
    await db.query(
      `UPDATE notification_log
       SET status = 'sent', provider_id = $2, sent_at = now(), attempts = attempts + 1
       WHERE id = $1`,
      [notificationId, providerId],
    );
    result.sent += 1;
  } catch (error) {
    /*
     * One donor's delivery failing is not the batch failing, and it is
     * certainly not the approval failing. Record it and carry on; the row
     * stays for a retry.
     *
     * Redacted: a provider error can quote the recipient address, and §12
     * forbids logging full email addresses.
     */
    await db.query(
      `UPDATE notification_log
       SET status = 'failed', error_message = $2, attempts = attempts + 1
       WHERE id = $1`,
      [notificationId, redact(error).slice(0, 500)],
    );
    result.failed += 1;
  }
}
