# Staging-only SELECT-only Neon Inspection Role — Execution Plan

> **For the owner (or an owner-supervised operator).** PLANNING ONLY here — **no step below is authorized to run yet.** Each provider action is a separate, explicit owner approval, gated on the owner-decision register in the design spec (`docs/superpowers/specs/2026-07-05-staging-select-only-inspection-role-design.md`). Claude performs NO Neon/DB/role/credential action; the owner runs the SQL in the Neon SQL editor and injects the credential privately.

**Goal:** provision → use → tear down a temporary, staging-only, SELECT-only Neon role for the Option-3 candidate-fixture inspection, with least privilege and clean revocation.

**Companion spec:** the design above. **Subject script:** `~/Documents/Playground/redeemo-notes/option3-inspection.mjs`, SHA-256 `d6730256ec6aedb7d6e75bac406f76203c6d4862394ebb1768e092cb26f13172`.

---

## Phase 0 — Owner decisions (BLOCKING)
Resolve **D1–D8 + D-Neon** (spec register) before any provisioning. **No role may be created while D3 OR D8 remains open** — the resolved **D3 + D8 combination determines** whether temporary safe projections are created, the exact inspection script, its new SHA-256 (if changed), the exact grant matrix, and the required fresh Opus + Codex review. If either projection (D3(c) PIN / D8 email) is chosen, edit the script → new digest → re-derive matrix → fresh Opus + Codex review before Phase 3.

## Phase 1 — Confirm provider behavior + LIVE PUBLIC-function inventory gate
- Docs (already verified 2026-07-05, spec §14): `psql \password` is secret-safe; `neondb_owner`→`neon_superuser` holds CREATEROLE; `DROP OWNED BY` before `DROP ROLE`; direct vs pooled session semantics.
- **Live read-only PUBLIC-function inventory gate (spec §12) — run in the Neon SQL editor, read-only, BEFORE creating the role.** Enumerate, read-only, EACH function/procedure with **owner** (`pg_get_userbyid(proowner)`), **language** (`pg_language`), **SECURITY DEFINER** (`prosecdef`), **kind** (`prokind`), **trigger status** (`prorettype='pg_catalog.trigger'`), **PUBLIC EXECUTE** (`has_function_privilege('public', oid, 'EXECUTE')`), and **exact schema + identity arguments** (`pg_get_function_identity_arguments`) — full query in spec §12. Apply the **deterministic STOP matrix (spec §12):** STOP on every PUBLIC-executable SECURITY DEFINER; STOP on every PUBLIC-executable non-trigger function/procedure unless it EXACTLY matches separately-reviewed repo evidence AND is adjudicated safe; STOP on every live function absent from `prisma/migrations/**`; STOP whenever a live definition/owner/security attribute differs from reviewed evidence. Metadata alone does NOT prove absence of side effects. The repo trigger `enforce_merchant_highlight_cap()` (SECURITY INVOKER, trigger-only) may pass ONLY if its live identity/owner/security-mode/trigger-only classification all match the reviewed migration. Do NOT globally revoke PUBLIC function privileges. Record findings in the security log. (No MCP, no data mutation.)

## Phase 2 — Fresh A1 + endpoint identity (owner)
Fresh Neon usage/spending-headroom check (per r1 A1). Confirm the intended **staging** endpoint + `neondb` from the private P1 mapping (never production). This mirrors the P1a Step-A identity discipline.

## Phase 3 — Create the role (owner, Neon SQL editor; SEPARATE approval)
Run the exact block below (values in `<...>` are owner-set; the password is typed by the owner and never shared). **The currently-pinned script digest `d673…` is D3(a)-compatible ONLY** (it reads `Branch.redemptionPin` directly). If the owner picks **D3(b) or D3(c)**, the script MUST be edited first, re-pinned in the spec §1, and re-reviewed **before** Phase 6 — otherwise Q2 fails `42501` on `Branch.redemptionPin`.

**Secret-safe fail-closed order (spec §3.0): create NOLOGIN + NO PASSWORD → grant → verify → `\password` → LOGIN. NEVER put a `PASSWORD '...'` literal in SQL text. If ANY statement below errors, STOP and jump straight to Phase 8 teardown — do not run later grants, do not set a password, do not enable LOGIN.**

