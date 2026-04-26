-- Step 1: Add cycleAnchorDate as nullable
ALTER TABLE "Subscription" ADD COLUMN "cycleAnchorDate" TIMESTAMP(3);

-- Step 2: Backfill existing rows.
-- Prefer currentPeriodStart (truncated to midnight UTC) as the best entitlement-start
-- source available. Fall back to createdAt (truncated to midnight UTC) if
-- currentPeriodStart is NULL for any reason.
UPDATE "Subscription"
SET "cycleAnchorDate" = DATE_TRUNC('day', COALESCE("currentPeriodStart", "createdAt"));

-- Step 3: Verify no rows remain NULL before making non-nullable.
-- This will raise an error and abort the migration if any row was missed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Subscription" WHERE "cycleAnchorDate" IS NULL) THEN
    RAISE EXCEPTION 'Backfill incomplete: Subscription rows with NULL cycleAnchorDate remain';
  END IF;
END $$;

-- Step 4: Set non-nullable now that all rows have a value
ALTER TABLE "Subscription" ALTER COLUMN "cycleAnchorDate" SET NOT NULL;
