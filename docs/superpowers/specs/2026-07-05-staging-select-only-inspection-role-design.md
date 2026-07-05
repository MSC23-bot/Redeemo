# Staging-only SELECT-only Neon Inspection Role — Design Spec

> **Status: DESIGN / PLANNING ONLY — do NOT create the role, connect to Neon, or run `option3-inspection.mjs`.** Every provider action (role creation, credential injection, connection, deletion) is a **separate, explicit owner approval**. This spec + its companion plan (`docs/superpowers/plans/2026-07-05-staging-select-only-inspection-role.md`) exist so Codex can review the exact intended role, grants, and lifecycle before anything is executed.

**Goal:** define a **temporary, staging-only, SELECT-only Neon Postgres login role** that is the *only* credential permitted to run the already-prepared Option-3 candidate-fixture inspection. It must read exactly — and only — the columns that inspection needs, hold no write/DDL/admin capability, target staging (never production), and be short-lived and cleanly revocable.

**Why it exists:** Option 3 (a read-only DB inspection to identify a *candidate* P9 acceptance fixture) is currently **BLOCKED: NO VERIFIED SELECT-ONLY CREDENTIAL** (security log, 2026-07-05). The runtime `DATABASE_URL` is a pooled **read-write** app credential and must not be substituted; `MIGRATION_DATABASE_URL` is a write-capable migration credential (unbuilt); `TEST_DATABASE_URL` is a local loopback. None is a genuine SELECT-only credential. This role closes that gap **minimally** — least privilege, not a general analyst role.

**Non-goal:** this role does NOT establish P9. Candidate discovery is not provenance. P9 unblocks only on independent creation evidence OR explicit owner attestation of one exact fixture (identity + dedicated-to-testing + known-PIN handling + retain-and-label). This role is also entirely separate from P1b, migrations, R1, and any application runtime credential.

---

## 1. Subject script (the exact consumer, pinned for review)

- **Durable path (owner-local, NOT in the repo):** `~/Documents/Playground/redeemo-notes/option3-inspection.mjs`
- **SHA-256:** `d6730256ec6aedb7d6e75bac406f76203c6d4862394ebb1768e092cb26f13172`
- Size: 162 lines / 8672 bytes. Reviewed 2026-07-05 by Opus as SAFE-TO-REVIEW (read-only, no writes, no PII leak, no provenance promotion; schema names verified).
- The role's grants are derived **solely** from this script's read set. If the script changes (new digest), the grant matrix MUST be re-derived and re-reviewed before the role is created.

## 2. Read set derived from the script (the ONLY data the role may see)

The script reads six tables. Postgres evaluates every referenced column (even inside `IS NOT NULL` or a `WHERE`) under **column-level SELECT** privilege, so the grant is column-scoped per table — **no blanket table SELECT, no access to any other table**.

| Table | Columns the script reads | Why (script use) |
|---|---|---|
| `Merchant` | `id`, `businessName`, `status`, `isTestData`, `createdAt` | Q1 candidate listing (output) |
| `Branch` | `id`, `merchantId`, `deletedAt`, `lifecycleStatus`, `redemptionPin` | branch count/detail; `redemptionPin` **only** as `IS NOT NULL` → `pinConfigured` boolean |
| `Voucher` | `id`, `merchantId`, `code`, `status`, `isRmv` | voucher count/detail |
| `VoucherRedemption` | `id`, `branchId`, `userId`, `isValidated`, `isTestData`, `redeemedAt` | before-state + linked customer id |
| `User` | `id`, `email`, `phoneVerified` | `email` in WHERE only (excludes `customer@redeemo.com`, never output); `id`+`phoneVerified` output |
| `Subscription` | `userId`, `status`, `createdAt` | customer eligibility (status enum) |

**`redemptionPin` note (load-bearing security decision — see §D3).** The `pinConfigured` boolean requires read access to `Branch.redemptionPin`. That column stores an **AES-256-GCM ciphertext** (`prisma/schema.prisma:517`), and the inspection role holds **no `ENCRYPTION_KEY`**, so a raw read yields ciphertext only — never a plaintext PIN. Even so, granting the column directly lets the role `SELECT redemptionPin` and receive that ciphertext. Three options are surfaced as an owner decision (§D3); the recommended default is a **read-only view** (owned by `neondb_owner`, non-`security_invoker`) that exposes only the boolean, so the role never receives even ciphertext. **Digest consequence (corrected 2026-07-05 per review):** the pinned script digest `d673…` (§1) reads `Branch.redemptionPin` **directly**, so it is compatible ONLY with **D3(a)** (grant the column). **D3(b) and D3(c) both require editing the script** to drop / redirect that read — which produces a **new SHA-256** that MUST be re-pinned in §1 AND re-reviewed before Phase 6. Do not run the currently-pinned script under D3(b)/(c): Q2 would hit `42501 INSUFFICIENT_PRIVILEGE` on `Branch.redemptionPin`.

