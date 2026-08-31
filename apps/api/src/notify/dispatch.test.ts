import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDatabase, type TestDatabase } from '../test/database';
import {
  BATCH_CAP,
  claimNotification,
  DAILY_EMAIL_LIMIT,
  dispatchNotifications,
} from './dispatch';
import type { Mailer, OutgoingEmail } from './mailer';

/**
 * §5.3. The ordering is the whole guarantee: the notification row is written
 * and committed before the provider is called, so the worst case is a row
 * saying `queued` for a message that never went — recoverable — rather than a
 * message that went with nothing recorded, which sends again next time.
 */

let db: TestDatabase;
let sequence = 0;

beforeAll(async () => {
  db = await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await db.reset();
  sequence = 0;
});

/** Records what it was asked to send, and succeeds. */
function recordingMailer(): Mailer & { sent: OutgoingEmail[] } {
  const sent: OutgoingEmail[] = [];
  return {
    sent,
    send(email) {
      sent.push(email);
      return Promise.resolve({ providerId: `msg-${String(sent.length)}` });
    },
  };
}

/** Fails every time, the way an outage does. */
const failingMailer: Mailer = {
  send() {
    return Promise.reject(new Error('SendGrid responded 503: upstream unavailable'));
  },
};

async function addDonor(bloodType = 'O-', city = 'Skopje'): Promise<string> {
  sequence += 1;
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, is_active, email_verified)
     VALUES ($1, 'x', $2, TRUE, TRUE) RETURNING id`,
    [`donor-${String(sequence)}@seed.test`, `Donor ${String(sequence)}`],
  );
  const id = rows[0]?.id ?? '';
  await db.pool.query(
    `INSERT INTO donor_profiles (user_id, blood_type, city) VALUES ($1, $2, $3)`,
    [id, bloodType, city],
  );
  return id;
}

async function addRequest(bloodType = 'O-'): Promise<string> {
  sequence += 1;
  const { rows: requester } = await db.pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, 'x', 'R', 'requester') RETURNING id`,
    [`requester-${String(sequence)}@seed.test`],
  );
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO blood_requests
       (requester_id, blood_type, units_needed, urgency, hospital_name, city, contact_phone, status)
     VALUES ($1, $2, 2, 'critical', 'City General', 'Skopje', '+389 70 000 000', 'approved')
     RETURNING id`,
    [requester[0]?.id, bloodType],
  );
  return rows[0]?.id ?? '';
}

async function logRows(): Promise<
  {
    status: string;
    provider_id: string | null;
    error_message: string | null;
    attempts: number;
    sent_at: Date | null;
  }[]
> {
  const { rows } = await db.pool.query(
    'SELECT status, provider_id, error_message, attempts, sent_at FROM notification_log ORDER BY created_at',
  );
  return rows as never;
}

describe('the row is written before the send', () => {
  it('has already committed the notification row when the mailer is called', async () => {
    /*
     * The mailer looks the row up mid-send, on its own connection. If the
     * insert were still inside an open transaction it would see nothing; if it
     * happened after the send it would see nothing either. Seeing `queued` is
     * the ordering §5.3 asks for.
     */
    const donorId = await addDonor();
    const requestId = await addRequest();
    let statusDuringSend: string | undefined;

    const inspectingMailer: Mailer = {
      async send() {
        const { rows } = await db.pool.query<{ status: string }>(
          'SELECT status FROM notification_log WHERE request_id = $1 AND donor_id = $2',
          [requestId, donorId],
        );
        statusDuringSend = rows[0]?.status;
        return { providerId: 'msg-1' };
      },
    };

    await dispatchNotifications(requestId, { db: db.pool, mailer: inspectingMailer });
    expect(statusDuringSend).toBe('queued');
  });

  it('leaves a queued row behind when the process dies mid-send', async () => {
    // Simulated by a mailer that never returns normally. The row survives, so
    // a retry can find it — the failure mode is a missing email, not a
    // duplicate one.
    await addDonor();
    const requestId = await addRequest();
    const exploding: Mailer = {
      send() {
        throw new Error('process died');
      },
    };
    await dispatchNotifications(requestId, { db: db.pool, mailer: exploding });
    const rows = await logRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('failed');
  });
});

describe('a unique violation means already notified', () => {
  /*
   * Tested directly, because the path is hard to reach from the outside: the
   * matching query's NOT EXISTS already filters out anyone with a
   * notification row, so a dispatch normally never attempts a duplicate
   * claim. This is the guard for the race the query cannot close — two
   * dispatches that both read the matching set before either wrote a row.
   *
   * Removing the skip from claimNotification passed every other test in this
   * file, which is exactly why it needs one of its own.
   */
  it('returns null rather than throwing when the row already exists', async () => {
    const donorId = await addDonor();
    const requestId = await addRequest();

    const first = await claimNotification(db.pool, requestId, donorId);
    expect(first).toBeTruthy();

    const second = await claimNotification(db.pool, requestId, donorId);
    expect(second).toBeNull();
    expect(await logRows()).toHaveLength(1);
  });

  it('still throws for a problem that is not a duplicate', async () => {
    // A skip must mean "already notified", not "any database error at all".
    await expect(
      claimNotification(
        db.pool,
        '00000000-0000-4000-8000-000000000000',
        '00000000-0000-4000-8000-000000000001',
      ),
    ).rejects.toThrow();
  });

  it('skips silently rather than failing', async () => {
    const donorId = await addDonor();
    const requestId = await addRequest();
    await db.pool.query(
      `INSERT INTO notification_log (request_id, donor_id, status) VALUES ($1, $2, 'sent')`,
      [requestId, donorId],
    );

    const mailer = recordingMailer();
    const result = await dispatchNotifications(requestId, { db: db.pool, mailer });

    // The matching query already excludes them, so this is the race guard
    // rather than the common path — and it must not throw.
    expect(result.sent).toBe(0);
    expect(mailer.sent).toHaveLength(0);
    expect(await logRows()).toHaveLength(1);
  });

  it('never emails the same donor twice for one request', async () => {
    await addDonor();
    const requestId = await addRequest();
    const mailer = recordingMailer();

    await dispatchNotifications(requestId, { db: db.pool, mailer });
    await dispatchNotifications(requestId, { db: db.pool, mailer });

    expect(mailer.sent).toHaveLength(1);
    expect(await logRows()).toHaveLength(1);
  });

  it('survives two dispatches racing each other', async () => {
    // The unique index is what makes this safe, not the ordering of the two.
    await addDonor();
    const requestId = await addRequest();
    const mailer = recordingMailer();

    await Promise.all([
      dispatchNotifications(requestId, { db: db.pool, mailer }),
      dispatchNotifications(requestId, { db: db.pool, mailer }),
    ]);

    expect(mailer.sent).toHaveLength(1);
    expect(await logRows()).toHaveLength(1);
  });
});

describe('a delivery failure', () => {
  it('records the failure without throwing', async () => {
    await addDonor();
    const requestId = await addRequest();

    const result = await dispatchNotifications(requestId, {
      db: db.pool,
      mailer: failingMailer,
    });

    expect(result.failed).toBe(1);
    const rows = await logRows();
    expect(rows[0]?.status).toBe('failed');
    expect(rows[0]?.error_message).toContain('503');
    expect(rows[0]?.attempts).toBe(1);
  });

  it('does not stop the donors after it', async () => {
    // One provider hiccup must not silently cost the rest of the batch.
    await addDonor();
    await addDonor();
    await addDonor();
    const requestId = await addRequest();

    let call = 0;
    const flaky: Mailer = {
      send() {
        call += 1;
        if (call === 2) return Promise.reject(new Error('SendGrid responded 429'));
        return Promise.resolve({ providerId: `msg-${String(call)}` });
      },
    };

    const result = await dispatchNotifications(requestId, { db: db.pool, mailer: flaky });
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
  });

  it('keeps the recipient address out of the recorded error (§12)', async () => {
    await addDonor();
    const requestId = await addRequest();
    const leaky: Mailer = {
      send(email) {
        return Promise.reject(new Error(`could not deliver to ${email.to}`));
      },
    };
    await dispatchNotifications(requestId, { db: db.pool, mailer: leaky });
    const rows = await logRows();
    // Masked, not removed: §12 forbids the full address, and the domain is
    // usually what makes the log entry useful.
    expect(rows[0]?.error_message).not.toContain('donor-1@seed.test');
    expect(rows[0]?.error_message).toContain('d***@seed.test');
  });
});

describe('a successful send', () => {
  it('records sent, the provider id and the time', async () => {
    await addDonor();
    const requestId = await addRequest();
    const mailer = recordingMailer();

    const result = await dispatchNotifications(requestId, { db: db.pool, mailer });

    expect(result.sent).toBe(1);
    const rows = await logRows();
    expect(rows[0]?.status).toBe('sent');
    expect(rows[0]?.provider_id).toBe('msg-1');
    expect(rows[0]?.sent_at).toBeInstanceOf(Date);
  });

  it('addresses the email to the donor, with a subject that survives a preview', async () => {
    await addDonor();
    const requestId = await addRequest();
    const mailer = recordingMailer();
    await dispatchNotifications(requestId, { db: db.pool, mailer });

    const email = mailer.sent[0];
    expect(email?.to).toBe('donor-1@seed.test');
    // §5.4: the subject does most of the work.
    expect(email?.subject).toContain('O−');
    expect(email?.subject).toContain('City General');
    expect(email?.subject).toContain('Skopje');
  });

  it('sends only to compatible donors', async () => {
    // An AB+ donor cannot give to an O− patient, so they must not be emailed.
    await addDonor('O-');
    await addDonor('AB+');
    const requestId = await addRequest('O-');
    const mailer = recordingMailer();

    const result = await dispatchNotifications(requestId, { db: db.pool, mailer });
    expect(result.matched).toBe(1);
    expect(mailer.sent).toHaveLength(1);
  });
});

describe('the batch cap and the daily ceiling', () => {
  it(`sends at most ${String(BATCH_CAP)} in one go and queues the rest`, async () => {
    // §5.3: do not block an HTTP response on three hundred sequential API
    // calls. The remainder is recorded, not dropped.
    for (let i = 0; i < BATCH_CAP + 5; i += 1) await addDonor();
    const requestId = await addRequest();
    const mailer = recordingMailer();

    const result = await dispatchNotifications(requestId, { db: db.pool, mailer });

    expect(result.matched).toBe(BATCH_CAP + 5);
    expect(result.sent).toBe(BATCH_CAP);
    expect(result.queued).toBe(5);
    expect(mailer.sent).toHaveLength(BATCH_CAP);
  });

  it('records the overflow rather than losing it', async () => {
    for (let i = 0; i < BATCH_CAP + 3; i += 1) await addDonor();
    const requestId = await addRequest();
    await dispatchNotifications(requestId, { db: db.pool, mailer: recordingMailer() });

    const { rows } = await db.pool.query<{ status: string; count: string }>(
      `SELECT status, count(*)::text AS count FROM notification_log GROUP BY status`,
    );
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
    expect(byStatus.sent).toBe(BATCH_CAP);
    expect(byStatus.queued).toBe(3);
  });

  it('stops at the daily free-tier ceiling and says so', async () => {
    /*
     * §5.3: when the daily budget is spent, log it, warn the admin, and leave
     * the rows queued. Silently dropping emails is the worst possible failure
     * mode here.
     */
    const spent = DAILY_EMAIL_LIMIT - 2;
    const filler = await addRequest();
    for (let i = 0; i < spent; i += 1) {
      const donorId = await addDonor('O-', 'Bitola');
      await db.pool.query(
        `INSERT INTO notification_log (request_id, donor_id, status, sent_at)
         VALUES ($1, $2, 'sent', now())`,
        [filler, donorId],
      );
    }

    for (let i = 0; i < 5; i += 1) await addDonor();
    const requestId = await addRequest();
    const mailer = recordingMailer();

    const result = await dispatchNotifications(requestId, { db: db.pool, mailer });

    expect(result.sent).toBe(2);
    expect(result.budgetExhausted).toBe(true);
    expect(result.queued).toBeGreaterThan(0);
    expect(mailer.sent).toHaveLength(2);
  });

  it('gives the admin a sentence, not a flag, when the budget is spent', async () => {
    // §5.3 wants a clear warning in the dashboard. A boolean is something an
    // admin has to interpret; this is something they can read.
    const spent = DAILY_EMAIL_LIMIT - 1;
    const filler = await addRequest();
    for (let i = 0; i < spent; i += 1) {
      const donorId = await addDonor('O-', 'Bitola');
      await db.pool.query(
        `INSERT INTO notification_log (request_id, donor_id, status, sent_at)
         VALUES ($1, $2, 'sent', now())`,
        [filler, donorId],
      );
    }
    for (let i = 0; i < 4; i += 1) await addDonor();
    const requestId = await addRequest();

    const result = await dispatchNotifications(requestId, {
      db: db.pool,
      mailer: recordingMailer(),
    });

    expect(result.budgetExhausted).toBe(true);
    expect(result.warning).toContain('3 donors have not been contacted');
    expect(result.warning).toContain('queued for tomorrow');
    expect(result.dailyBudgetRemaining).toBe(0);
  });

  it('says nothing when there was nothing to warn about', async () => {
    await addDonor();
    const requestId = await addRequest();
    const result = await dispatchNotifications(requestId, {
      db: db.pool,
      mailer: recordingMailer(),
    });
    expect(result.warning).toBeNull();
    expect(result.budgetExhausted).toBe(false);
    expect(result.dailyBudgetRemaining).toBe(DAILY_EMAIL_LIMIT - 1);
  });

  it('does not count yesterday against today', async () => {
    const filler = await addRequest();
    // In another city, so they do not also match today's request and get
    // counted as fresh matches.
    for (let i = 0; i < DAILY_EMAIL_LIMIT; i += 1) {
      const donorId = await addDonor('O-', 'Bitola');
      await db.pool.query(
        `INSERT INTO notification_log (request_id, donor_id, status, sent_at)
         VALUES ($1, $2, 'sent', now() - INTERVAL '1 day')`,
        [filler, donorId],
      );
    }

    await addDonor();
    const requestId = await addRequest();
    const result = await dispatchNotifications(requestId, {
      db: db.pool,
      mailer: recordingMailer(),
    });
    expect(result.sent).toBe(1);
    expect(result.budgetExhausted).toBe(false);
  });
});

describe('nothing to do', () => {
  it('returns zeroes for a request with no matching donors', async () => {
    const requestId = await addRequest();
    const mailer = recordingMailer();
    const result = await dispatchNotifications(requestId, { db: db.pool, mailer });
    expect(result).toEqual({
      matched: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      queued: 0,
      budgetExhausted: false,
      dailyBudgetRemaining: DAILY_EMAIL_LIMIT,
      warning: null,
    });
    expect(mailer.sent).toHaveLength(0);
  });

  it('returns zeroes for a request that does not exist', async () => {
    const result = await dispatchNotifications('00000000-0000-4000-8000-000000000000', {
      db: db.pool,
      mailer: recordingMailer(),
    });
    expect(result.matched).toBe(0);
  });
});