**Role name (spec §3.0.1): use a UNIQUE, sanitized, session-specific `<role>` (e.g. `insp_ro_<YYYYMMDD>_<short-random>`) — never a generic reusable name. Create via SQL ONLY — NEVER the Neon Console/CLI/API (those grant `neon_superuser`).**
```sql
-- === temporary SELECT-only inspection role (staging neondb ONLY) ===
-- 0) COLLISION-SAFE PREFLIGHT (read-only) — the exact name MUST be absent first:
SELECT 1 FROM pg_roles WHERE rolname='<role>';   -- expect NO ROW; if a row => STOP (name taken), do not touch it.
-- 1) born NOLOGIN, NO PASSWORD (cannot authenticate during provisioning):
CREATE ROLE <role> NOLOGIN
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
-- any sequence grant; GRANT CREATE ON SCHEMA; ownership; and NO `PASSWORD '...'` literal anywhere.
-- (Function EXECUTE + schema USAGE + db CONNECT already exist via the PUBLIC baseline on stock
--  PG16/Neon — an accepted floor, spec §3.3; not re-granted.)
```
**After the grants verify (Phase 4), set the password secret-safely, then enable login:**
```text
\password <role>       -- psql prompts; encrypts client-side; NO plaintext in SQL/history/log (spec §3.0 step 4).
                       -- password must be >= 60-bit entropy (>= 12 chars) per Neon.
```
```sql
ALTER ROLE <role> LOGIN;   -- ONLY after steps 2-4 all pass.
```
If `psql \password` (or another separately-reviewed non-privileged, non-plaintext mechanism against this SQL-created role) is unavailable => **STOP and TEAR DOWN the NOLOGIN role** (Phase 8). Never use a plaintext `PASSWORD '...'` literal; never create the role via Neon Console/CLI/API.
**On a `CREATE ROLE` failure (spec §3.0.1 / §7):** re-run `SELECT 1 FROM pg_roles WHERE rolname='<role>'`. If the name now exists and we did not just create it => **STOP + report; never auto-alter/revoke/drop it**. A fresh unique name only in a separately-adjudicated retry.

## Phase 4 — Verify the role read-only, + authority + ownership-zero (owner, read-only SQL; BEFORE `\password`/LOGIN)
```sql
-- attributes (expect canlogin=f at this point — LOGIN is enabled only after this passes):
SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit, rolcanlogin, rolvaliduntil
  FROM pg_roles WHERE rolname='<role>';   -- super/createdb/createrole/repl/bypassrls=f, inherit=f, canlogin=f (yet), validuntil set
-- column grants (expect ONLY SELECT on the §2 columns):
SELECT table_name, column_name, privilege_type
  FROM information_schema.role_column_grants WHERE grantee='<role>' ORDER BY 1,2;
-- table/view grants (expect only the D3c view / nothing broad):
SELECT table_name, privilege_type
  FROM information_schema.role_table_grants WHERE grantee='<role>';
-- default_transaction_read_only set on the role:
SELECT rolconfig FROM pg_roles WHERE rolname='<role>';   -- expect it contains default_transaction_read_only=on
-- CREATOR AUTHORITY (spec §13): PG16 `DROP ROLE <role>` needs CREATEROLE *and* ADMIN OPTION on <role>
-- (or neon_superuser). Path (a) must prove BOTH — admin_option alone is necessary-but-not-sufficient:
SELECT m.admin_option AS has_admin_option, cur.rolcreaterole AS operator_can_createrole
  FROM pg_auth_members m
  JOIN pg_roles r   ON r.oid=m.roleid
  JOIN pg_roles g   ON g.oid=m.member
  JOIN pg_roles cur ON cur.rolname=current_user
 WHERE r.rolname='<role>' AND g.rolname=current_user;   -- expect has_admin_option=t AND operator_can_createrole=t
-- ...OR prove neon_superuser membership explicitly (subsumes CREATEROLE+ADMIN OPTION; do NOT infer authority
--    from the role name / "we created it"):
SELECT pg_has_role(current_user, 'neon_superuser', 'MEMBER') AS is_neon_superuser;   -- t satisfies drop authority
-- OWNERSHIP-ZERO proof (spec §13; so DROP OWNED BY is purely a revoker):
SELECT 1 FROM pg_class     WHERE relowner   = (SELECT oid FROM pg_roles WHERE rolname='<role>') LIMIT 1;  -- expect: no row
SELECT 1 FROM pg_namespace WHERE nspowner   = (SELECT oid FROM pg_roles WHERE rolname='<role>') LIMIT 1;  -- expect: no row
SELECT 1 FROM pg_proc      WHERE proowner    = (SELECT oid FROM pg_roles WHERE rolname='<role>') LIMIT 1;  -- expect: no row
```
**STOP (and run Phase 8 teardown)** if: anything beyond the §2 read set appears; any safe-attribute is wrong; `default_transaction_read_only` is not set; the operator is **not** provably able to drop the role via EXPLICIT evidence (neither `admin_option` on `<role>` **combined with** `rolcreaterole=t` on the operator, NOR `pg_has_role(current_user,'neon_superuser','MEMBER')=t` — never inferred from naming); or the role owns any object.

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
Then unset `INSPECT_DATABASE_URL`; confirm compute idle + cost delta; log the result. **If any teardown step fails or the role persists, this is a SECURITY INCIDENT/BLOCKER — stop, report, do not continue, and do not leave a partially-privileged role behind** (`DROP ROLE` alone is insufficient while grants remain; re-run `DROP OWNED BY` first). Teardown is idempotent.

## Phase 9 — Record
Append role name, timestamps, grants (no secret), digest, sanitized output, cost delta, and teardown confirmation to the security execution log. Do not commit the log; do not edit the Codex checklist.

---

## Stop conditions (any ⇒ halt + report, no retry)
Prod identifier / non-staging target · grants beyond the read set · `transaction_read_only` ≠ on · prohibited identity is the only candidate · script digest mismatch · compute won't idle / cost near $20 · any request to share the role password.

## Explicit boundaries (unchanged)
No P1b, migration, R1, deployment, restart, worker action, key/schema/auth/payment. This role is not `DATABASE_URL`/`MIGRATION_DATABASE_URL`/`TEST_DATABASE_URL`. PR #338 untouched. Discovery does not establish provenance.
