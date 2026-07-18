-- Migration preflight / postflight READ-ONLY checks (2026-07-18)
--
-- SAFETY: this file contains SELECT statements ONLY. It performs NO migration, NO write, NO DDL,
-- NO mutation. It embeds NO connection string or secret: the operator runs it against the target's
-- DIRECT (non-pooler) Neon endpoint using their own separately-injected credential, e.g.
--   psql "$DIRECT_URL" -f docs/runbooks/migration-preflight-checks.sql
-- It is a verification aid for the readiness packet
-- (2026-07-18-migration-readiness-staging-first.md); it is NOT an execution step and is reviewed
-- separately from the migration itself. Each check self-reports PASS/FAIL against the expected state.
--
-- Run the PRE-APPLY block before `prisma migrate deploy`, and the POST-APPLY block after, on the
-- same target. Choose the expected counts for the environment you are on:
--   staging  pre-apply: applied 57, pending 6   (post-apply: 63 / 0)
--   production pre-apply: applied 52, pending 11 (post-apply after full apply: 63 / 0)
-- The git-side checks (candidate SHA = edfc2a1e, repo has 63 migrations, checksum match) are
-- one-line shell commands in the packet, not part of this SQL.

\echo '================ MIGRATION STATE ================'
-- Applied / unfinished / rolled-back counts + latest applied migration.
SELECT
  count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied,
  count(*) FILTER (WHERE finished_at IS NULL)                                AS unfinished,
  count(*) FILTER (WHERE rolled_back_at IS NOT NULL)                         AS rolled_back,
  (SELECT migration_name FROM "_prisma_migrations"
     WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
     ORDER BY migration_name DESC LIMIT 1)                                   AS latest_applied;

-- HARD GATE (F2): unfinished migrations must be zero. A non-zero result means a partial apply:
-- do NOT deploy the backend. Resolve to 63 or restore the snapshot first.
SELECT CASE WHEN count(*) = 0 THEN 'PASS: zero unfinished'
            ELSE 'FAIL: ' || count(*) || ' UNFINISHED migration(s) - DO NOT DEPLOY BACKEND' END AS unfinished_gate
FROM "_prisma_migrations" WHERE finished_at IS NULL;

-- Per-candidate applied/pending map for the 11 window migrations.
WITH candidates(ord, name) AS (VALUES
  (1,'20260629000000_keyring_fingerprint'),
  (2,'20260702000000_maintenance_alert_types'),
  (3,'20260707135148_voucher_governed_flows'),
  (4,'20260709095646_branch_google_place_id'),
  (5,'20260709190638_branch_merchant_confirmed_confidence'),
  (6,'20260710000000_admin_capability_grants_field_role'),
  (7,'20260712000000_merchant_lead_packet'),
  (8,'20260713000000_merchant_note_packet'),
  (9,'20260714000000_d65_merchant_agreement_record'),
  (10,'20260714210000_customer_invite_referral_packet'),
  (11,'20260715000000_d65_agreement_reviewed_body'))
SELECT c.ord, c.name,
  CASE WHEN m.migration_name IS NOT NULL AND m.finished_at IS NOT NULL AND m.rolled_back_at IS NULL
       THEN 'APPLIED' ELSE 'PENDING' END AS state
FROM candidates c
LEFT JOIN "_prisma_migrations" m ON m.migration_name = c.name
ORDER BY c.ord;

\echo '================ SCHEMA OBJECT PRESENCE ================'
-- PRE-APPLY on staging: all of these are expected NULL/absent (tables not yet created).
-- POST-APPLY (63): all packet tables present, and the three D65 columns present + NOT NULL.
SELECT
  to_regclass('public."AdminCapabilityGrant"')  AS admin_capability_grant,
  to_regclass('public."MerchantLead"')          AS merchant_lead,
  to_regclass('public."MerchantNote"')          AS merchant_note,
  to_regclass('public."MerchantNoteEvent"')     AS merchant_note_event,
  to_regclass('public."MerchantAgreementRecord"') AS agreement_record,
  to_regclass('public."MerchantInvite"')        AS merchant_invite,
  to_regclass('public."InviteRewardGrant"')     AS invite_reward_grant,
  to_regclass('public."BusinessSuppression"')   AS business_suppression;

-- D65 columns: after packet 11 they must exist and be NOT NULL (is_nullable = NO).
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='MerchantAgreementRecord'
  AND column_name IN ('reviewedContentHash','reviewedBody','pdfHash')
ORDER BY column_name;

-- Enum values added by the window (post-apply expectations): AdminRole.FIELD, LocationConfidence.MERCHANT_CONFIRMED, etc.
SELECT t.typname AS enum_type, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('AdminRole','LocationConfidence','NotificationType','ApprovalStatus','ApprovalType')
GROUP BY t.typname ORDER BY t.typname;

\echo '================ D65 EMPTY-TABLE GUARD (F2) ================'
-- Only meaningful once MerchantAgreementRecord exists. Between packet 9 and packet 11 this MUST be 0;
-- a row here before packet 11 applies makes packet 11 permanently un-appliable. If the table does not
-- exist yet this query errors harmlessly (expected pre-apply) - run it only after confirming presence.
-- SELECT count(*) AS agreement_rows_must_be_zero_before_packet11 FROM "MerchantAgreementRecord";

\echo '================ END READ-ONLY PREFLIGHT ================'