**`User.email` capability note (accepted; corrected 2026-07-05 per review).** The script uses `email` only in a `WHERE` (to exclude `customer@redeemo.com`) and never outputs it — but a column `GRANT SELECT (email)` inherently confers the ad-hoc capability to `SELECT email FROM "User"`, i.e. to read every customer email (PII). This is unavoidable (you cannot filter on a column you cannot select) and is **accepted** because the role is owner-held, read-only, and short-lived. If the owner wants zero raw-PII capability, the exclusion can be moved behind a view/boolean (parallel to §D3(c)) — a separate owner decision that, like D3(c), would change the script digest and require re-pin + re-review.

## 3. Role definition (least privilege)

### 3.1 Attributes (requirement 6 — all safe)
`LOGIN` · **`NOSUPERUSER` `NOCREATEDB` `NOCREATEROLE` `NOREPLICATION` `NOBYPASSRLS` `NOINHERIT`** · `VALID UNTIL '<owner-set expiry>'` · **not a member of any group role** (no inherited privilege). `NOINHERIT` guarantees no unintended inheritance even if a future membership were added.

### 3.2 Defense-in-depth read-only enforcement (requirement 7)
`ALTER ROLE <role> SET default_transaction_read_only = on;` — every session the role opens defaults to a read-only transaction at the server, independent of what the client does. Combined with (a) SELECT-only grants (no write privilege exists to abuse) and (b) the script's own `BEGIN TRANSACTION READ ONLY` + server-side `SHOW transaction_read_only='on'` gate, this is **triple** read-only enforcement.

### 3.3 Access grants (requirement 3, 4, 5, 8)
- `GRANT CONNECT ON DATABASE neondb TO <role>;` (staging db only)
- `GRANT USAGE ON SCHEMA public TO <role>;` (schema visibility only — **not** `CREATE`)
- Column-scoped `GRANT SELECT (<cols>) ON <table> TO <role>;` for exactly the six tables/columns in §2 (or, under §D3 option (c), `GRANT SELECT` on the single inspection view + the non-pin columns).
- **Explicitly NOT granted by us:** INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on any table; any DDL; `USAGE`/`SELECT`/`UPDATE` on any sequence; ownership of anything; `CREATE` on the schema; SELECT on any table (or any column) outside the six / the §D3(c) view.
- **The PUBLIC baseline (accepted floor — corrected 2026-07-05 per review).** Every role is implicitly a member of `PUBLIC`, and `NOINHERIT` does **not** suppress PUBLIC grants. On stock PostgreSQL 16 / Neon, PUBLIC by default holds: `CONNECT` + `TEMP` on the database, `USAGE` on schema `public`, and **`EXECUTE` on all functions in `public`**. Consequences: (a) our explicit `GRANT CONNECT`/`GRANT USAGE ON SCHEMA public` are partly **redundant** (kept for clarity — explicit is good); (b) the role **will** have `EXECUTE` on `public` functions regardless — so the earlier "no function EXECUTE" wording is inaccurate and is corrected here. This floor is **low-risk and accepted** for a short-lived staging role: function EXECUTE with **no** table-write grant, inside a read-only transaction, cannot mutate; the only theoretical concern is a `SECURITY DEFINER` function owned by a privileged role (rare in this Prisma/Neon app). Hardening it (`REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC`) is deliberately **out of scope** (it would affect every role, not just ours). Note: **PostgreSQL 16 already removed the legacy PUBLIC `CREATE` on schema `public`**, so the role does NOT get schema `CREATE`.

### 3.4 Future-object behavior (requirement 9)
**Do NOT run `ALTER DEFAULT PRIVILEGES`.** Grants apply to the **existing** objects only. A table created after the role is provisioned must NOT auto-grant SELECT — the role is a point-in-time minimal snapshot, and its short lifetime (§3.5) means new tables are irrelevant.

### 3.5 Lifetime, revocation, deletion (requirement 14)
- `VALID UNTIL` set to a **short window** (owner decision §D2; recommended ≤ 24 h) so the login self-expires even if teardown is missed.
- Explicit teardown after the inspection: **`DROP OWNED BY <role>` (in `neondb`) is the load-bearing grant-revoker, NOT merely defensive** — `DROP ROLE` FAILS while the role still holds any grant, and `DROP OWNED BY` revokes every privilege the role holds on objects in this database **and on shared objects (the database `CONNECT` itself)**, which a table-only `REVOKE` would miss. The role owns no objects (the §D3(c) view is owned by `neondb_owner`), so `DROP OWNED BY` here does 0% object-dropping and 100% of the revocation. Sequence: **`DROP OWNED BY <role>` → `DROP ROLE IF EXISTS <role>`** (+ a separate `DROP VIEW inspect_branch_pin` since the view is owned by `neondb_owner`, not the role, so `DROP OWNED BY <role>` will not remove it). Idempotent; safe to re-run.
- Neon caveat to confirm from provider docs (§D-Neon): custom SQL-created LOGIN roles + column grants behave as standard Postgres on Neon; role deletion via SQL. The owner performs creation and deletion in the Neon SQL editor (or an approved operator path) — Claude never touches Neon.

