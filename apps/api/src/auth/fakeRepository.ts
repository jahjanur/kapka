import type {
  AuthRepository,
  DonorProfileRecord,
  RefreshRecord,
  RegisterInput,
  UserRecord,
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
    addUser,

    findDonorProfile(userId) {
      return Promise.resolve(profiles.get(userId) ?? null);
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
  };
}
