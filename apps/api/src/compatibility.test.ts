import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BLOOD_TYPES, parseBloodType, type BloodType } from '@kapka/shared';

/**
 * §13 makes this the P0 test: all 64 (recipient, donor) pairs asserted against
 * a hand-written table — 27 valid, 37 invalid. It is the one piece of logic
 * where a bug has consequences outside the software.
 *
 * The matrix lives in the database (§3), so this reads the seed migration and
 * checks it against the ABO/Rh rule expressed independently below. Two
 * separate statements of the same truth: if the migration is edited wrongly,
 * they stop agreeing.
 *
 * This does not replace running the migration — the DO block inside it checks
 * the same invariants against the real table. It replaces waiting for a
 * database to find out the data is wrong.
 */

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));

function readSeedMigration(): string {
  const file = readdirSync(migrationsDir).find((name) =>
    name.includes('seed-blood-compatibility'),
  );
  if (!file) throw new Error('seed-blood-compatibility migration not found');
  return readFileSync(migrationsDir + file, 'utf8');
}

/** The (recipient, donor) pairs the migration actually inserts. */
function seededPairs(): Set<string> {
  const sql = readSeedMigration();
  const start = sql.indexOf('VALUES');
  const end = sql.indexOf(';', start);
  expect(start).toBeGreaterThan(-1);
  const values = sql.slice(start, end);

  const pairs = new Set<string>();
  const pattern = /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(values)) !== null) {
    pairs.add(`${match[1] ?? ''}>${match[2] ?? ''}`);
  }
  return pairs;
}

/**
 * The rule, written from first principles rather than from the data — so this
 * is a genuine second opinion, not a restatement.
 *
 * ABO: the donor's antigens must be a subset of the recipient's.
 * Rh:  an Rh-negative recipient can only receive Rh-negative blood.
 */
const ABO_DONORS = {
  O: ['O'],
  A: ['A', 'O'],
  B: ['B', 'O'],
  AB: ['A', 'B', 'AB', 'O'],
} as const;

function isCompatible(recipient: BloodType, donor: BloodType): boolean {
  const r = parseBloodType(recipient);
  const d = parseBloodType(donor);
  const aboOk = (ABO_DONORS[r.group] as readonly string[]).includes(d.group);
  const rhOk = r.rh === 'positive' || d.rh === 'negative';
  return aboOk && rhOk;
}

describe('blood_compatibility seed', () => {
  const seeded = seededPairs();

  it('contains exactly 27 pairs', () => {
    expect(seeded.size).toBe(27);
  });

  it('agrees with the ABO/Rh rule on all 64 combinations', () => {
    const disagreements: string[] = [];
    for (const recipient of BLOOD_TYPES) {
      for (const donor of BLOOD_TYPES) {
        const inMigration = seeded.has(`${recipient}>${donor}`);
        const byRule = isCompatible(recipient, donor);
        if (inMigration !== byRule) {
          disagreements.push(
            `${recipient} <- ${donor}: migration says ${String(inMigration)}, rule says ${String(byRule)}`,
          );
        }
      }
    }
    expect(disagreements).toEqual([]);
  });

  it('splits 64 combinations into 27 valid and 37 invalid', () => {
    let valid = 0;
    for (const recipient of BLOOD_TYPES) {
      for (const donor of BLOOD_TYPES) if (isCompatible(recipient, donor)) valid += 1;
    }
    expect(valid).toBe(27);
    expect(BLOOD_TYPES.length ** 2 - valid).toBe(37);
  });

  /* ── The reference points named in §5.1 ──────────────────────────────── */

  it('a patient needing O− can receive from O− only', () => {
    const donors = BLOOD_TYPES.filter((d) => seeded.has(`O->${d}`));
    expect(donors).toEqual(['O-']);
  });

  it('a patient needing AB+ can receive from all eight', () => {
    const donors = BLOOD_TYPES.filter((d) => seeded.has(`AB+>${d}`));
    expect(donors).toHaveLength(8);
  });

  it('an O− donor can give to all eight recipient types', () => {
    // The check that fails loudly if the two columns were ever swapped.
    const recipients = BLOOD_TYPES.filter((r) => seeded.has(`${r}>O-`));
    expect(recipients).toHaveLength(8);
  });

  it('an AB+ donor can give only to AB+', () => {
    const recipients = BLOOD_TYPES.filter((r) => seeded.has(`${r}>AB+`));
    expect(recipients).toEqual(['AB+']);
  });

  it('is not symmetric — the direction carries meaning', () => {
    // If someone reversed the columns, many of these would flip.
    expect(seeded.has('AB+>O-')).toBe(true);
    expect(seeded.has('O->AB+')).toBe(false);
  });

  it('lets every type receive from itself', () => {
    for (const type of BLOOD_TYPES) {
      expect(seeded.has(`${type}>${type}`)).toBe(true);
    }
  });

  it('never lets an Rh-negative patient receive Rh-positive blood', () => {
    for (const recipient of BLOOD_TYPES) {
      if (parseBloodType(recipient).rh !== 'negative') continue;
      for (const donor of BLOOD_TYPES) {
        if (parseBloodType(donor).rh === 'positive') {
          expect(seeded.has(`${recipient}>${donor}`)).toBe(false);
        }
      }
    }
  });
});

describe('migration hygiene', () => {
  it('keeps the schema migration ordered before the seed', () => {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const schema = files.findIndex((f) => f.includes('initial-schema'));
    const seed = files.findIndex((f) => f.includes('seed-blood-compatibility'));
    expect(schema).toBeGreaterThanOrEqual(0);
    expect(seed).toBeGreaterThan(schema);
  });

  it('gives every migration both an up and a down section', () => {
    // Without a down, a bad deploy cannot be walked back.
    for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(migrationsDir + file, 'utf8');
      expect(sql, file).toContain('-- Up Migration');
      expect(sql, file).toContain('-- Down Migration');
    }
  });

  it('declares the same blood types as @kapka/shared', () => {
    // The enum and the TS union have to stay in lockstep, or a value valid in
    // one is a runtime error in the other.
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    const schema = files.find((f) => f.includes('initial-schema'));
    const sql = readFileSync(migrationsDir + (schema ?? ''), 'utf8');
    const match = /CREATE TYPE blood_type AS ENUM \(([^)]+)\)/.exec(sql);
    expect(match).not.toBeNull();
    const declared = [...(match?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(declared).toEqual([...BLOOD_TYPES]);
  });
});
