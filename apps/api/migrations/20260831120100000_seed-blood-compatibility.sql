-- Up Migration
--
-- The 27 valid (recipient, donor) pairs, of 64 possible (§5.1).
--
-- READ THE DIRECTION CAREFULLY. recipient_type is what the PATIENT NEEDS.
-- donor_type is WHO CAN GIVE to them. Reversing this produces a system that
-- looks like it works and is medically wrong — it is the single most common
-- bug in this kind of system.
--
-- The rule these rows encode:
--   ABO — a donor's antigens must be a subset of the recipient's.
--         O gives to everyone; AB receives from everyone.
--   Rh  — an Rh-negative recipient can only receive Rh-negative blood.
--         An Rh-positive recipient can receive either.
--
-- Listed explicitly rather than generated. For data with clinical
-- consequences, a reviewer must be able to read every row.

-- Opt in to writing the table, so this migration works whether or not the
-- read-only guard already exists. SET LOCAL dies with the transaction.
SET LOCAL kapka.allow_compatibility_write = 'on';

INSERT INTO blood_compatibility (recipient_type, donor_type) VALUES
  -- Patient needs O−  (1 donor type — the hardest to source)
  ('O-', 'O-'),

  -- Patient needs O+  (2)
  ('O+', 'O-'), ('O+', 'O+'),

  -- Patient needs A−  (2)
  ('A-', 'A-'), ('A-', 'O-'),

  -- Patient needs A+  (4)
  ('A+', 'A-'), ('A+', 'A+'), ('A+', 'O-'), ('A+', 'O+'),

  -- Patient needs B−  (2)
  ('B-', 'B-'), ('B-', 'O-'),

  -- Patient needs B+  (4)
  ('B+', 'B-'), ('B+', 'B+'), ('B+', 'O-'), ('B+', 'O+'),

  -- Patient needs AB−  (4)
  ('AB-', 'A-'), ('AB-', 'B-'), ('AB-', 'AB-'), ('AB-', 'O-'),

  -- Patient needs AB+  (8 — the universal recipient)
  ('AB+', 'A-'), ('AB+', 'A+'), ('AB+', 'B-'), ('AB+', 'B+'),
  ('AB+', 'AB-'), ('AB+', 'AB+'), ('AB+', 'O-'), ('AB+', 'O+');

-- Refuse to complete if the matrix is wrong. A migration that half-seeds this
-- table would silently under- or over-notify donors, so the checks run here
-- rather than only in a test suite someone might not run.
DO $$
DECLARE
  total          INT;
  o_neg_donors   INT;
  ab_pos_donors  INT;
  o_neg_gives_to INT;
BEGIN
  SELECT count(*) INTO total FROM blood_compatibility;
  IF total <> 27 THEN
    RAISE EXCEPTION 'blood_compatibility must hold exactly 27 pairs, found %', total;
  END IF;

  -- A patient needing O− can receive from O− only.
  SELECT count(*) INTO o_neg_donors
    FROM blood_compatibility WHERE recipient_type = 'O-';
  IF o_neg_donors <> 1 THEN
    RAISE EXCEPTION 'O- recipients must have exactly 1 donor type, found %', o_neg_donors;
  END IF;

  -- A patient needing AB+ can receive from all eight (universal recipient).
  SELECT count(*) INTO ab_pos_donors
    FROM blood_compatibility WHERE recipient_type = 'AB+';
  IF ab_pos_donors <> 8 THEN
    RAISE EXCEPTION 'AB+ recipients must accept all 8 donor types, found %', ab_pos_donors;
  END IF;

  -- An O− donor can give to all eight (universal donor). This is the check
  -- that fails loudly if the two columns were ever swapped.
  SELECT count(*) INTO o_neg_gives_to
    FROM blood_compatibility WHERE donor_type = 'O-';
  IF o_neg_gives_to <> 8 THEN
    RAISE EXCEPTION 'O- donors must be able to give to all 8 types, found %', o_neg_gives_to;
  END IF;
END $$;

-- Down Migration

-- Opt in to writing the table: a later migration makes it read-only outside
-- migrations, and rolling back should not depend on the order those two are
-- undone in. SET LOCAL dies with the transaction.
SET LOCAL kapka.allow_compatibility_write = 'on';

DELETE FROM blood_compatibility;
