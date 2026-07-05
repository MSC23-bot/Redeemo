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

### 3.0 Secret-safe fail-closed activation sequence (Corrections 1 + 4 — SQL-created NOLOGIN → verify → psql `\password` → LOGIN)

**Creation channel is MANDATORY: plain SQL `CREATE ROLE` only — NEVER the Neon Console, CLI, or API.** Official Neon docs: *"roles created in the Neon Console, API, and CLI are granted membership in the `neon_superuser` role"*, whereas *"Roles created with SQL from clients like psql, pgAdmin, or the Neon SQL Editor are only granted the basic public schema privileges granted to newly created roles in a standalone Postgres installation"* (§14) — i.e. NOT members of `neon_superuser`. **The Neon SQL Editor is itself a SQL-creation path** (not the Console *Roles* UI / API), so D5's owner-run `CREATE ROLE` in the web SQL Editor lands the role in the safe standalone-privilege bucket. A Console/CLI/API-created role would instead be an **admin** role — categorically incompatible with a least-privilege inspection role. So this role is **only ever** a SQL-created NOLOGIN role with standalone-Postgres privileges.

**Operator surfaces + lifecycle states (Correction 4):** provisioning state = **NOLOGIN**; final temporary state = **LOGIN** (only after the password is set AND all verification passes); teardown returns to **role absent**. Two surfaces, named honestly: the **Neon web SQL Editor** runs the non-secret SQL (CREATE/GRANT/verify/teardown); a **local `psql` client** performs the one secret-safe step (`\password`). **No plaintext password ever appears in SQL, argv, shell history, chat, screenshots, or logs.**

**No password ever appears in submitted SQL text.** A `CREATE ROLE ... PASSWORD '...'` / `ALTER ROLE ... PASSWORD '...'` literal would land the plaintext in the SQL-editor query history / server log — prohibited. The role is **born NOLOGIN and password-less**, hardened + verified, then given a password via psql's client-side-encrypting `\password`, and only then flipped to LOGIN:

1. **`CREATE ROLE <role> NOLOGIN` with NO `PASSWORD`** and the safe attributes (§3.1). It cannot authenticate at all during provisioning.
2. Apply **only** the reviewed grants (§3.3) and the read-only GUC (§3.2). If **any** statement errors, STOP immediately and run the full teardown (§3.5/§7) — do not proceed to step 5.
3. **Verify** every attribute + grant read-only (§5 / plan Phase 4) — including the ownership-zero + creator-authority proofs (§13). STOP on any deviation.
4. **Set the password via `psql \password <role>`** — psql *"encrypts it, and sends it to the server as an `ALTER ROLE` command … so the new password does not appear in cleartext in the command history, the server log, or elsewhere"* (PostgreSQL docs, §14). The plaintext never leaves the operator's client. The password must meet Neon's **≥ 60-bit entropy (≥ 12 chars)** rule (§14). `\password` works on a NOLOGIN role (it only sets the verifier). **`\password` is a psql CLIENT meta-command — it MUST be run from a local `psql` session, NOT the Neon web SQL editor** (the web editor runs SQL statements only; its only SQL-statement equivalent is the *prohibited* plaintext `ALTER ROLE ... PASSWORD '...'` literal). (The read-only verification of §5/§13 is plain SQL and runs in the web editor via `pg_roles`/`information_schema` — only the password step is psql-only.)
5. **`ALTER ROLE <role> LOGIN;`** — enable authentication **only after** steps 2–4 all pass.
6. **If a local `psql` `\password` flow (or another separately reviewed non-privileged, non-plaintext mechanism against a SQL-created role) is unavailable, STOP and TEAR DOWN the NOLOGIN role** (§7). **Never** fall back to a plaintext `PASSWORD '...'` literal, and **never** create this inspection role through the Neon Console / CLI / API (those grant `neon_superuser`).

