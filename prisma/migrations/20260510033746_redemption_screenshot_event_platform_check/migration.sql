-- PR-1 hardening 2026-05-10: defensive CHECK constraint on
-- RedemptionScreenshotEvent.platform.  Closes deferred-followups §AG3.
--
-- The column is currently a plain `TEXT NOT NULL` whose accepted values
-- are enforced ONLY at the customer-API layer via Zod
-- (`z.enum(['ios', 'android'])` in src/api/redemption/routes.ts).  A
-- future direct-DB writer (admin tool, ad-hoc support action, manual
-- migration) could insert 'web' / 'unknown' / arbitrary strings,
-- corrupting downstream platform-segmented analytics on the screenshot
-- anti-fraud telemetry.
--
-- Defence-in-depth only — no expected behaviour change for any current
-- caller.  Existing rows are unaffected (the migration's CHECK
-- evaluates only at INSERT/UPDATE time on a fresh-shipped table; M3
-- shipped 2026-05-08, no historic 'web' rows possible).
--
-- Constraint name: `RedemptionScreenshotEvent_platform_check` to match
-- the Prisma migration-generated naming convention (`<table>_<col>_check`).
ALTER TABLE "RedemptionScreenshotEvent"
  ADD CONSTRAINT "RedemptionScreenshotEvent_platform_check"
  CHECK ("platform" IN ('ios', 'android'));
