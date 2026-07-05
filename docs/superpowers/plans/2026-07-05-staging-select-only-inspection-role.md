# Staging-only SELECT-only Neon Inspection Role — Execution Plan

> **For the owner (or an owner-supervised operator).** PLANNING ONLY here — **no step below is authorized to run yet.** Each provider action is a separate, explicit owner approval, gated on the owner-decision register in the design spec (`docs/superpowers/specs/2026-07-05-staging-select-only-inspection-role-design.md`). Claude performs NO Neon/DB/role/credential action; the owner runs the SQL in the Neon SQL editor and injects the credential privately.

**Goal:** provision → use → tear down a temporary, staging-only, SELECT-only Neon role for the Option-3 candidate-fixture inspection, with least privilege and clean revocation.

**Companion spec:** the design above. **Subject script:** `~/Documents/Playground/redeemo-notes/option3-inspection.mjs`, SHA-256 `d6730256ec6aedb7d6e75bac406f76203c6d4862394ebb1768e092cb26f13172`.

---

## Phase 0 — Owner decisions (BLOCKING)
Resolve D1–D7 + D-Neon (spec register). In particular D3 (redemptionPin model) determines the exact grant block. Do not proceed until each is decided.

## Phase 1 — Confirm provider behavior (docs only; no provider access)
Browse current Neon + PostgreSQL docs to confirm: custom `LOGIN` role + column grants + `ALTER ROLE ... SET default_transaction_read_only` behave as standard Postgres on Neon; the `DROP ROLE` prerequisites; direct vs pooled endpoint session semantics. Record findings in the security log. (No MCP, no connection.)

## Phase 2 — Fresh A1 + endpoint identity (owner)
Fresh Neon usage/spending-headroom check (per r1 A1). Confirm the intended **staging** endpoint + `neondb` from the private P1 mapping (never production). This mirrors the P1a Step-A identity discipline.

## Phase 3 — Create the role (owner, Neon SQL editor; SEPARATE approval)
Run the exact block below (values in `<...>` are owner-set; the password is typed by the owner and never shared). **The currently-pinned script digest `d673…` is D3(a)-compatible ONLY** (it reads `Branch.redemptionPin` directly). If the owner picks **D3(b) or D3(c)**, the script MUST be edited first, re-pinned in the spec §1, and re-reviewed **before** Phase 6 — otherwise Q2 fails `42501` on `Branch.redemptionPin`.

```sql
-- === temporary SELECT-only inspection role (staging neondb ONLY) ===
CREATE ROLE <role> LOGIN PASSWORD '<owner-typed>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT
  VALID UNTIL '<owner-set, <=24h from now>';
ALTER ROLE <role> SET default_transaction_read_only = on;   -- defense-in-depth (spec 3.2)

GRANT CONNECT ON DATABASE neondb TO <role>;
GRANT USAGE ON SCHEMA public TO <role>;

-- Column-scoped SELECT — exactly the script's read set (spec 2); NO blanket SELECT.
GRANT SELECT ("id","businessName","status","isTestData","createdAt") ON "Merchant"           TO <role>;
GRANT SELECT ("id","merchantId","deletedAt","lifecycleStatus")       ON "Branch"             TO <role>;   -- see D3 for redemptionPin
GRANT SELECT ("id","merchantId","code","status","isRmv")             ON "Voucher"            TO <role>;
GRANT SELECT ("id","branchId","userId","isValidated","isTestData","redeemedAt") ON "VoucherRedemption" TO <role>;
GRANT SELECT ("id","email","phoneVerified")                          ON "User"               TO <role>;
GRANT SELECT ("userId","status","createdAt")                         ON "Subscription"       TO <role>;

-- D3(a) (the ONLY option runnable against the currently-pinned digest d673…):
-- grant the ciphertext column directly (role gets ciphertext only; no key => no plaintext):
GRANT SELECT ("redemptionPin") ON "Branch" TO <role>;

-- D3(c) alternative (zero ciphertext; REQUIRES a re-pinned + re-reviewed script that reads the view):
-- owned by neondb_owner, NON-security_invoker (default) so the role reads pin_configured via the owner's Branch access:
-- CREATE VIEW public.inspect_branch_pin WITH (security_invoker = false) AS
--   SELECT "id" AS branch_id, ("redemptionPin" IS NOT NULL) AS pin_configured FROM "Branch";
-- GRANT SELECT ON public.inspect_branch_pin TO <role>;   -- and DROP the Branch redemptionPin grant above

-- Explicitly NOT run: any INSERT/UPDATE/DELETE/TRUNCATE grant; ALTER DEFAULT PRIVILEGES;
-- any sequence grant; GRANT CREATE ON SCHEMA; ownership. (Function EXECUTE + schema USAGE + db CONNECT
-- already exist via the PUBLIC baseline on stock PG16/Neon — an accepted floor, spec §3.3; not re-granted.)
```

