-- Up Migration
--
-- A last_donation_date in the future does not make a donor temporarily
-- ineligible. It makes them permanently invisible: the eligibility test is
--
--   last_donation_date <= CURRENT_DATE - INTERVAL '56 days'
--
-- and a date that stays ahead of today never satisfies it. The donor
-- registers, sees nothing wrong, and is never told about a single request.
-- That is precisely the silent failure this system cannot afford.
--
-- The API already rejects these (registerSchema), but the API is not the only
-- way a row arrives — an import, a fix-up script, a clock skew on a machine
-- doing a bulk load.
--
-- A CHECK constraint cannot express this: Postgres requires CHECK expressions
-- to be immutable, and CURRENT_DATE is not. Hence a trigger.

CREATE FUNCTION reject_future_donation_date() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_donation_date IS NOT NULL
     AND NEW.last_donation_date > CURRENT_DATE
     AND coalesce(current_setting('kapka.allow_future_donation_date', true), 'off') <> 'on'
  THEN
    RAISE EXCEPTION
      'last_donation_date % is in the future', NEW.last_donation_date
      USING HINT =
        'Nobody donates tomorrow. Such a row would never satisfy the 56-day '
        'eligibility test, so the donor would be silently invisible to matching.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER donor_profiles_no_future_donation
  BEFORE INSERT OR UPDATE ON donor_profiles
  FOR EACH ROW EXECUTE FUNCTION reject_future_donation_date();

-- Down Migration

DROP TRIGGER IF EXISTS donor_profiles_no_future_donation ON donor_profiles;
DROP FUNCTION IF EXISTS reject_future_donation_date();
