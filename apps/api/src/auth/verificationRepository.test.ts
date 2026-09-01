import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDatabase, type TestDatabase } from '../test/database';
import { createPgAuthRepository, type AuthRepository } from './repository';

/**
 * The verification SQL, against a real Postgres.
 *
 * The HTTP tests run against the in-memory fake, which cannot tell you whether
 * `UPDATE users SET email_verified = TRUE` works — and that one statement is
 * the entire feature. Everything §5.1 does to keep an unverified donor out of
 * the notification pool depends on this column, so it gets a real database.
 */

let db: TestDatabase;
let repository: AuthRepository;
let people = 0;

beforeAll(async () => {
  db = await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await db.reset();
  people = 0;
  repository = createPgAuthRepository(db.pool);
});

async function newDonor() {
  people += 1;
  return repository.createUser({
    fullName: 'Ana Petrovska',
    email: `donor-${String(people)}@example.test`,
    passwordHash: 'x',
    phone: null,
    bloodType: 'O-',
    city: 'Skopje',
    lastDonationDate: null,
  });
}

const hour = (n: number) => new Date(Date.now() + n * 60 * 60 * 1000);

describe('issuing a confirmation link', () => {
  it('stores it and finds it again by hash', async () => {
    const user = await newDonor();
    const id = await repository.createVerificationToken(user.id, 'hash-1', hour(24));

    const found = await repository.findVerificationToken('hash-1');
    expect(found?.id).toBe(id);
    expect(found?.userId).toBe(user.id);
    expect(found?.consumedAt).toBeNull();
    expect(found?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('finds nothing for a hash nobody issued', async () => {
    expect(await repository.findVerificationToken('never-issued')).toBeNull();
  });

  it('reports when the newest one went out, for the resend cooldown', async () => {
    const user = await newDonor();
    expect(await repository.lastVerificationSentAt(user.id)).toBeNull();

    await repository.createVerificationToken(user.id, 'hash-1', hour(24));
    const first = await repository.lastVerificationSentAt(user.id);
    expect(first).not.toBeNull();

    await repository.createVerificationToken(user.id, 'hash-2', hour(24));
    const second = await repository.lastVerificationSentAt(user.id);
    expect(second?.getTime()).toBeGreaterThanOrEqual(first?.getTime() ?? 0);
  });

  it('goes away with the donor who owns it (§12: deletion is real)', async () => {
    const user = await newDonor();
    await repository.createVerificationToken(user.id, 'hash-1', hour(24));

    await db.pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    expect(await repository.findVerificationToken('hash-1')).toBeNull();
  });
});

describe('spending one', () => {
  it('verifies the account — the flag the matching query reads', async () => {
    const user = await newDonor();
    expect(user.emailVerified).toBe(false);
    const id = await repository.createVerificationToken(user.id, 'hash-1', hour(24));

    const verified = await repository.consumeVerificationToken(id, user.id);
    expect(verified?.emailVerified).toBe(true);

    // Read back rather than trusting the RETURNING clause.
    const { rows } = await db.pool.query<{ email_verified: boolean }>(
      'SELECT email_verified FROM users WHERE id = $1',
      [user.id],
    );
    expect(rows[0]?.email_verified).toBe(true);
  });

  it('refuses to spend the same one twice', async () => {
    // Two taps arriving together race here, and exactly one may win.
    const user = await newDonor();
    const id = await repository.createVerificationToken(user.id, 'hash-1', hour(24));

    expect(await repository.consumeVerificationToken(id, user.id)).not.toBeNull();
    expect(await repository.consumeVerificationToken(id, user.id)).toBeNull();
  });

  it('spends every other outstanding link for that donor too', async () => {
    /* A donor who asked three times has one mailbox. Leaving the older links
       live is two more bearer credentials for no benefit. */
    const user = await newDonor();
    const first = await repository.createVerificationToken(user.id, 'hash-1', hour(24));
    await repository.createVerificationToken(user.id, 'hash-2', hour(24));
    await repository.createVerificationToken(user.id, 'hash-3', hour(24));

    await repository.consumeVerificationToken(first, user.id);

    for (const hash of ['hash-1', 'hash-2', 'hash-3']) {
      expect((await repository.findVerificationToken(hash))?.consumedAt).not.toBeNull();
    }
  });

  it("leaves another donor's link alone", async () => {
    const ana = await newDonor();
    const bojan = await newDonor();
    const id = await repository.createVerificationToken(ana.id, 'hash-ana', hour(24));
    await repository.createVerificationToken(bojan.id, 'hash-bojan', hour(24));

    await repository.consumeVerificationToken(id, ana.id);

    expect((await repository.findVerificationToken('hash-bojan'))?.consumedAt).toBeNull();
    const { rows } = await db.pool.query<{ email_verified: boolean }>(
      'SELECT email_verified FROM users WHERE id = $1',
      [bojan.id],
    );
    expect(rows[0]?.email_verified).toBe(false);
  });

  it('refuses a second link for the same token hash', async () => {
    // UNIQUE on token_hash: a collision would be a second key to an account.
    const user = await newDonor();
    await repository.createVerificationToken(user.id, 'hash-1', hour(24));
    await expect(
      repository.createVerificationToken(user.id, 'hash-1', hour(24)),
    ).rejects.toThrow();
  });

  it('refuses a row that expires before it was created', async () => {
    const user = await newDonor();
    await expect(
      repository.createVerificationToken(user.id, 'hash-past', hour(-1)),
    ).rejects.toThrow();
  });
});
