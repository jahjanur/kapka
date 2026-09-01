import type {
  AuthRepository,
  DonorProfileRecord,
  RefreshRecord,
  RegisterInput,
  UserRecord,
  VerificationRecord,
} from './repository';

/**
 * An in-memory AuthRepository for tests.
 *
 * The endpoints are exercised over real HTTP against this, so routing,
 * validation, status codes, error envelopes, cookie flags and token contents
 * are all genuinely tested. What is not tested is the SQL — that needs a
 * Postgres, which is the open item in the README.
 */
export function createFakeAuthRepository(): AuthRepository & {
  users: Map<string, UserRecord>;
  profiles: Map<string, DonorProfileRecord>;
  tokens: Map<string, RefreshRecord & { tokenHash: string; replacedBy: string | null }>;
  verifications: Map<string, VerificationRecord & { tokenHash: string; createdAt: Date }>;
  addUser(
    user: Partial<UserRecord> & Pick<UserRecord, 'email' | 'passwordHash'>,
  ): UserRecord;
} {
  const users = new Map<string, UserRecord>();
  const profiles = new Map<string, DonorProfileRecord>();
  const tokens = new Map<
    string,
    RefreshRecord & { tokenHash: string; replacedBy: string | null }
  >();
  const verifications = new Map<
    string,
    VerificationRecord & { tokenHash: string; createdAt: Date }
  >();
  let sequence = 0;
  const nextId = () => `id-${String(++sequence)}`;

  function addUser(
    partial: Partial<UserRecord> & Pick<UserRecord, 'email' | 'passwordHash'>,
  ): UserRecord {
    const user: UserRecord = {
      id: partial.id ?? nextId(),
      email: partial.email,
      passwordHash: partial.passwordHash,
      role: partial.role ?? 'donor',
      fullName: partial.fullName ?? 'Test Person',
      isActive: partial.isActive ?? true,
      emailVerified: partial.emailVerified ?? false,
    };
    users.set(user.id, user);
    return user;
  }

  return {
    users,
    profiles,
    tokens,
    verifications,
    addUser,

    findDonorProfile(userId) {
      return Promise.resolve(profiles.get(userId) ?? null);
    },

    updateDonorProfile(userId, patch) {
      const current = profiles.get(userId);
      if (!current) return Promise.resolve(null);
      const next: DonorProfileRecord = {
        ...current,
        ...(patch.bloodType === undefined ? {} : { bloodType: patch.bloodType }),
        ...(patch.city === undefined ? {} : { city: patch.city }),
        // Absent keeps it; an explicit null is "I have never donated".
        ...('lastDonationDate' in patch
          ? { lastDonationDate: patch.lastDonationDate ?? null }
          : {}),
        ...(patch.isAvailable === undefined ? {} : { isAvailable: patch.isAvailable }),
        ...(patch.notifyByEmail === undefined
          ? {}
          : { notifyByEmail: patch.notifyByEmail }),
      };
      profiles.set(userId, next);
      return Promise.resolve(next);
    },

    findUserByEmail(email) {
      // users.email is CITEXT in Postgres, so matching is case-insensitive.
      const found = [...users.values()].find(
        (u) => u.email.toLowerCase() === email.toLowerCase(),
      );
      return Promise.resolve(found ?? null);
    },

    findUserById(id) {
      return Promise.resolve(users.get(id) ?? null);
    },

    createUser(input: RegisterInput) {
      const user = addUser({
        email: input.email,
        passwordHash: input.passwordHash,
        fullName: input.fullName,
        role: 'donor',
      });
      profiles.set(user.id, {
        bloodType: input.bloodType,
        city: input.city,
        lastDonationDate: input.lastDonationDate,
        isAvailable: true,
        notifyByEmail: true,
        // The real repository computes this in SQL; nothing in the fake
        // pretends to do date arithmetic.
        eligibleFrom: null,
      });
      return Promise.resolve(user);
    },

    storeRefreshToken(userId, tokenHash, expiresAt) {
      const id = nextId();
      tokens.set(id, {
        id,
        userId,
        tokenHash,
        expiresAt,
        revokedAt: null,
        replacedBy: null,
      });
      return Promise.resolve(id);
    },

    findRefreshToken(tokenHash) {
      const found = [...tokens.values()].find((t) => t.tokenHash === tokenHash);
      return Promise.resolve(found ?? null);
    },

    rotateRefreshToken(oldId, userId, tokenHash, expiresAt) {
      const id = nextId();
      tokens.set(id, {
        id,
        userId,
        tokenHash,
        expiresAt,
        revokedAt: null,
        replacedBy: null,
      });
      const old = tokens.get(oldId);
      if (old && !old.revokedAt) {
        old.revokedAt = new Date();
        old.replacedBy = id;
      }
      return Promise.resolve(id);
    },

    revokeRefreshToken(id) {
      const record = tokens.get(id);
      if (record && !record.revokedAt) record.revokedAt = new Date();
      return Promise.resolve();
    },

    revokeAllForUser(userId) {
      for (const record of tokens.values()) {
        if (record.userId === userId && !record.revokedAt) record.revokedAt = new Date();
      }
      return Promise.resolve();
    },

    createVerificationToken(userId, tokenHash, expiresAt) {
      const id = nextId();
      verifications.set(id, {
        id,
        userId,
        tokenHash,
        expiresAt,
        consumedAt: null,
        createdAt: new Date(),
      });
      return Promise.resolve(id);
    },

    findVerificationToken(tokenHash) {
      const found = [...verifications.values()].find((v) => v.tokenHash === tokenHash);
      return Promise.resolve(found ?? null);
    },

    consumeVerificationToken(id, userId) {
      const record = verifications.get(id);
      // Missing, or already spent: the second of two taps on one link gets
      // nothing back, exactly as the conditional UPDATE does for real.
      if (!record || record.consumedAt) return Promise.resolve(null);
      record.consumedAt = new Date();

      for (const sibling of verifications.values()) {
        if (sibling.userId === userId && !sibling.consumedAt) {
          sibling.consumedAt = new Date();
        }
      }

      const user = users.get(userId);
      if (!user) return Promise.resolve(null);
      user.emailVerified = true;
      return Promise.resolve(user);
    },

    lastVerificationSentAt(userId) {
      const issued = [...verifications.values()]
        .filter((v) => v.userId === userId)
        .map((v) => v.createdAt)
        .sort((a, b) => b.getTime() - a.getTime());
      return Promise.resolve(issued[0] ?? null);
    },
  };
}