The privileged operator credential (the owner's existing `neondb_owner`/`neon_superuser` connection used to run the CREATE/GRANT/teardown SQL and the `psql \password` step) is the owner's own Neon credential; it is opened by the owner in their own SQL-editor + psql sessions and is **never** shared with Claude, printed, or logged. It is closed/cleared at the end of the session.

### 3.0.1 Collision-safe role name (Correction 3)
`<role>` MUST be a **unique, sanitized, session-specific** name (e.g. `insp_ro_<YYYYMMDD>_<short-random>`, matching `^[a-z0-9_]+$`) — **never a generic reusable name** (not `inspector`, not `readonly`). Before `CREATE ROLE`, run a **read-only preflight proving the exact name is absent**: `SELECT 1 FROM pg_roles WHERE rolname='<role>';` must return **no row** (STOP if it returns a row — the name is taken). A `CREATE ROLE` failure does **not** prove the role is absent (it may mean the name already exists): after any CREATE failure, **re-check `pg_roles`**; **if a role with that name exists unexpectedly, STOP and report** — **never** automatically `ALTER`/`REVOKE`/`DROP` a pre-existing role you did not create (it could be an owner/production role). Choosing a fresh name is only permitted in a **separately-adjudicated retry**, never silently in-loop.

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

## 7. Failure recovery for partial creation (requirement 15 — Correction 2, corrected 2026-07-05)

**The earlier claim that a failed GRANT leaves the role with "no useful privilege" was FALSE** — earlier grants in the block may already have committed, so a mid-sequence failure can leave the role holding a *partial* set of real SELECT grants. The corrected fail-closed contract:

- **Any statement failure immediately STOPS the sequence.** Never continue applying later grants after an error.
- The role is **NOLOGIN throughout provisioning** (§3.0), so even a partially-granted role cannot authenticate — but it must still be removed, because the partial grants are real.
- **Immediately execute the COMPLETE teardown** (not a partial cleanup): `DROP OWNED BY <role>;` → `DROP ROLE IF EXISTS <role>;` (+ `DROP VIEW IF EXISTS public.inspect_branch_pin;` if D3(c) had created it). `DROP OWNED BY` is required first — see §3.5; **`DROP ROLE` alone is NOT sufficient while any grant remains** (it errors on the dependency).
- **Verify the role is absent** (`SELECT 1 FROM pg_roles WHERE rolname='<role>'` → no row).
- **If teardown itself fails, this is a SECURITY INCIDENT/BLOCKER** — stop, report, and do not continue; a partially-privileged loginable-or-not role must not be left behind.
- Teardown is idempotent (`DROP ... IF EXISTS`), so a repeated run converges to "role absent."

**Per-grant mutation/failure cases** (each ⇒ STOP + full teardown + verify absent):
| Failure point | State reached | Required action |
|---|---|---|
| **name-absence preflight returns a row** (name already exists) | no role created by us | **STOP + report**; do NOT touch the pre-existing role; a fresh unique name only via separately-adjudicated retry (§3.0.1) |
| `CREATE ROLE` fails | **UNKNOWN — may be a name collision, not absence** | **re-check `pg_roles`**: if the exact name now exists and we did NOT just create it ⇒ **STOP + report, never auto-alter/drop**; if it truly does not exist ⇒ nothing to tear down, STOP + report the error |
| a role-attribute / GUC (`ALTER ROLE ... SET`) fails | role exists NOLOGIN, no data grants yet | `DROP OWNED BY` → `DROP ROLE` → verify absent |
| `GRANT CONNECT`/`USAGE` fails | role exists NOLOGIN, minimal grant(s) | full teardown → verify absent |
| the **1st** column `GRANT SELECT` succeeds, the **2nd** fails | role holds 1 real SELECT grant | full teardown (DROP OWNED BY revokes it) → verify absent |
| any later column `GRANT` fails | role holds N partial SELECT grants + schema/db grants | full teardown → verify absent |
| `\password` fails / unavailable (§3.0 step 4) | role hardened+granted but NOLOGIN | either leave NOLOGIN (cannot authenticate) OR tear down; never plaintext-password fallback |
| `ALTER ROLE ... LOGIN` fails | role granted, still NOLOGIN | tear down (cannot use it) → verify absent |

## 8. Audit evidence safe to retain (requirement 16)

Role name; creation + expiry + deletion timestamps; the exact grant statements (they contain no secret); the script digest; the sanitized inspection output (ids/labels/booleans/enums/timestamps only, per the script contract); the compute wake/idle + cost delta. **Never retained:** the role password, the full `INSPECT_DATABASE_URL`, any connection string, any PIN value/ciphertext, any email/phone/PII.

## 9. Stop conditions (requirement 17)

STOP (do not proceed / abort) if: the endpoint/db is not the confirmed staging target or any production identifier appears; the granted privileges are anything beyond the §2 read set (broader SELECT, any write/DDL/sequence/function/ownership); `default_transaction_read_only` cannot be set or `SHOW transaction_read_only` ≠ `on`; a prohibited identity (Karaara / My Kerala / Covelum / `customer@redeemo.com`) is the only candidate; the script digest ≠ the pinned value; the compute cannot return to idle or cost approaches the $20 limit; any prompt for the role password to be shared.

## 10. Provenance boundary (requirement 18)

The inspection **only lists candidates**. `isTestData`, names, timestamps, and denylist-absence are insufficient — individually or together. A candidate becomes a P9 fixture ONLY after independent creation evidence OR explicit owner attestation + exact identity + dedicated-to-testing confirmation + known-PIN handling (no PIN revealed) + accepted retain-and-label. Absent that ⇒ **NO CANDIDATE, P9 REMAINS BLOCKED.**

## 11. Separation from P1b / migrations / R1 / runtime (requirement 19, 20)

This role and its credential are used **exclusively** for the Option-3 read-only inspection. It is NOT `DATABASE_URL` (pooled runtime read-write), NOT `MIGRATION_DATABASE_URL` (write-capable migrations / P1b / R1), and NOT `TEST_DATABASE_URL` (local loopback). It performs no migration, no schema change, and does not advance P1b or R1. It shares nothing with those credentials beyond the physical staging database it reads.

## 12. PUBLIC-function inventory gate (Correction 3 — load-bearing, run BEFORE role activation)

A read-only transaction does **not** make every publicly-executable function harmless (a `SECURITY DEFINER` or side-effecting function could bypass the SELECT-only boundary). Because the PUBLIC baseline (§3.3) confers `EXECUTE` on `public` functions, the owner MUST run this **read-only inventory gate against LIVE staging** (the deployed catalog is authoritative; the repo is only a cross-reference) before enabling LOGIN:

```sql
-- DETERMINISTIC read-only inventory: owner, language, security mode, kind, trigger,
-- PUBLIC EXECUTE, exact schema + identity arguments. (Correction 5.)
SELECT n.nspname                                   AS schema,
       p.proname                                   AS fn,
       pg_get_userbyid(p.proowner)                 AS owner,
       l.lanname                                   AS language,
       p.prosecdef                                 AS security_definer,   -- true = SECURITY DEFINER
       p.prokind                                   AS kind,               -- f=func p=proc a=agg w=window
       (p.prorettype = 'pg_catalog.trigger'::regtype) AS is_trigger,
       has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute,
       pg_get_function_identity_arguments(p.oid)   AS identity_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language  l ON l.oid = p.prolang
 WHERE n.nspname NOT IN ('pg_catalog','information_schema')
 ORDER BY security_definer DESC, public_execute DESC, is_trigger, 1, 2;
```
**Conservative deterministic STOP matrix** (any row hitting a STOP ⇒ do NOT activate the role; adjudicate first):
1. **STOP on every PUBLIC-executable `SECURITY DEFINER` function** — no exceptions.
2. **STOP on every PUBLIC-executable non-trigger function OR procedure** UNLESS it **exactly matches separately-reviewed repository evidence** (same schema + identity_args + owner + security mode + language) AND has been **adjudicated safe**.
3. **STOP on every live function absent from the repository inventory** (`prisma/migrations/**`).
4. **STOP whenever a live function's definition / owner / security attributes differ** from the reviewed repository evidence.

**Metadata alone does NOT prove the absence of external side effects** — a function may write, call `dblink`/`pg_read_file`/extensions, or have a `SECURITY DEFINER` body regardless of how its row looks; the stop rules are conservative for that reason. **Do NOT globally `REVOKE` PUBLIC function privileges** (it would affect every role).

**Repo cross-reference (evidence, NOT authoritative — live staging is authoritative at execution time):** the migrations define exactly ONE function — `enforce_merchant_highlight_cap()` (`prisma/migrations/20260428124838_category_taxonomy/migration.sql:176`), a **plpgsql** function, `RETURNS TRIGGER` (trigger-only), **not** `SECURITY DEFINER` (⇒ `SECURITY INVOKER`), body only `RAISE EXCEPTION` over a cap. **It may pass the gate ONLY if the live row's identity + owner + `SECURITY INVOKER` mode + trigger-only classification all match this reviewed migration** (rule 4). If live shows any other function, a different owner/security mode, or this function altered ⇒ STOP.

## 13. Creator & teardown authority (Correction 5 — verify BEFORE execution, official sources §14)

- **Creating role:** the owner's **`neondb_owner`**, which Neon auto-assigns to **`neon_superuser`** (elevated: create databases/roles, read/write all) — so it holds effective `CREATEROLE`. Per PostgreSQL, `CREATEROLE` lets a role *"create, alter, drop, comment on, and change the security label for other roles"* (§14) — sufficient to create the temp role, run `\password`/`ALTER ROLE ... LOGIN`, and DROP it.
- **Authority over the created role — verify live via EXPLICIT `pg_auth_members` / `neon_superuser`-membership evidence; NEVER infer it from the role name or from "we created it" (Correction 5).** Phase-4 verification MUST prove, read-only, that the operator can administer + drop the temp role, by ONE of: (a) the operator holds an `admin_option` membership over `<role>` in `pg_auth_members` **AND** itself has `rolcreaterole=t` — under PG16 `DROP ROLE` requires CREATEROLE *and* ADMIN OPTION on the target, so `admin_option` alone is necessary-but-not-sufficient (`SELECT m.admin_option, cur.rolcreaterole FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles g ON g.oid=m.member JOIN pg_roles cur ON cur.rolname=current_user WHERE r.rolname='<role>' AND g.rolname=current_user`), OR (b) the operator (`current_user`) is a member of `neon_superuser` (`SELECT pg_has_role(current_user, 'neon_superuser', 'MEMBER')` — which subsumes CREATEROLE + ADMIN OPTION). If **neither** is provably true, **STOP** — do not create a role you cannot later drop.
- **`DROP OWNED BY` + `DROP ROLE` authority:** `DROP OWNED BY <role>` *"drops all the objects … owned by … the specified roles. Any privileges granted to the given roles on objects in the current database or on shared objects (databases, tablespaces, configuration parameters) will also be revoked"* (§14) — this is what revokes the database `CONNECT` and the schema/table grants; it must run **before** `DROP ROLE`, because *"any objects owned by the role must first be dropped or reassigned … and any permissions granted to the role must be revoked"* (§14). The operator must be a member of the temp role (or superuser-equivalent) to run `DROP OWNED BY` — satisfied by `neon_superuser` / the CREATEROLE-creator membership above.
- **Teardown handles the database `CONNECT` and role-level settings:** `DROP OWNED BY` revokes the shared-object `CONNECT`; the role-level `ALTER ROLE ... SET default_transaction_read_only` and `VALID UNTIL` are role attributes that vanish with `DROP ROLE`. Nothing lingers.
- **Ownership-zero proof (required before `DROP OWNED BY`, so its semantics are exactly "revoke-only"):** confirm the temp role owns no objects — e.g. `SELECT 1 FROM pg_class WHERE relowner = (SELECT oid FROM pg_roles WHERE rolname='<role>') LIMIT 1;` (and the analogous `pg_namespace`/`pg_proc` checks) return no rows. The §D3(c) view is owned by `neondb_owner`, not the temp role, so it is dropped separately.

## 14. Official documentation sources (verified 2026-07-05; browsing only, no MCP/provider access)

- PostgreSQL `psql \password` (client-side encrypt; no cleartext in history/log): https://www.postgresql.org/docs/current/app-psql.html
- PostgreSQL `DROP OWNED BY` (revokes grants incl. shared-object database privileges): https://www.postgresql.org/docs/current/sql-drop-owned.html
- PostgreSQL role removal (`REASSIGN OWNED` + `DROP OWNED` before `DROP ROLE`): https://www.postgresql.org/docs/current/role-removal.html
- PostgreSQL `CREATE ROLE` / `CREATEROLE` (create/alter/drop other roles): https://www.postgresql.org/docs/current/sql-createrole.html
- Neon Manage roles (SQL `CREATE ROLE`, `neondb_owner`→`neon_superuser`, ≥60-bit password, standard `DROP ROLE`): https://neon.com/docs/manage/roles — **verified quotes (Correction 1, current-verbatim 2026-07-05):** *"roles created in the Neon Console, API, and CLI are granted membership in the `neon_superuser` role"* vs *"Roles created with SQL from clients like psql, pgAdmin, or the Neon SQL Editor are only granted the basic public schema privileges granted to newly created roles in a standalone Postgres installation."* ⇒ this least-privilege role is **SQL-created only** (the Neon SQL Editor counts as a SQL-creation path); Console/CLI/API creation is prohibited.

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

## Correction cross-check table (PR #380 review round 2 — 2026-07-05)

| # | Correction | Where applied | Official source |
|---|---|---|---|
| 1 | Secret-safe activation: no `PASSWORD '...'` in SQL text; NOLOGIN → verify → `\password` → LOGIN; STOP if no secret-safe mechanism | §3.0; plan Phase 3 | psql `\password` (§14) |
| 2 | Partial-creation = immediate STOP + FULL teardown (not "no useful privilege"); NOLOGIN during provisioning; `DROP ROLE` alone insufficient; per-grant failure cases; teardown-failure = incident | §7 (rewritten) + table; plan Phase 3/8 | `DROP OWNED BY` / role-removal (§14) |
| 3 | PUBLIC-function inventory gate against LIVE staging (PUBLIC EXECUTE / SECURITY DEFINER / non-trigger callable / side-effect; compare vs migrations; STOP if bypass); no global PUBLIC revoke | §12 (new); plan Phase 1 | repo `…category_taxonomy/migration.sql:176` (cross-ref) |
| 4 | Zero-email projection owner decision, paired with zero-ciphertext PIN; either ⇒ edit script → new digest → re-derive matrix → fresh Opus+Codex review; script unchanged now | §2 email note; §D8; §D3 | — |
| 5 | Creator/teardown authority: neondb_owner→neon_superuser CREATEROLE; verify admin membership live; DROP OWNED BY handles db CONNECT + role settings; ownership-zero proof | §13 (new); plan Phase 4 | Neon roles; PG CREATE ROLE / DROP OWNED (§14) |

## Owner-decision register (nothing here is pre-approved)

- **D1 — Create the temporary role at all?** (Recommended: yes, as the minimal unblock for Option 3.) — OPEN
- **D2 — Exact role lifetime / `VALID UNTIL`.** (Recommended: ≤ 24 h.) — OPEN
- **D3 — `redemptionPin` exposure model:** (a) grant the column, accept ciphertext-only (no key ⇒ no plaintext) — **the ONLY option runnable against the currently-pinned script digest `d673…`**; (b) drop `pinConfigured` from the script so the column is never granted; **(c, recommended for zero ciphertext exposure) a read-only view `public.inspect_branch_pin` (owned by `neondb_owner`, non-`security_invoker`) exposing only `(redemptionPin IS NOT NULL) AS pin_configured`**, granting SELECT on the view so the role never receives even ciphertext. **Both (b) and (c) require a script edit → a new SHA-256 that must be re-pinned (§1) and re-reviewed before execution.** — OPEN
- **D4 — Endpoint:** direct (recommended, session determinism) vs pooled. — OPEN
- **D5 — Who creates + deletes the role, on which surfaces, and the credential-injection method (both surfaces named honestly):** the **owner** creates/verifies/deletes the role by running the non-secret SQL in the **Neon web SQL Editor**, and performs the secret-safe `\password` step from a **local `psql` client** (the web editor cannot run `\password`; the role is NEVER created via Console/CLI/API — §3.0). The role password is never shown to Claude; the resulting `INSPECT_DATABASE_URL` is injected via `read -s INSPECT_DATABASE_URL` into a fresh operator terminal and cleared after. — OPEN
- **D6 — May Option 3 wake staging compute?** (The read connection unavoidably wakes it; cost ~cents within the $20 limit.) — OPEN
- **D7 — Retain or remove the auto-deploy-session Playwright snapshots** (see the plan's artifact inventory; they are gitignored, owner-local, contain no secrets/variables/logs). — OPEN
- **D8 — Eliminate the ad-hoc customer-email read capability** via a tightly-scoped owner-owned **zero-email eligibility projection** (a view/boolean exposing only the exclusion result, so `User.email` is never grantable to the inspection role). **Recommended pairing:** adopt D8 **together with** D3(c) (zero-ciphertext PIN projection) so the role reads neither raw email nor PIN ciphertext. **BLOCKING:** the resolved **D3 + D8 combination determines** whether temporary safe projections are created, the exact inspection script, the new SHA-256 (if changed), the exact grant matrix, and the required fresh Opus + Codex review. **No role may be created while D3 OR D8 remains open.** If either projection is selected, the script MUST be edited → new SHA-256 → grant matrix re-derived → fresh Opus AND Codex review, BEFORE execution. The current script is **not** changed now. — OPEN
- **D-Neon — Confirm from current Neon/PostgreSQL docs** (browsing allowed; no MCP/provider access): that a custom SQL-created `LOGIN` role with column-level grants + `ALTER ROLE ... SET default_transaction_read_only` behaves as standard Postgres on Neon, and the exact `DROP ROLE` prerequisites. — OPEN

---

## Rollback / revocation checklist (owner-run, at teardown)

1. Confirm the inspection is complete (or aborted) and the sanitized output recorded.
2. Run the teardown block: `DROP OWNED BY <role>` (the required grant-revoker — it revokes ALL grants incl. the shared-object database `CONNECT`) → `DROP VIEW IF EXISTS public.inspect_branch_pin` (if D3(c) created it) → `DROP ROLE IF EXISTS <role>`. (An explicit `REVOKE ALL` first is optional belt-and-suspenders; `DROP OWNED BY` alone is sufficient.) Note the password step used psql `\password`, but `DROP OWNED BY`/`DROP ROLE`/`DROP VIEW` are plain SQL and run in the Neon web editor or psql.
3. Read-only verify the role is gone (`SELECT 1 FROM pg_roles WHERE rolname='<role>'` returns no row).
4. Unset `INSPECT_DATABASE_URL` and clear the terminal/clipboard in the operator session.
5. Confirm staging compute returns to Idle (~10 min) and record the cost delta.
6. If any step fails or the role persists, STOP and re-run teardown; do not leave a loginable role.
7. Append the teardown result to the security execution log.