## 4. Endpoint choice (requirement 11)

Recommend the **DIRECT (session-mode) endpoint**, not the pooled (`-pooler`) endpoint, for this one-off inspection:
- Session mode makes `ALTER ROLE ... SET default_transaction_read_only` and `SHOW transaction_read_only` deterministic; PgBouncer transaction pooling can complicate session-scoped settings and `SHOW`.
- The inspection is a single bounded connection — it does not need pooling.
- This is a **new, distinct role's credential** on the direct host; it is NOT `MIGRATION_DATABASE_URL` and NOT the runtime pooled `DATABASE_URL`. (P1b's direct endpoint is for *migrations*; this reuses the direct *host* only, with a different, read-only role.)
- Either endpoint wakes the same staging compute (cost identical). Owner decides (§D4); if the owner prefers pooled, the script still functions (its `BEGIN...ROLLBACK` is transaction-scoped), but session determinism is weaker.

## 5. Read-only verification without a write (requirement 12)

All verification is itself read-only:
- At creation (owner, in the SQL editor): inspect role attributes (`\du <role>` / `pg_roles`) and grants (`information_schema.role_column_grants` / `role_table_grants`) — confirm SELECT-only, correct columns, safe attributes, `default_transaction_read_only=on`.
- At run: the script's server-side `SHOW transaction_read_only='on'` gate aborts before any candidate query if the session is not read-only.
- No write is ever attempted to prove read-only-ness (a write-attempt would violate the no-mutation boundary and, under `default_transaction_read_only`, would raise `25006` anyway — classified in the script).

## 6. Bounded connection/query/cleanup (requirement 13)

Inherited from the reviewed script: `connectionTimeoutMillis 60000`; `statement_timeout`+`query_timeout 5000`; every candidate query `LIMIT 50`; explicit `ROLLBACK`; bounded `client.end()` (5 s `settleWithin` + socket-destroy fallback); fail-closed `process.exitCode=1`, success only after clean cleanup; no `process.exit()`.

## 7. Failure recovery for partial creation (requirement 15)

- If `CREATE ROLE` succeeds but a `GRANT` fails: the role exists with **no useful privilege** (safe) — teardown = `DROP ROLE`.
- If `VALID UNTIL` was omitted: the role could linger loginable — teardown MUST be run; the checklist re-verifies the role is gone.
- Teardown is idempotent (`DROP ROLE IF EXISTS`), so a partial or repeated run converges to "role absent."

## 8. Audit evidence safe to retain (requirement 16)

Role name; creation + expiry + deletion timestamps; the exact grant statements (they contain no secret); the script digest; the sanitized inspection output (ids/labels/booleans/enums/timestamps only, per the script contract); the compute wake/idle + cost delta. **Never retained:** the role password, the full `INSPECT_DATABASE_URL`, any connection string, any PIN value/ciphertext, any email/phone/PII.

## 9. Stop conditions (requirement 17)

STOP (do not proceed / abort) if: the endpoint/db is not the confirmed staging target or any production identifier appears; the granted privileges are anything beyond the §2 read set (broader SELECT, any write/DDL/sequence/function/ownership); `default_transaction_read_only` cannot be set or `SHOW transaction_read_only` ≠ `on`; a prohibited identity (Karaara / My Kerala / Covelum / `customer@redeemo.com`) is the only candidate; the script digest ≠ the pinned value; the compute cannot return to idle or cost approaches the $20 limit; any prompt for the role password to be shared.

## 10. Provenance boundary (requirement 18)

The inspection **only lists candidates**. `isTestData`, names, timestamps, and denylist-absence are insufficient — individually or together. A candidate becomes a P9 fixture ONLY after independent creation evidence OR explicit owner attestation + exact identity + dedicated-to-testing confirmation + known-PIN handling (no PIN revealed) + accepted retain-and-label. Absent that ⇒ **NO CANDIDATE, P9 REMAINS BLOCKED.**

## 11. Separation from P1b / migrations / R1 / runtime (requirement 19, 20)

This role and its credential are used **exclusively** for the Option-3 read-only inspection. It is NOT `DATABASE_URL` (pooled runtime read-write), NOT `MIGRATION_DATABASE_URL` (write-capable migrations / P1b / R1), and NOT `TEST_DATABASE_URL` (local loopback). It performs no migration, no schema change, and does not advance P1b or R1. It shares nothing with those credentials beyond the physical staging database it reads.

