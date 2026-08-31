import { BLOOD_TYPES, type BloodType } from '@kapka/shared';

/**
 * The transfusion compatibility matrix, written out by hand.
 *
 * §13 asks for exactly this: "assert all 64 (recipient, donor) pairs against a
 * hand-written table — 27 valid, 37 invalid". Hand-written is the point. The
 * matching query, the seed migration and the ABO/Rh rule elsewhere in the
 * tests are all derivations; if a derivation is wrong, checking it against
 * another derivation of the same idea agrees and says nothing. This is a third
 * statement of the truth, independent of both.
 *
 * It is a grid rather than code so it can be checked against a transfusion
 * chart by someone who does not read TypeScript.
 *
 *   ROWS    = what the PATIENT NEEDS
 *   COLUMNS = WHO CAN GIVE to them
 *   Y       = that donor may give to that patient
 *
 * Reading the first row: a patient who needs O− can receive from O− only.
 * Reading the first column: an O− donor can give to everyone.
 */
const TABLE = `
            O-  O+  A-  A+  B-  B+  AB- AB+
   O-        Y   .   .   .   .   .   .   .
   O+        Y   Y   .   .   .   .   .   .
   A-        Y   .   Y   .   .   .   .   .
   A+        Y   Y   Y   Y   .   .   .   .
   B-        Y   .   .   .   Y   .   .   .
   B+        Y   Y   .   .   Y   Y   .   .
   AB-       Y   .   Y   .   Y   .   Y   .
   AB+       Y   Y   Y   Y   Y   Y   Y   Y
`;

export interface CompatibilityPair {
  /** What the patient needs. */
  recipient: BloodType;
  /** Who can give to them. */
  donor: BloodType;
  compatible: boolean;
}

/**
 * All 64 pairs, read out of the grid above.
 *
 * The parser validates the grid's own shape as it goes: a row for every type,
 * in the declared order, with a cell per column. A grid that has drifted out
 * of shape throws rather than quietly producing a short table that every test
 * then passes against.
 */
function parseTable(): CompatibilityPair[] {
  const lines = TABLE.trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const [header, ...rows] = lines;
  const columns = (header ?? '').split(/\s+/);
  if (columns.length !== BLOOD_TYPES.length) {
    throw new Error(`table header has ${String(columns.length)} columns, expected 8`);
  }
  if (columns.join(',') !== BLOOD_TYPES.join(',')) {
    throw new Error(
      `table columns are ${columns.join(' ')}, expected ${BLOOD_TYPES.join(' ')}`,
    );
  }
  if (rows.length !== BLOOD_TYPES.length) {
    throw new Error(`table has ${String(rows.length)} rows, expected 8`);
  }

  const pairs: CompatibilityPair[] = [];
  rows.forEach((row, index) => {
    const [label, ...cells] = row.split(/\s+/);
    const recipient = BLOOD_TYPES[index];
    if (label !== recipient) {
      throw new Error(
        `row ${String(index)} is labelled ${String(label)}, expected ${String(recipient)}`,
      );
    }
    if (cells.length !== BLOOD_TYPES.length) {
      throw new Error(
        `row ${String(label)} has ${String(cells.length)} cells, expected 8`,
      );
    }
    cells.forEach((cell, column) => {
      if (cell !== 'Y' && cell !== '.') {
        throw new Error(
          `row ${String(label)} column ${String(column)} is ${cell}, expected Y or .`,
        );
      }
      const donor = BLOOD_TYPES[column];
      // Both are in range because the row and column counts were checked
      // above, but saying so explicitly beats an assertion that silences the
      // one check that would notice if they were not.
      if (!recipient || !donor) {
        throw new Error(`table cell ${String(index)},${String(column)} is out of range`);
      }
      pairs.push({ recipient, donor, compatible: cell === 'Y' });
    });
  });
  return pairs;
}

export const COMPATIBILITY_TABLE: CompatibilityPair[] = parseTable();

export const VALID_PAIRS = COMPATIBILITY_TABLE.filter((pair) => pair.compatible);
export const INVALID_PAIRS = COMPATIBILITY_TABLE.filter((pair) => !pair.compatible);
