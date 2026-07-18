# Migration Readiness Packet: Staging First (rev 2026-07-19)

> STATUS: PREPARATION-ONLY / OWNER-APPROVAL-PENDING. Nothing here has been applied, deployed or
> mutated. All database reads were read-only SELECTs via the `neon-observer` MCP; no write, no
> `prisma migrate`, no deploy, no snapshot, no provider/secret change was executed. Supersedes the
> framing of `2026-07-15-six-packet-migration-window-packet.md` (retained as evidence). Opaque Neon
> org/project/branch IDs are console-resolved placeholders (`<NEON_ORG_ID>`, `<NEON_PROJECT_ID>`,
> `<STAGING_BRANCH_ID>`, `<PRODUCTION_BRANCH_ID>`); this repo is public. Prepared by Fable 5 with
> adversarial (Opus 4.8) + mechanical (Sonnet 5) review; every figure independently reverified by
> the lead. **rev 2026-07-19** corrects six Codex-verified issues: executable Window A, Neon
> child-branch recovery, a genuinely fail-closed preflight, disposable-fixture probes, a truthful
> downtime/lock posture, and whitespace.

---

## 0. Owner summary (plain English)

We want to bring the six pending database changes to staging safely, then plan production separately.

- **Staging** is 6 migrations behind; all 6 are purely *additive* (new tables, columns, enum values).
  Applied in order, with a backup branch of staging taken first, this is a low-risk change.
- **Golden rule:** finish and verify ALL migrations before deploying the new backend. The new backend
  reads/writes the new tables; against a half-migrated database, customer account deletion and
  merchant contract signing break. Database first, code second.
- **One trap:** a migration adds three mandatory columns to a brand-new table. Safe only while that
  table is empty. The golden rule closes this (no backend writes a row in between).
- **Staging recovery needs your decision (a fork).** Staging is a *child* branch, and Neon's two
  in-place recovery tools (point-in-time restore and Snapshots) both work only on *root* branches, so
  neither can be used on staging. Production (a root branch) is fine. For staging we always take a
  backup *branch* first (that IS allowed), then recover either by restoring staging from it in place
  or by rebuilding from it; a mandatory pre-window rehearsal on a throwaway copy proves which works
  before we rely on it. Details in Part 3.8; decision in Part 10.
- **Production is a separate, bigger decision** (11 migrations). We recommend two smaller windows, and
  Window A now has an exact, Prisma-native mechanism (details in Part 4).
- **Honest downtime posture:** no planned downtime, but brief database locks are possible on a few
  existing tables while the DDL runs; we add lock timeouts, monitoring and stop criteria.

Nothing here has been executed. It is ready for review and your approval.

---

## 1. Verified current state (read-only, 2026-07-18/19)