---

## Cross-check table (spec ↔ source ↔ requirement)

| Requirement | Design element | Source anchor |
|---|---|---|
| 1 staging-only login role | §3 role def | Neon staging `neondb` (P1a §13.3.1) |
| 2 no production access | §3.3 CONNECT on `neondb` only; §9 prod-identifier stop | r1 §13.3.1 |
| 3 exact permissions | §2 read set + §3.3 column grants | `option3-inspection.mjs` (digest §1) |
| 4 no blanket SELECT | §2/§3.3 column-scoped only | script queries |
| 5 no write/DDL/seq/func/owner | §3.3 explicit not-granted | — |
| 6 safe attributes | §3.1 | PostgreSQL role attrs |
| 7 default_transaction_read_only | §3.2 | ALTER ROLE SET |
| 8 CONNECT + schema USAGE | §3.3 | — |
| 9 existing vs future objects | §3.4 no ALTER DEFAULT PRIVILEGES | — |
| 10 credential injection/containment | §D5 + plan | security log pattern |
| 11 pooled vs direct | §4 direct recommended | P1a pooled finding; PgBouncer caveat |
| 12 read-only verification no write | §5 | script `SHOW transaction_read_only` |
| 13 bounded conn/query/cleanup | §6 | script (Opus-reviewed) |
| 14 expiry/revoke/delete | §3.5 | `VALID UNTIL` + DROP ROLE |
| 15 partial-creation recovery | §7 | idempotent teardown |
| 16 safe audit evidence | §8 | — |
| 17 stop conditions | §9 | — |
| 18 discovery ≠ provenance | §10 | r1 P9 row |
| 19 separation from P1b/R1/runtime | §11 | security log |
| 20 no DATABASE_URL/MIGRATION/TEST substitute | §11 | `.env.example`; runbook credential names |

---

## Owner-decision register (nothing here is pre-approved)

- **D1 — Create the temporary role at all?** (Recommended: yes, as the minimal unblock for Option 3.) — OPEN
- **D2 — Exact role lifetime / `VALID UNTIL`.** (Recommended: ≤ 24 h.) — OPEN
- **D3 — `redemptionPin` exposure model:** (a) grant the column, accept ciphertext-only (no key ⇒ no plaintext) — **the ONLY option runnable against the currently-pinned script digest `d673…`**; (b) drop `pinConfigured` from the script so the column is never granted; **(c, recommended for zero ciphertext exposure) a read-only view `public.inspect_branch_pin` (owned by `neondb_owner`, non-`security_invoker`) exposing only `(redemptionPin IS NOT NULL) AS pin_configured`**, granting SELECT on the view so the role never receives even ciphertext. **Both (b) and (c) require a script edit → a new SHA-256 that must be re-pinned (§1) and re-reviewed before execution.** — OPEN
- **D4 — Endpoint:** direct (recommended, session determinism) vs pooled. — OPEN
- **D5 — Who creates + deletes the role, and the credential-injection method** (recommended: owner creates/deletes in the Neon SQL editor; password never shown to Claude; injected via `read -s INSPECT_DATABASE_URL` into a fresh operator terminal; cleared after). — OPEN
- **D6 — May Option 3 wake staging compute?** (The read connection unavoidably wakes it; cost ~cents within the $20 limit.) — OPEN
- **D7 — Retain or remove the auto-deploy-session Playwright snapshots** (see the plan's artifact inventory; they are gitignored, owner-local, contain no secrets/variables/logs). — OPEN
- **D-Neon — Confirm from current Neon/PostgreSQL docs** (browsing allowed; no MCP/provider access): that a custom SQL-created `LOGIN` role with column-level grants + `ALTER ROLE ... SET default_transaction_read_only` behaves as standard Postgres on Neon, and the exact `DROP ROLE` prerequisites. — OPEN

---

## Rollback / revocation checklist (owner-run, at teardown)

1. Confirm the inspection is complete (or aborted) and the sanitized output recorded.
2. In the Neon SQL editor (staging), run the teardown block: `REVOKE ALL ... FROM <role>` on the granted objects → `DROP OWNED BY <role>` → `DROP ROLE IF EXISTS <role>` (and drop the §D3(c) view if created).
3. Read-only verify the role is gone (`SELECT 1 FROM pg_roles WHERE rolname='<role>'` returns no row).
4. Unset `INSPECT_DATABASE_URL` and clear the terminal/clipboard in the operator session.
5. Confirm staging compute returns to Idle (~10 min) and record the cost delta.
6. If any step fails or the role persists, STOP and re-run teardown; do not leave a loginable role.
7. Append the teardown result to the security execution log.