## Phase 4 — Verify the role read-only (owner, read-only SQL)
```sql
SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit, rolcanlogin, rolvaliduntil
  FROM pg_roles WHERE rolname='<role>';                       -- expect: super/createdb/createrole/repl/bypassrls=f, inherit=f, canlogin=t, validuntil set
SELECT table_name, column_name, privilege_type
  FROM information_schema.role_column_grants WHERE grantee='<role>' ORDER BY 1,2;  -- expect: only SELECT on the §2 columns
SELECT table_name, privilege_type
  FROM information_schema.role_table_grants WHERE grantee='<role>';  -- expect: only the view (D3c) / nothing broad
```
STOP if anything beyond the read set appears, or the attributes are not all safe.

## Phase 5 — Inject the credential (owner-private)
Owner assembles the direct-endpoint `INSPECT_DATABASE_URL` for `<role>` and injects it into a fresh operator terminal via `read -s INSPECT_DATABASE_URL; export INSPECT_DATABASE_URL` — never in argv/chat/history. (Endpoint per D4; direct recommended.)

## Phase 6 — Run the inspection (SEPARATE approval; this wakes staging compute — D6)
Run `node ~/Documents/Playground/redeemo-notes/option3-inspection.mjs` (Step A lists candidates). Optionally set `CANDIDATE_MERCHANT_ID=<one owner-chosen id>` for the detail pass. Record the sanitized output. NO CANDIDATE if provenance is unprovable. **Discovery ≠ P9.**

## Phase 7 — Owner attestation (or NO CANDIDATE)
For any candidate, the owner supplies independent creation evidence OR attests: exact identity (merchant/branch/voucher/customer ids), dedicated-exclusively-to-testing, known-PIN handling (no PIN revealed), retain-and-label accepted. Only then may P9 be recorded satisfied (a separate step). Otherwise P9 stays BLOCKED.

## Phase 8 — Teardown (owner; MANDATORY)
Run the spec's rollback/revocation checklist. **`DROP OWNED BY` is the required grant-revoker** (`DROP ROLE` fails while any grant remains; `DROP OWNED BY` clears every grant incl. the shared-object database `CONNECT` that a table-only `REVOKE` would miss):
```sql
DROP OWNED BY <role>;                       -- revokes ALL grants (tables/view/schema USAGE/db CONNECT); role owns nothing
DROP VIEW IF EXISTS public.inspect_branch_pin;  -- only if D3(c) created it (owned by neondb_owner, so not caught above)
DROP ROLE IF EXISTS <role>;                 -- idempotent
SELECT 1 FROM pg_roles WHERE rolname='<role>';  -- expect: no row
```
Then unset `INSPECT_DATABASE_URL`; confirm compute idle + cost delta; log the result.

## Phase 9 — Record
Append role name, timestamps, grants (no secret), digest, sanitized output, cost delta, and teardown confirmation to the security execution log. Do not commit the log; do not edit the Codex checklist.

---

## Stop conditions (any ⇒ halt + report, no retry)
Prod identifier / non-staging target · grants beyond the read set · `transaction_read_only` ≠ on · prohibited identity is the only candidate · script digest mismatch · compute won't idle / cost near $20 · any request to share the role password.

## Explicit boundaries (unchanged)
No P1b, migration, R1, deployment, restart, worker action, key/schema/auth/payment. This role is not `DATABASE_URL`/`MIGRATION_DATABASE_URL`/`TEST_DATABASE_URL`. PR #338 untouched. Discovery does not establish provenance.