### 1.1 Candidate
- `origin/main` HEAD = **`edfc2a1e68f7a8642c7d858675b0529c8e311042`** (PR #537). Candidate for the
  coupled backend/worker deploy. `git diff d95e70cf..edfc2a1e` touches no `prisma/migrations/**` or
  `schema.prisma`: same migration set; it added the dormant evidence UI + evidence-**read** backend
  routes. **Backend and admin-web must deploy from the SAME SHA `edfc2a1e`** (else the evidence
  routes 404 if the UI flag is ever enabled). Repo migration count: **63**. Open PRs touching
  migrations/schema: **0**. Stale branch `chore/fix-auth-followups` is benign (April-2026, ~1789
  commits behind, zero overlap).

### 1.2 Live database posture (neon-observer, read-only)
Project `<NEON_PROJECT_ID>` (Redeemo, aws-eu-west-2, PG16).

| Environment | Branch | Applied | Pending | Unfinished | Rolled back | PITR (instant restore) |
|---|---|---|---|---|---|---|
| **Staging** | `<STAGING_BRANCH_ID>` (name `staging`, **CHILD of production**) | **57** | **6** (packets) | 0 | 0 | **NOT available (child branch)** |
| **Production** | `<PRODUCTION_BRANCH_ID>` (name `production`, **root/primary/default**) | **52** | **11** | 0 | 0 | available (root) |

- Both branches `protected: false` (no Neon branch protection).
- Staging compute: one read-write endpoint `<STAGING_DIRECT_ENDPOINT>` (direct + `-pooler` hosts;
  scale-to-zero). A recovery that keeps this endpoint stable avoids any connection-string change.
- **No drift.** Staging 60 public tables, none of the 6 packet tables exist. Production 58 tables;
  `VoucherPendingEdit` / `Branch.googlePlaceId` / `LocationConfidence.MERCHANT_CONFIRMED` absent,
  matching the pending set.
- **Checksum verification (read-only):** Prisma `checksum` = sha256(migration.sql). All 63 repo
  checksums computed; staging spot 7/7, production sample 8/8, and **all 57 files at the Window-A
  anchor `fa92b690` are byte-identical to `edfc2a1e` (0 mismatches)**. The complete per-scenario
  check is embedded in the fail-closed preflight (Part 8).

### 1.3 The 11 pending migrations
All additive (full SQL read). Migrations touching an EXISTING populated table are flagged for the
lock posture (Part 5): #2, #3 (`Voucher`,`Merchant`), #4 (`Branch`), #5, #6 (`AdminUser`), #8
(`Merchant`), #9 (`Merchant`). #1, #7, #10, #11 touch only new/empty objects.

| # | Migration | Additive DDL | Pending on |
|---|---|---|---|
| 1 | `20260629000000_keyring_fingerprint` | new table + index | production |
| 2 | `20260702000000_maintenance_alert_types` | `NotificationType` +2 enum values | production |
| 3 | `20260707135148_voucher_governed_flows` | new type; 2 enum adds; new table `VoucherPendingEdit` + FK to Voucher/Merchant | production |
| 4 | `20260709095646_branch_google_place_id` | `Branch.googlePlaceId` nullable TEXT | production |
| 5 | `20260709190638_branch_merchant_confirmed_confidence` | `LocationConfidence` +1 enum value | production |
| 6 | `20260710000000_admin_capability_grants_field_role` | `AdminRole` +`FIELD`; new table + FK to AdminUser | staging + production |
| 7 | `20260712000000_merchant_lead_packet` | new leaf table `MerchantLead` (no FK) | staging + production |
| 8 | `20260713000000_merchant_note_packet` | new tables + FK to Merchant | staging + production |
| 9 | `20260714000000_d65_merchant_agreement_record` | new leaf table `MerchantAgreementRecord` + FK to Merchant | staging + production |
| 10 | `20260714210000_customer_invite_referral_packet` | 3 new tables, **zero FK constraints** | staging + production |
| 11 | `20260715000000_d65_agreement_reviewed_body` | `MerchantAgreementRecord` +3 columns NOT NULL, no default | staging + production |

On PG16, `ALTER TYPE ... ADD VALUE` runs in a transaction and no migration uses a new enum value in
its own file. All indexes are on new/empty tables. #11 is empty-table-only safe (Finding F2).

---

## 2. Key findings that shape the plan (adjudicated)

- **F1 candidate SHA:** re-pin to `edfc2a1e`; backend + admin-web same SHA.
- **F2 partial-apply trap:** #11 adds NOT-NULL-no-default columns to the table #9 creates. Safe only
  while empty. **Hard gate: `migrate deploy` reaches 63 / zero-unfinished and is verified BEFORE any
  backend deploy.** If migrate fails mid-run, do not deploy; resolve to 63 or recover via Part 3.8
  (staging) / the production Snapshot (Part 4).
- **F3 staging recovery is an owner fork** (Part 3.8). Staging is a child branch, so BOTH PITR and
  Snapshot-create are root-only-blocked; recovery is a backup branch + a rehearsal-proven restore or
  rebuild. Production (root) uses Snapshot + PITR normally.
- **F5 deploy ordering:** worker env complete (lead flag false) -> migrate to 63 + verify -> deploy
  backend+worker `edfc2a1e` -> flip lead flag true after `MerchantLead` confirmed.
- **F6 production split** into two windows (Part 4), Window A now executable (Part 4.1).
- **Cleanup gaps (new, Part 6.2):** a D65-signed probe merchant cannot be deleted by the existing
  fixture-sweep (FK `onDelete: Restrict` on `MerchantAgreementRecord`), and the signed PDF leaves an
  orphaned R2 object. Probe cleanup must handle both.

---

## 3. STAGING execution sequence

Target: staging `<STAGING_BRANCH_ID>`, applying the **6 packets** to reach 63, then deploying the
coupled backend/worker at `edfc2a1e`. Owner-executed; every step owner-gated.

### 3.1 Preconditions
1. Candidate frozen at `edfc2a1e`; backend AND admin-web deploy from it.
2. **DIRECT endpoint** (staging `<STAGING_DIRECT_ENDPOINT>`, non-`-pooler`) as a separately-injected
   credential in the operator shell. Never migrate through the pooled endpoint (advisory-lock P1001).
3. Worker env complete: ALL `MAINTENANCE_*` vars present/valid (fail-closed scheduler) with
   `MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED=false`. Redis reachable. `STORAGE_ENABLED` state known.
4. Railway does not auto-run `migrate deploy` on deploy (operator-driven from the DIRECT host).
5. **Fail-closed preflight passes** (Part 8): `-v scenario=staging_pre` must print `PREFLIGHT PASS`
   (applied 57, exactly the 6 packets pending, 0 unfinished, 0 rolled-back, no checksum drift, packet
   tables absent). Any deviation aborts with a non-zero exit: STOP.
6. Confirm branch create/restore is usable (the staging recovery fork, Part 3.8): `neon branches list`
   succeeds and the operator can create a throwaway branch for the 3.2 rehearsal. (Production windows
   additionally use Snapshots, which are root-only and therefore fine on production.)

### 3.2 Backup / restore point (staging is a CHILD branch: see the recovery fork, Part 3.8)
**Constraint (verified in Neon docs):** staging is a child of production. Neon's two in-place recovery
primitives are BOTH root-branch-only: instant restore / PITR ("only supported for root branches") and
manual **Snapshot creation** ("Create snapshots manually, on root branches only"). Neither can be used
on staging directly. So staging recovery is NOT a settled snapshot/PITR restore; it is the owner fork
in Part 3.8, and the backup below is a plain copy-on-write branch (which IS allowed on a child).

7. **Create a backup branch of staging at HEAD** (copy-on-write; allowed on any branch):
   `neon branches create --parent <STAGING_BRANCH_ID> --name staging-prewindow-<date>`. This preserves
   staging's exact pre-window state (57 migrations, all data). Record: backup branch id, staging LSN,
   timestamp. This is the guaranteed data-preservation step; the *restore* path is the fork (Part 3.8).
8. **Mandatory recovery rehearsal (owner-executed, resolves the fork before the real window):** on a
   THROWAWAY copy, not staging: `neon branches create --parent <STAGING_BRANCH_ID> --name rehearsal`;
   apply the 6 packets to `rehearsal` (disposable); then exercise the chosen recovery path (Part 3.8)
   on `rehearsal` and record what actually happens to its branch id, endpoint and connection string;
   run the preflight `-v scenario=staging_pre` to confirm it returns to 57 applied / packet tables
   absent; delete `rehearsal`. If in-place restore does not cleanly return a child branch with a stable
   connection, the fallback (rebuild) is used for the real window. (All branch create/apply/restore/
   delete here are owner-gated; not executed by this packet.)
9. Confirm no automation performs `reset_from_parent` / branch-delete on staging during the window
   (`protected:false`). Consider enabling branch protection for the window.

### 3.3 Apply migrations (database first, F2 hard gate)
10. Recommended: set migration timeouts per Part 5 (dedicated role, or capture-then-set-then-RESTORE
    on the shared role; never leave persistent `ALTER ROLE` settings behind), so a DDL statement
    queued behind a stuck transaction fails fast (SQLSTATE 55P03) instead of hanging. Record capture
    + restore verification in the window log.
11. From the DIRECT-endpoint operator shell at `edfc2a1e`, deterministic toolchain (as Part 4.1 step
    4: in-tree `npm ci`, then the LOCAL binary): `node_modules/.bin/prisma migrate deploy` -> applies
    the 6 pending packets in timestamp order. (Lockfile pins Prisma 7.8.0.)
12. **VERIFY with the fail-closed preflight `-v scenario=staging_post`:** must PASS (applied 63, 0
    pending, 0 unfinished, 0 rolled-back, no drift, packet tables present, D65 columns NOT NULL).
    **STOP CONDITION (F2):** any failure or unfinished>0 -> do NOT deploy the backend; resolve to 63
    or recover via the staging fork (3.6 / 3.8).

### 3.4 Deploy the coupled backend + worker (only after `staging_post` PASS)
13. Deploy backend + worker at `edfc2a1e` (Railway "Deploy latest commit", SHA-stamped; not
    `railway up` from a worktree). Worker env still has lead flag `false`.
14. Worker boot probe: boots cleanly (env-completeness), BullMQ + scheduler up, zero errors.
15. Flip `MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED=true` (MerchantLead now exists); redeploy/restart
    the worker; confirm the lead-anonymise sweep runs without error on its first cycle.

### 3.5 Behavioural probes
Use only disposable, distinctively-prefixed staging fixtures (Part 6). The account-deletion probe is
GATING. Details, setup, expected records and cleanup in Part 6.

- **D65 sign (write):** a disposable merchant signs -> a `MerchantAgreementRecord` row with
  reviewedBody/reviewedContentHash/pdfHash + `MERCHANT_AGREEMENT_SIGNED_*` audit. No 500. (Needs
  `STORAGE_ENABLED`; writes a real R2 object: cleanup in Part 6.2.)
- **Account deletion / GDPR (GATING):** a disposable customer runs delete-account; the ungated
  `scrubInvitesForUser` reads `MerchantInvite`/`InviteRewardGrant`. A 500 means packet 10 missing ->
  immediate stop. The deletion token is consumed before the transaction, so a failed run needs a fresh
  OTP token (Part 6.1).
- **Evidence read/PDF (dormant UI, backend live):** with an OPERATIONS/SUPER_ADMIN JWT holding
  `contract:view-evidence`, `GET .../agreement/evidence` returns 200 (columns exist); the PDF route
  needs `STORAGE_ENABLED`. The `NEXT_PUBLIC_EVIDENCE_UI_ENABLED` flag is FRONTEND-ONLY and does not
  gate the backend, so probe by curling the route with the JWT (no flag change).
- **Lead sweep + maintenance:** all four sweeps run; no degraded alerts; queue drains; clean soak.

### 3.6 Stop conditions and rollback
- **Immediate STOP** on: migrate failure / unfinished>0; delete-account probe 500; D65 sign probe
  500; worker crash-loop; any preflight mismatch; any lock-timeout error during migrate.
- **Rollback = the staging recovery fork (Part 3.8), pre-proven by the 3.2 rehearsal.** The backup
  branch `staging-prewindow` preserves the pre-window state; recovery either restores staging from it
  in place (if the rehearsal proved that works cleanly for a child) or rebuilds staging from it.
  Verify recovery with the preflight `-v scenario=staging_pre`.
- Writes to staging between the backup and a rollback are lost (expected; staging soak avoids real
  writes). Migrations are additive/forward-only (enum adds irreversible): the backup branch is the
  recovery; there is no down-migration, and PITR is unavailable on this child branch.

### 3.7 When the freeze may end
Once staging is at 63 / zero-unfinished, all 3.5 probes pass, and the release soaks cleanly, the merge
freeze on migration/schema/worker-env paths may lift. Production stays frozen until Part 4. Record the
decision in the window log.

### 3.8 STAGING RECOVERY: OWNER FORK (unsettled read-only; resolved by the 3.2 rehearsal)
Staging is a child branch, so Neon's in-place recovery primitives (PITR, Snapshot-create) are
unavailable on it (Part 3.2). Production is a root branch and does not have this problem (Part 4). The
guaranteed pre-window step is the backup branch `staging-prewindow` (3.2 step 7). The RESTORE path is
a genuine fork because the exact child-branch reset semantics (and connection-string stability) are
not fully documented and cannot be proven read-only:

- **Option A: in-place head-restore from the backup branch.**
  `POST /projects/<proj>/branches/<STAGING_BRANCH_ID>/restore` with body
  `{ "source_branch_id": "<staging-prewindow id>", "preserve_under_name": "staging-failed-<ts>" }`
  (head restore: omit `source_timestamp`/`source_lsn`). Neon docs support head-restore of a branch
  from another branch, and `preserve_under_name` is REQUIRED here because the target has a child (the
  backup). Uncertain read-only: whether this cleanly resets a CHILD target from its own child backup,
  and whether the connection string stays stable. The 3.2 rehearsal must confirm both on a throwaway.
- **Option B (fallback, complete procedure): dump-and-restore INTO the existing staging branch.**
  Real data recovery via standard Postgres tooling, keeping staging's branch id, endpoint and
  connection string unchanged (so NO Railway/backend/worker/consumer repoint is needed):
  1. **Access the backup data:** attach a temporary compute endpoint to `staging-prewindow`
     (owner-gated provider action; Neon allows adding a compute to any branch), or use its
     connection URI if one exists. Credentials: the same project roles apply to all branches; the
     operator uses the injected credential for the backup branch's endpoint. Do not print secrets.
  2. **Dump:** `pg_dump --format=custom --no-owner --no-privileges "<backup DIRECT URI>" -f prewindow.dump`
     (PG16 client, from the operator host). Record dump size + `pg_restore --list` table count.
  3. **Stop writers:** confirm the staging backend/worker are stopped or the window freeze is in
     force (no writes during restore).
  4. **Restore into staging (same endpoint):** `psql "<staging DIRECT URI>" -c 'DROP SCHEMA public
     CASCADE; CREATE SCHEMA public;'` then `pg_restore --no-owner --no-privileges -d "<staging DIRECT
     URI>" prewindow.dump`. This is destructive ONLY to the already-broken post-failure state; the
     authoritative data lives in the dump + the untouched `staging-prewindow` branch.
  5. **Verify success:** preflight `-v scenario=staging_pre` PASSES (57 applied, packet objects
     absent); spot row-counts of key tables match the pre-dump counts recorded in step 2; backend
     boots against staging and serves a smoke request.
  6. **Failed-restore rollback:** if the restore itself fails midway, staging's schema is scratch but
     NOTHING is lost: `staging-prewindow` still holds the authoritative state. Re-run step 4 (the
     dump is re-playable), or escalate to the endpoint-repoint variant below.
  7. **Cleanup + topology restoration:** drop the temporary compute on `staging-prewindow`; KEEP the
     backup branch until the re-run window completes; staging's branch id/endpoint/parentage are
     unchanged throughout, so normal topology needs no restoration.
  - **Variant (only if staging's own endpoint is unusable):** point consumers at the backup branch
    instead: add a compute to `staging-prewindow`, repoint Railway backend + worker `DATABASE_URL`
    (owner provider action) and any operator tooling, verify, and accept that old-staging becomes an
    undeletable parent while its child backup is in service. This is the slower path and changes
    connection strings; use only if the same-endpoint restore is impossible.
  - Option B is "guaranteed" ONLY in the sense that `pg_dump`/`pg_restore` of a test-data-sized
    database is standard, replayable tooling with the source preserved; the 3.2 rehearsal MUST
    exercise it once end-to-end (dump the rehearsal branch, restore into a scratch DB, verify) to
    earn that label for the real window. Until rehearsed, the staging window stays blocked.

**Owner decision (Part 10 item 4):** approve Option A as the primary recovery IF the mandatory 3.2
rehearsal proves it returns a child branch to the correct state with a stable connection; otherwise
Option B is the recovery. This packet does not present Option A as settled.

---

## 4. PRODUCTION plan (separate decision)

Production is 11 behind (5 earlier additive migrations + 6 packets). All additive. **Recommend TWO
windows.** Production is a root branch, so PITR is available in addition to Snapshots; take a Snapshot
regardless as the durable, non-expiring restore point.

### 4.1 Window A: apply the 5 earlier migrations (52 -> 57), no backend deploy (EXECUTABLE mechanism)
`prisma migrate deploy` from `edfc2a1e` would apply all 11. To apply ONLY the 5 earlier first, use the
historical anchor commit (Prisma-native, no manual SQL, no `migrate resolve`):

1. Verified anchor: **`fa92b690aa2aebbe325e93b43b44c516359f1f9b`** (ancestor of `main`; Prisma
   `^7.7.0`, same as `edfc2a1e`). It contains **exactly 57 migration dirs** ending at
   `20260709190638_branch_merchant_confirmed_confidence`; all 6 packets absent. All 57 files are
   byte-identical to `edfc2a1e` (verified 0 mismatches), so no Window-B checksum drift.
2. Preflight `-v scenario=prod_wa_pre` (applied 52, all 11 pending) must PASS. Take the production
   Snapshot (and note PITR is available as a secondary).
3. Use a **fresh detached checkout** of `fa92b690` in a dedicated clean worktree (NOT a pathspec
   checkout: `git checkout fa92b690 -- prisma/migrations` does NOT delete the 6 packet dirs, so the
   tree would still hold 63 and `migrate deploy` would apply all 11, silently defeating the split).
   **Hard filesystem gate before running migrate** (record all in the window log):
   - `git rev-parse HEAD` == `fa92b690aa2aebbe325e93b43b44c516359f1f9b`.
   - `ls -1d prisma/migrations/2026*/ | wc -l` == **57**, and the six packet dirs
     (`20260710000000_*` `20260712000000_*` `20260713000000_*` `20260714000000_*` `20260714210000_*`
     `20260715000000_*`) are ABSENT (`ls prisma/migrations | grep -c 2026071[0-5]0000` == 0), and no
     untracked/stashed migration dir is present (`git status --short prisma/migrations` is empty).
4. **Deterministic toolchain (no implicit downloads):** in the `fa92b690` worktree, install
   dependencies from ITS OWN lockfile per repo policy (in-tree, Node 24): `npm ci`. The anchor
   lockfile pins **Prisma 7.8.0** (verified; `package.json` carries the range `^7.7.0` but the
   lockfile pin governs, and `origin/main`'s lockfile pins the SAME 7.8.0, so both windows run the
   identical engine). Then invoke the LOCAL binary only: `node_modules/.bin/prisma migrate deploy`
   (never bare `npx prisma`, which could fall back to downloading a different version). Record in the
   window log before running: `node -v`, `npm -v`, `node_modules/.bin/prisma --version`.
5. From that checkout, against production's DIRECT endpoint: `node_modules/.bin/prisma migrate deploy`.
   Prisma applies exactly the 5 pending migrations present in the tree (52 -> 57). It first validates
   the 52 already-applied rows' checksums against `fa92b690`'s files (they match: production 52 ==
   repo). The current production backend keeps running: these 5 are backward-compatible.
6. Preflight `-v scenario=prod_wa_post` (applied 57, the 6 packets pending) must PASS.
7. **Return the tree to `edfc2a1e` before Window B and before ANY build/deploy.** Window A does no
   deploy, so the stale `fa92b690` tree is naturally isolated, but Window B must run from `edfc2a1e`
   (its `prod_wb_pre` preflight passes precisely because the 5 earlier files are byte-identical).

### 4.2 Window B: apply the 6 packets (57 -> 63) + deploy the coupled backend/worker at `edfc2a1e`
Same sequence as staging Part 3, after staging has fully proven it. Preflight `prod_wb_pre` ->
`migrate deploy` from `edfc2a1e` (applies the 6 packets; the 5 earlier are byte-identical so no drift)
-> `prod_wb_post` -> deploy backend+worker -> flip lead flag. Blast radius reduced from 11 to 6.

**Why split:** the account-deletion hard dependency means the candidate backend cannot deploy until
packet 10 anyway, so bundling the 5 harmless intervening migrations into the coupled window buys
nothing and enlarges the failure surface. Splitting isolates risk.

**Single-window alternative (if owner prefers):** apply all 11 at once from `edfc2a1e`
(`prod_single_pre` -> migrate deploy -> `prod_single_post`) + coupled deploy. Data-safe, but an
11-migration failure surface and explicit 11-not-6 consent required. Not recommended.

### 4.3 Evidence required from staging before production
Staging at 63/zero-unfinished; all 3.5 probes green (especially the GDPR delete-account probe); worker
stable with lead flag true; no drift; recovery rehearsal proven; clean soak.

---

## 5. Downtime and lock posture (truthful)

**No planned downtime, but not zero-risk.** Every migration is additive and none rewrites an existing
table's storage (no non-null-default backfill, no type change, no `CONCURRENTLY`-needing index on a
populated table). However, several statements take brief locks on EXISTING tables:

- **`Branch.googlePlaceId` ADD COLUMN** (nullable, no default): metadata-only on PG16 (no rewrite),
  but takes a brief `ACCESS EXCLUSIVE` lock on `Branch`.
- **FK `ADD CONSTRAINT`** (#3, #6, #8, #9): takes `SHARE ROW EXCLUSIVE` on BOTH the new (empty)
  referencing table AND the existing referenced table (`Voucher`, `Merchant`, `AdminUser`), which
  **blocks INSERT/UPDATE/DELETE (not SELECT)** on those existing tables for the statement's duration.
  Validation scans 0 rows (referencing table empty), so the hold is near-instant once acquired.
- **Enum `ALTER TYPE ADD VALUE`** (#2, #3, #5, #6): catalog-only, negligible.

**Real exposure:** if a long-running / idle-in-transaction session already holds a conflicting lock on
`Branch`/`Voucher`/`Merchant`/`AdminUser` when `migrate deploy` reaches that statement, the DDL queues,
and subsequent writes queue behind it until the blocker clears. Unbounded without a lock timeout.

**Controls to apply (operator, execution-time):**
- Set timeouts so the DDL fails fast instead of hanging, WITHOUT leaving persistent settings behind.
  In preference order:
  1. **Dedicated migration role** (if one exists / is provisioned): `ALTER ROLE <migration_role> SET
     lock_timeout='5s', statement_timeout='60s'` on a role used ONLY for migrations. No restore
     needed (the settings are the role's job) and the app role is untouched.
  2. **Shared role with capture-and-restore:** BEFORE the window, capture the prior state:
     `SELECT rolname, rolconfig FROM pg_roles WHERE rolname = current_user;` (record `rolconfig` in
     the window log; typically NULL). Set the timeouts, run the window, then RESTORE:
     `ALTER ROLE <role> RESET lock_timeout; ALTER ROLE <role> RESET statement_timeout;` and re-run
     the `pg_roles` query to verify `rolconfig` matches the captured prior state. Both the capture
     and the restore verification go in the window log.
  3. **Session-scoped fallback** (`?options=-c lock_timeout=5000 -c statement_timeout=60000` on the
     migrate connection string): leaves nothing behind by construction, but is NOT verified for
     Prisma 7's engine; if used, verify first on a disposable connection that the settings actually
     apply (e.g. `SHOW lock_timeout` via a test query) before trusting it for the window.
- Monitor from a separate read-only psql session during migrate:
  ```sql
  SELECT pid, wait_event_type, wait_event, state, now()-query_start AS dur, query
  FROM pg_stat_activity WHERE state <> 'idle' ORDER BY dur DESC;
  SELECT relation::regclass, mode, granted, pid FROM pg_locks
  WHERE relation IN ('"Branch"'::regclass,'"Voucher"'::regclass,'"Merchant"'::regclass,'"AdminUser"'::regclass);
  ```
- **Stop criterion:** any `lock_timeout` (55P03) error from `migrate deploy` halts the run (do not
  deploy the backend); investigate the blocking session, then retry.
- **Restore-related interruption:** a recovery restore (Part 3.8 for staging; a Snapshot restore for
  production) briefly interrupts connections to the target (they reconnect; whether the connection
  string is unchanged for the staging child path is exactly what the 3.2 rehearsal confirms).

---

## 6. Behavioural probes: disposable fixtures, authorization, cleanup

**Prohibition: never probe with a real merchant or customer account, and never with the shared
CLAUDE.md dev logins** (`customer@redeemo.com` etc.). The delete-account probe is irreversible for
whatever identity runs it (email permanently rewritten to `deleted_<id>@deleted.redeemo.co.uk`,
password cleared), and reusing a shared fixture would destroy it for every other QA flow.

### 6.1 Setup + authorization
- **Disposable customer:** register a fresh customer directly with a distinctive prefix (e.g.
  `RedeemoProbe-<uuid>@redeemo.dev`; the `redeemo.dev` domain and a prefix are the QA-exclusion
  convention, since there is no `User.isTestData`). Grant a subscription with
  `prisma/grant-dev-subscription.ts` if the probe needs it (edit the email; runs against whatever
  `DATABASE_URL` the shell holds: point it at staging deliberately). Use `prisma/set-auth-state.ts`
  to reach verified state without SMS/email.
- **Disposable merchant:** create via the normal admin create-draft flow with a distinctive prefix.
  Note: it is `isTestData:false` by default; setting `isTestData:true` blocks go-live approval but
  does NOT block the D65 sign probe (sign path ignores `isTestData`), so a test-flagged draft merchant
  is the safest choice.
- **Auth:** D65 assisted sign needs `merchant:sign-agreement` (OPERATIONS/FIELD/SUPER_ADMIN). Evidence
  read needs `contract:view-evidence` (OPERATIONS/SUPER_ADMIN). Use a disposable admin session; probe
  the evidence routes by curling with the admin JWT (the UI flag is frontend-only).

### 6.2 Expected records + cleanup (two gaps to handle)
- **D65 sign** writes a `MerchantAgreementRecord` row (draft-watermarked PDF) + a
  `MERCHANT_AGREEMENT_SIGNED_*` audit row, and **a real object in the private R2 document bucket**
  (`document/<merchantId>/<random>.pdf`).
- **Account deletion** anonymises the customer `User` (row RETAINED by design: `status=DELETED`, PII
  scrubbed) and scrubs invite rows. The anonymised row is permanent (audit trail) and not removable.
- **Cleanup prerequisite (BUILT + TESTED; do not improvise during the window):**
  `prisma/cleanup-agreement-probe.ts` (in this PR) closes both gaps:
  1. `MerchantAgreementRecord.merchant` is `onDelete: Restrict` and no pre-existing script deletes
     agreement rows: the script deletes them for prefix-matched probe merchants only, unblocking the
     normal fixture sweep.
  2. The signed PDF is a real R2 object and `pdfKey` is never API-exposed: the script captures each
     row's `pdfKey` BEFORE deletion and (with `--apply --delete-r2` + R2 env) deletes the objects,
     or prints the keys for manual removal.
  Safety: dry-run by default; `--prefix` required (>= 8 chars, LIKE-escaped); refuses > `--max`
  (default 5) matches; deletes NOTHING but agreement rows/objects. **Tested end-to-end on the
  disposable local PG (63-state schema):** FK-restrict block demonstrated live, dry-run deletes
  nothing, apply removes only the probe merchant's row (a co-seeded non-probe row untouched),
  merchant delete unblocked afterward, short-prefix and missing-DATABASE_URL guardrails exit
  non-zero. R2 deletion is exercised at the staging rehearsal (needs R2 env; not testable locally).
- Run probe cleanup only after the window succeeds; keep the disposable prefix so the sweep is
  targeted. The anonymised probe customer residue is expected and left in place.

---

## 7. Freeze and dependency analysis
Freeze during any window: seed commands (`prisma/seed*.ts`, `npx prisma db seed`), all write-capable
`prisma/*.ts` (tracked + the 12 untracked local), and merges to `main` touching `prisma/**` /
`env.ts` / worker boot. Dependency chain: #11 after #9 with zero rows between (F2); #10 before the
candidate backend serves account-deletion; #4+#6 (packets 4+6) before D65 sign/evidence; #7 before
lead-flag true; worker `MAINTENANCE_*` complete before boot.

## 8. Fail-closed preflight (`docs/runbooks/migration-preflight-checks.sql`)
No persistent target mutation (it CREATEs session-local TEMP tables inside a rolled-back transaction,
so it is not literally "SELECT only"); **fail-closed**: `\set ON_ERROR_STOP on` + `RAISE EXCEPTION`,
so psql exits non-zero and blocks the operator's script. Embeds all 63 repo checksums and the COMPLETE
schema-object inventory extracted from the actual migration SQL, and verifies both directly (not
relying on `prisma migrate status`).

**Every scenario asserts its exact claimed state: the migration ledger AND the schema objects that
must be PRESENT and those that must still be ABSENT** ("earlier5" = the 5 migrations
20260629..20260709190638; "packets" = the 6 migrations 20260710..20260715):

| scenario | applied | pending | earlier5 objects | packet objects |
|---|---|---|---|---|
| `staging_pre` | 57 | the 6 packets | PRESENT | ABSENT |
| `staging_post` | 63 | none | PRESENT | PRESENT |
| `prod_wa_pre` | 52 | all 11 | ABSENT | ABSENT |
| `prod_wa_post` | 57 | the 6 packets | PRESENT | ABSENT |
| `prod_wb_pre` | 57 | the 6 packets | PRESENT | ABSENT |
| `prod_wb_post` | 63 | none | PRESENT | PRESENT |
| `prod_single_pre` | 52 | all 11 | ABSENT | ABSENT |
| `prod_single_post` | 63 | none | PRESENT | PRESENT |

Object assertions per group: tables by name WITH exact per-table column counts (earlier5:
KeyringFingerprint 6, VoucherPendingEdit 11; packets: AdminCapabilityGrant 7, MerchantLead 18,
MerchantNote 11, MerchantNoteEvent 7, MerchantAgreementRecord 18, MerchantInvite 18,
InviteRewardGrant 10, BusinessSuppression 5); the three D65 columns each present AND NOT NULL
(exact-count = 3, so an ABSENT column fails: closes the fail-open Codex found); all indexes by name
(3 earlier5 + 20 packet); all FK constraints by name (2 + 4); all enum (type,value) pairs (7 + 29);
`Branch.googlePlaceId` presence. ABSENT phases assert the same objects do NOT exist (drift/stray
detection).

**Empirical fail-closed evidence (disposable local PostgreSQL 16.14; never a shared environment):**
a harness simulated Prisma's ledger exactly (per-migration statement apply + sha256 checksum rows)
and applied the real 63 migration files progressively 0->52->57->63, running the preflight at each
state. **31/31 matrix results correct**: 12 positives PASS at their matching states (including the
repaired-state re-passes); every negative exits non-zero (psql exit 3), covering: all-three D65
columns dropped (the exact case that previously passed), one D65 column dropped, a D65 column made
nullable, a packet table dropped, a packet index dropped, a packet FK dropped, a stray packet table
at 57, `Branch.googlePlaceId` dropped at 57, checksum tampered, an unfinished ledger row, a
rolled-back ledger row, an unknown extra migration row, every wrong-scenario/wrong-state pairing
tested, and a missing `-v scenario` argument. Full log: window-log artifact `preflight-results.txt`
(31 lines, reproduced in the PR discussion).

## 9. Warning and uncertainty ledger

| # | Item | Action |
|---|---|---|
| U1 | PITR history window = **21600s (6h)** (confirmed read-only via list_projects); PITR is root/production-only, irrelevant to staging child | Reconfirm at execution |
| U11 | Child-branch in-place restore semantics + connection stability (Part 3.8 Option A) not provable read-only | Mandatory 3.2 rehearsal proves it, else Option B (rebuild) |
| U2 | Railway `DATABASE_URL` pooled-vs-direct topology doc conflict | Confirm live Railway value before the window; is a separate DIRECT migration credential provisioned |
| U3 | Checksum + schema assertions empirically validated on disposable local PG (31/31 matrix); the live-DB harness simulates Prisma's ledger shape, so `migrate status` at execution remains the final belt | Run preflight + `migrate status` at execution |
| U4 | Live deployed worker env (`MAINTENANCE_*` already set?) | Verify at execution |
| U5 | Both branches `protected:false` | Pre-window backup (branch for staging, Snapshot for production) is the mitigation; consider protection for the window |
| U6 | D65 `MerchantAgreementRecord` immutability is app-level only (no DB trigger) | Unchanged by this window; open solicitor question |
| U7 | Neon Snapshot availability is plan-dependent (production windows only; staging uses a backup branch) | Confirm `neon snapshots list` works before a production window |
| U8 | `lock_timeout` via connection-string `options` unverified for Prisma 7 engine | Prefer `ALTER ROLE ... SET`; test the connection-string fallback on a disposable connection |
| U9 | Probe cleanup gaps (MerchantAgreementRecord FK + orphaned R2 PDF) | RESOLVED: `prisma/cleanup-agreement-probe.ts` built + tested (Part 6.2); R2 lane exercised at the staging rehearsal |
| U10 | Secret connection strings / DIRECT endpoint values | Not read (boundary); operator injects at execution |

## 10. Open owner decisions (consequential)
1. **Production structure:** the recommended two-window split (4.1/4.2) vs a single 11-migration window.
2. **Branch protection** on the target during the window (provider change)?
3. **Railway topology confirmation** (U2) + is a separate DIRECT migration credential provisioned?
4. **Staging recovery (Part 3.8 fork):** approve Option A (in-place head-restore from the backup
   branch) as primary IF the mandatory 3.2 rehearsal proves it cleanly resets a child branch with a
   stable connection; otherwise Option B (rebuild from the backup branch) is the recovery. Staging is
   a child branch, so neither Snapshot-create nor PITR is available on it.

## 11. Cross-check: Codex issues -> resolution

Round 1 (six issues) and Round 2 (ten verified blockers, 2026-07-19b):

| Codex item (round 2) | Resolution |
|---|---|
| 1. D65 column check could PASS with columns missing | Fixed: exact-count assertion (present AND NOT NULL = 3/3); empirically proven (the all-three-missing case now exits non-zero: Part 8 matrix) |
| 2. Post-63 asserted only 3 tables | Full inventory asserted: all 8 packet tables + exact per-table column counts, 20 indexes by name, 4 FKs by name, 29 enum (type,value) pairs (Part 8) |
| 3. Pre-packet asserted only 2 tables | ABSENT phases assert all 8 packet tables, all packet indexes and all packet enum pairs are absent (Part 8) |
| 4. `prod_wa_post` verified ledger only | Every scenario now asserts its exact schema state, both groups, PRESENT and ABSENT (earlier5 objects incl. `Branch.googlePlaceId`, `VoucherPendingEdit`, `KeyringFingerprint`, enum values; 8-row table in Part 8) |
| 5. Executable negative tests | 31/31 matrix on disposable local PG 16.14, progressive 0->52->57->63 with the real migration files + Prisma-shaped ledger; every negative exits non-zero incl. the previously-passing missing-D65-column case (Part 8) |
| 6. Option B not a real procedure | Part 3.8 Option B: complete dump-and-restore INTO staging (same endpoint, no repoint), with access/dump/stop-writers/restore/verify/failed-restore-rollback/cleanup steps, an endpoint-repoint variant, and the "guaranteed" label made conditional on the mandatory rehearsal |
| 7. Window A determinism | Part 4.1 step 4: in-tree `npm ci` from the anchor's OWN lockfile (pins Prisma 7.8.0, same as main), LOCAL `node_modules/.bin/prisma` only (no npx fallback), record node/npm/prisma versions; SHA + 57-dir filesystem gates preserved |
| 8. Probe cleanup prerequisite | `prisma/cleanup-agreement-probe.ts` BUILT + TESTED (dry-run/apply/FK-unblock/guardrails on disposable PG; Part 6.2); R2 lane exercised at the staging rehearsal |
| 9. Persistent ALTER ROLE residue | Part 5: dedicated migration role preferred; else capture `pg_roles.rolconfig` -> set -> `ALTER ROLE ... RESET` -> re-verify, all logged; session-scoped connection-string fallback documented as unverified-for-Prisma-7 |
| 10. Endpoint identifier + SQL header | `<STAGING_DIRECT_ENDPOINT>` placeholder; SQL header now states "no persistent target-schema/data mutation" (temp tables + ROLLBACK), not "SELECT only" |

Round 1 (retained): Window A anchor `fa92b690` byte-identical to `edfc2a1e` with hard filesystem gate;
staging recovery = OWNER FORK (child branch: PITR and Snapshot-create both root-only); disposable
prefixed probe fixtures, never real/shared accounts, token-consumed-pre-txn retry documented;
truthful lock posture (brief SHARE ROW EXCLUSIVE / ACCESS EXCLUSIVE locks + timeouts + monitoring);
whitespace clean.

Confirmation: no migration, deploy, provider/snapshot/branch, secret, or shared-data action was
performed in preparing this packet. All steps are owner-gated. See the retained six-packet packet §9
for the #537 evidence-UI activation checkpoint (MERGED DORMANT).
