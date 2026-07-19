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

### 1.1 Reference SHA (verified facts; deploy candidate selection lives in Part 3.0)
- **REFERENCE SHA `edfc2a1e68f7a8642c7d858675b0529c8e311042`** (PR #537): the `origin/main` commit
  at which this packet's facts were verified read-only. `git diff d95e70cf..edfc2a1e` touches no
  `prisma/migrations/**` or `schema.prisma`: same migration set; it added the dormant evidence UI +
  evidence-**read** backend routes. Backend and admin-web must deploy from the SAME commit, the
  `<CANDIDATE>` of Part 3.0 (else the evidence routes 404 if the UI flag is ever enabled). Repo
  migration count at the reference SHA: **63**. Open PRs touching migrations/schema at packet time:
  **0**. Stale branch `chore/fix-auth-followups` is benign (April-2026, ~1789 commits behind, zero
  overlap). The actual deploy commit `<CANDIDATE>` is selected at window time under Part 3.0
  (rules 1, 2, 5); this section is deliberately not updated for every later `main` merge.

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

- **F1 candidate SHA:** one owner-selected `<CANDIDATE>` per the Part 3.0 protocol; backend + admin-web same commit.
- **F2 partial-apply trap:** #11 adds NOT-NULL-no-default columns to the table #9 creates. Safe only
  while empty. **Hard gate: `migrate deploy` reaches 63 / zero-unfinished and is verified BEFORE any
  backend deploy.** If migrate fails mid-run, do not deploy; resolve to 63 or recover via Part 3.8
  (staging) / the production Snapshot (Part 4).
- **F3 staging recovery is an owner fork** (Part 3.8). Staging is a child branch, so BOTH PITR and
  Snapshot-create are root-only-blocked; recovery is a backup branch + a rehearsal-proven restore or
  rebuild. Production (root) uses Snapshot + PITR normally.
- **F5 deploy ordering:** worker env complete (lead flag false) -> migrate to 63 + verify -> deploy
  backend+worker `<CANDIDATE>` -> flip lead flag true after `MerchantLead` confirmed.
- **F6 production split** into two windows (Part 4), Window A now executable (Part 4.1).
- **Cleanup gaps (new, Part 6.2):** a D65-signed probe merchant cannot be deleted by the existing
  fixture-sweep (FK `onDelete: Restrict` on `MerchantAgreementRecord`), and the signed PDF leaves an
  orphaned R2 object. Probe cleanup must handle both.

---

## 3. STAGING execution sequence

Target: staging `<STAGING_BRANCH_ID>`, applying the **6 packets** to reach 63, then deploying the
coupled backend/worker at `<CANDIDATE>` (Part 3.0). Owner-executed; every step owner-gated.

### 3.0 Candidate selection + freeze protocol (authoritative; every `<CANDIDATE>` below obeys it)

Terminology: **REFERENCE SHA = `edfc2a1e`** is the commit whose facts this packet VERIFIED read-only
(63-migration set, all embedded checksums, the D65 evidence-route coupling, the `fa92b690`
byte-identity). It is a fixed historical anchor for those facts, not necessarily the deploy commit.
**`<CANDIDATE>`** is the single deploy commit selected under the rules below; execution steps in this
packet write `<CANDIDATE>`, never a hard-coded SHA.

1. **One authoritative candidate.** Immediately before the staging rehearsal, the owner selects and
   records `<CANDIDATE>` = the then-current `origin/main` HEAD, which must have passed normal PR
   review, CI, and owner release approval. Recorded in the window log with timestamp.
2. **Eligibility gate (migration-set invariance):**
   `git diff --name-only edfc2a1e..<CANDIDATE> -- prisma/migrations prisma/schema.prisma` must be
   EMPTY (recorded in the window log). This proves the migration set is still exactly the verified
   63, so the preflight's embedded checksums and this packet's SQL analysis remain the truth for
   `<CANDIDATE>`. It is deliberately NOT an artifact-equivalence claim (see rule 3).
3. **Same-commit rule (no artifact equivalence).** Staging and production Window B deploy the EXACT
   SAME `<CANDIDATE>` commit for backend, worker AND admin-web. A "proven equivalent but different"
   commit is NOT permitted: backend/worker/admin-web build inputs span `src/`, `apps/admin-web/`,
   `package.json` + lockfile, TS/Next config and the deploy pipeline itself, and maintaining a
   correct equivalence class over all of them is a larger risk than the strict rule. Consequence:
   **selecting a newer candidate after staging RESETS the staging evidence**: the staging window
   (probes + soak, Part 3.5) must re-run at the new `<CANDIDATE>` before production Window B.
4. **Freeze while a candidate is live:** from selection until production Window B verification
   completes, no merge to `main` may touch `prisma/**`, `prisma/schema.prisma`,
   `src/api/shared/env.ts` or the worker boot path (Part 7 freeze list), and coupled
   backend+frontend features must use the dormant-flag pattern (as #537 did), so an admin-web
   auto-deploy can never expose a contract the `<CANDIDATE>` backend lacks.
5. **Deploy-time HEAD equality (deployment-configuration reality):** Railway ("Deploy latest
   commit") and Vercel auto-deploy build the connected branch HEAD, not an arbitrary SHA. Therefore
   `git rev-parse origin/main` must EQUAL `<CANDIDATE>` immediately before every backend/worker
   deploy click, re-verified in the window log. If main has advanced: STOP; either wait out /
   re-freeze, or re-select the candidate under rule 3 (which resets staging evidence). Never deploy
   hoping HEAD is "close enough".
6. **Window A is candidate-independent:** it deploys nothing; its checkout anchor is the FIXED
   historical commit `fa92b690` (Part 4.1), chosen for its 57-migration tree, regardless of
   `<CANDIDATE>`.

**Candidate-reference cross-check** (every execution reference follows the same rule):

| Reference site | Uses | Rule |
|---|---|---|
| Part 1.1 verified facts, 1.2 checksum facts, 4.1 anchor byte-identity | `edfc2a1e` literal | REFERENCE SHA: fixed verified facts (not a deploy instruction) |
| 3.1 precondition, 3.3 step 11, 3.4 step 13 (staging apply + deploy) | `<CANDIDATE>` | rules 1-5 |
| 4.1 steps (Window A checkout + return-tree step) | `fa92b690` + `<CANDIDATE>` | rule 6 + rules 3/5 for the return |
| 4.2 Window B apply + deploy; 4.4 assurance statement | `<CANDIDATE>` | rule 3 (same commit staging proved) |
| Findings F1/F5 summaries (Part 2) | `<CANDIDATE>` | rules 1-5 |

### 3.1 Preconditions
1. `<CANDIDATE>` selected, recorded and eligibility-proven per Part 3.0 (rules 1, 2, 5). Backend AND
   admin-web deploy from that same commit.
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
8. **Mandatory recovery rehearsal (owner-executed, resolves the fork before the real window).** The
   rehearsal must prove ROLLBACK: recover a pre-change state INTO an already-migrated target using
   the SAME procedure intended for staging. On a THROWAWAY copy, never staging itself:
   a. `neon branches create --parent <STAGING_BRANCH_ID> --name rehearsal` (57-state copy) and
      attach a compute.
   b. **Capture the PRE-change backup source:** `pg_dump --format=custom --no-owner --no-privileges`
      of `rehearsal` NOW (at 57) -> `rehearsal-pre.dump`. Record size + `pg_restore --list` count.
   c. **Migrate the rehearsal target:** apply the 6 packets to `rehearsal` (it is now at 63; this is
      the disposable stand-in for a staging window that needs rolling back).
   d. **Recover using the intended same-endpoint procedure:** against `rehearsal`'s endpoint,
      `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` then
      `pg_restore --single-transaction --exit-on-error --no-owner --no-privileges -d <rehearsal URI>
      rehearsal-pre.dump` (fail-fast + transactional: a failure aborts atomically and the dump is
      simply re-runnable; record the retry preparation: the dump file and the source branch remain
      intact).
   e. **Prove it:** the preflight `-v scenario=staging_pre` against `rehearsal` must PASS (57
      applied, packet objects absent) and spot row-counts must match the step-b records. Record
      branch id / endpoint / connection-string stability observations.
   f. Delete `rehearsal` + its compute and the dump. Dumping a post-migration state into an
      unrelated scratch database would NOT prove rollback; this sequence restores pre-change data
      into the migrated target itself, which is exactly what a real staging rollback must do.
   If Option A (in-place head-restore) is being evaluated, exercise it in the same rehearsal before
   step f and record the same evidence. (All branch create/apply/restore/delete here are owner-gated;
   not executed by this packet.)
9. Confirm no automation performs `reset_from_parent` / branch-delete on staging during the window
   (`protected:false`). Consider enabling branch protection for the window.

### 3.3 Apply migrations (database first, F2 hard gate)
10. Recommended: set migration timeouts per Part 5 (dedicated role, or capture-then-set-then-RESTORE
    on the shared role; never leave persistent `ALTER ROLE` settings behind), so a DDL statement
    queued behind a stuck transaction fails fast (SQLSTATE 55P03) instead of hanging. Record capture
    + restore verification in the window log.
11. From the DIRECT-endpoint operator shell at `<CANDIDATE>`, deterministic toolchain (as Part 4.1 step
    4: in-tree `npm ci`, then the LOCAL binary): `node_modules/.bin/prisma migrate deploy` -> applies
    the 6 pending packets in timestamp order. (Lockfile pins Prisma 7.8.0.)
12. **VERIFY with the fail-closed preflight `-v scenario=staging_post`:** must PASS (applied 63, 0
    pending, 0 unfinished, 0 rolled-back, no drift, packet tables present, D65 columns NOT NULL).
    **STOP CONDITION (F2):** any failure or unfinished>0 -> do NOT deploy the backend; resolve to 63
    or recover via the staging fork (3.6 / 3.8).

### 3.4 Deploy the coupled backend + worker (only after `staging_post` PASS)
13. Deploy backend + worker at `<CANDIDATE>` (Part 3.0 rule 5: verify origin/main HEAD == `<CANDIDATE>` first; Railway "Deploy latest commit", SHA-stamped; not
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

### 3.8 STAGING RECOVERY: **OPTION B SELECTED** (adjudicated 2026-07-19 after the core rehearsal)
**RESOLVED: Option B (dump-and-restore into the same endpoint) is the selected staging recovery
posture.** The 2026-07-19 core rehearsal proved its full mechanism end-to-end on a disposable
staging-derived Neon branch (migrate -> DROP SCHEMA -> transactional pg_restore -> fail-closed
identity preflight PASS -> exact row-count match, one stable endpoint throughout; as-executed
evidence in Part 12). **Option A (in-place API head-restore of the child from its backup branch)
remains UNTESTED, not impossible:** the exercise was tooling-blocked (no management-API key exists
and creating one was out of authorization; the read-only MCP has no branch-restore operation).
Reconciliation with official Neon docs + the exact topology: PITR/instant-restore and manual
Snapshot-CREATE are documented root-branch-only, so both are unavailable on staging (child of
production); the generic head-restore API (`POST /branches/{id}/restore` with `source_branch_id`,
no timestamp) is documented for a child target restoring from its PARENT (`^parent`) and requires
`preserve_under_name` when the target has children, but restoring a child target from its OWN CHILD
(staging <- `staging-prewindow`) at head is not explicitly documented either way. Option A may be
revisited only via a dedicated disposable rehearsal if a management-API key is ever provisioned
(owner decision); until then Option B governs. Background (the original fork reasoning, retained):
staging is a child branch; the guaranteed pre-window step is the backup branch `staging-prewindow`
(3.2 step 7); the restore path options were:

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
     CASCADE; CREATE SCHEMA public;'` then `pg_restore --single-transaction --exit-on-error
     --no-owner --no-privileges -d "<staging DIRECT URI>" prewindow.dump` (fail-fast AND
     transactional: any error aborts the whole restore atomically, leaving a clean re-runnable
     state; retry preparation = the dump file and the untouched `staging-prewindow` branch). This is
     destructive ONLY to the already-broken post-failure state; the authoritative data lives in the
     dump + the backup branch.
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
    database is standard, replayable tooling with the source preserved; it earns that label for the
    real window ONLY via the mandatory rehearsal, whose SINGLE authoritative procedure is Part 3.2
    step 8: capture the pre-change dump at 57, migrate the SAME rehearsal target to 63, restore the
    pre-change dump INTO that migrated target over its own endpoint, and prove `staging_pre`.
    (Restoring into an unrelated scratch database proves nothing about rollback and is NOT the
    rehearsal.) Until rehearsed, the staging window stays blocked.

**Owner decision (Part 10 item 4):** approve Option A as the primary recovery IF the mandatory 3.2
rehearsal proves it returns a child branch to the correct state with a stable connection; otherwise
Option B is the recovery. This packet does not present Option A as settled.

---

## 4. PRODUCTION plan (separate decision)

Production is 11 behind (5 earlier additive migrations + 6 packets). All additive. **Recommend TWO
windows.** Production is a root branch, so PITR is available in addition to Snapshots; take a Snapshot
regardless as the durable, non-expiring restore point.

### 4.1 Window A: apply the 5 earlier migrations (52 -> 57), no backend deploy (EXECUTABLE mechanism)
`prisma migrate deploy` from `<CANDIDATE>` (or any current main) would apply all 11. To apply ONLY the 5 earlier first, use the
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
7. **Return the tree to `<CANDIDATE>` before Window B and before ANY build/deploy.** Window A does no
   deploy, so the stale `fa92b690` tree is naturally isolated, but Window B must run from `<CANDIDATE>`
   (its `prod_wb_pre` preflight passes precisely because the 5 earlier files are byte-identical).

### 4.2 Window B: apply the 6 packets (57 -> 63) + deploy the coupled backend/worker at `<CANDIDATE>`
Same APPLY/DEPLOY sequence as staging Part 3, after staging has fully proven it; the VERIFICATION
step differs and is defined in Part 4.4 (non-write only; the staging behavioural probes are NOT
repeated on production). Preflight `prod_wb_pre` -> `migrate deploy` from `<CANDIDATE>` (the SAME commit staging proved, Part 3.0 rule 3; applies the 6
packets; the 5 earlier are byte-identical so no drift) -> `prod_wb_post` -> deploy backend+worker ->
flip lead flag -> Part 4.4 verification. Blast radius reduced from 11 to 6.

**Why split:** the account-deletion hard dependency means the candidate backend cannot deploy until
packet 10 anyway, so bundling the 5 harmless intervening migrations into the coupled window buys
nothing and enlarges the failure surface. Splitting isolates risk.

**Single-window alternative (if owner prefers):** apply all 11 at once from `<CANDIDATE>`
(`prod_single_pre` -> migrate deploy -> `prod_single_post`) + coupled deploy. Data-safe, but an
11-migration failure surface and explicit 11-not-6 consent required. Not recommended.

### 4.3 Evidence required from staging before production
Staging at 63/zero-unfinished; all 3.5 probes green (especially the GDPR delete-account probe); worker
stable with lead flag true; no drift; recovery rehearsal proven; clean soak.

### 4.4 Production verification posture (explicit; not operator discretion)
Behavioural proof lives on STAGING. Production verification is **NON-WRITE ONLY**:
- **What runs on production (Windows A and B):** the fail-closed preflight scenarios
  (`prod_wa_pre/post`, `prod_wb_pre/post` or the single-window pair); `prisma migrate status`;
  worker boot + scheduler health observation; the public health endpoint; and post-deploy
  monitoring of real traffic error rates. All are reads or normal service operation.
- **What NEVER runs on production as a probe:** the D65 sign probe (NO `MerchantAgreementRecord`
  legal record and NO R2 object is ever created by verification on production), the delete-account
  probe (NO fixture customer is created on production and the scrub is never probe-executed there),
  any fixture creation, and any endpoint call that writes even an audit row.
- **How the write paths are considered verified on production:** the exact same backend SHA
  (`<CANDIDATE>`, the same commit by Part 3.0 rule 3) has passed the full staging behavioural battery against an identical 63-migration
  schema (proven identical by the definition-identity preflight); production verification then
  confirms schema identity + boot health + live-traffic monitoring. If the owner ever wants a
  production write-probe, that is a SEPARATE owner decision with its own cleanup plan, not operator
  discretion.
- **Consequently `prisma/cleanup-agreement-probe.ts` is a STAGING-ONLY tool** ("Never production" in
  its header is consistent by construction: production verification creates nothing to clean up).
  Its `--target` anchored-identity gate exists to make pointing it at the wrong environment loud.

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
  2. **Shared role with capture-and-restore of the EXACT prior values:** BEFORE the window, capture:
     `SELECT rolname, rolconfig FROM pg_roles WHERE rolname = current_user;` and record the exact
     prior `lock_timeout` / `statement_timeout` entries from `rolconfig` (each may be present with a
     value, or absent). Set the window timeouts. AFTERWARDS, restore precisely:
     - a setting that previously EXISTED is restored to its captured value:
       `ALTER ROLE <role> SET lock_timeout = '<captured prior value>';`
     - a setting that was previously ABSENT is removed: `ALTER ROLE <role> RESET lock_timeout;`
     (same per-setting rule for `statement_timeout`). Re-run the `pg_roles` query and verify
     `rolconfig` is byte-identical to the capture. **Restoration runs in BOTH outcomes: after a
     successful `migrate deploy` AND on any failure/abort path** (the operator checklist places the
     restore step in the always-run window-teardown, not the success branch). Capture, restore
     commands and the final verification all go in the window log.
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

**Scope: these behavioural probes run on STAGING ONLY.** Production verification is non-write only,
defined exhaustively in Part 4.4.

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
  Safety (rev 2026-07-19d hardening; STAGING-ONLY per Part 4.4): dry-run by default; `--prefix`
  required (>= 8 chars, LIKE-escaped); `--max` is a BOUNDED POSITIVE SAFE INTEGER 1..100
  (NaN/Infinity/floats/zero rejected); `--apply` additionally requires BOTH an ANCHORED
  `--target` identity (must EQUAL the full DATABASE_URL hostname or its exact first label, the
  Neon endpoint id; min 8 chars; substrings/partials/near-matches rejected) AND
  `REDEEMO_CLEANUP_OWNER_APPROVED=yes` (owner gate). With `--delete-r2`, BEFORE any DB row is
  deleted the R2 config is validated AND live delete capability is proven by a real sentinel
  DeleteObject (nonexistent key: succeeds only with valid credentials + bucket + delete
  permission); a probe failure aborts with rows untouched. NARROWED residual claim: the sentinel
  proves bucket-level capability at T0; per-key or mid-run failures AFTER DB deletion can still
  orphan objects, which are collected, reported with a non-zero exit + unreconciled keys, and
  resolved under the owner-gated reconciliation. **CORRECTION (2026-07-19 amendment): the R2
  success and failure paths were NOT exercised in the 2026-07-19 core rehearsal** (no R2 object was
  required or created there); they are scheduled in the owner-gated COMPLETION rehearsal (Part 14)
  using uniquely-prefixed disposable objects only. Until that runs, the R2 lane is design-reviewed +
  locally guard-tested but not live-proven. Invoke via the repo-local `node_modules/.bin/tsx` only.
  **Tested on the disposable local PG (63-state schema): 10/10 (round 2) + 9/9 (round 4):**
  FK-restrict block live; dry-run deletes nothing; valid anchored apply removes only probe rows and
  unblocks the merchant delete; NaN/Infinity/0/2.5 `--max` exit 1; missing/wrong/short/partial/
  near-match `--target` (incl. an 8-char partial of the host) all exit 1; missing owner env exits 1;
  `--delete-r2` with missing env AND with an unreachable endpoint both exit 1 WITH the DB rows
  verified still present (capability probe precedes deletion).
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

Object assertions per group are **DEFINITION IDENTITIES, not counts or names** (rev 2026-07-19c;
the expectation set was GENERATED from a ground-truth build of the real 63 migration files on
disposable PG16, not hand-transcribed):
- **112 column identity rows** (name + data type incl. enum udt + nullability + default) across the
  10 window tables + `Branch.googlePlaceId`: a renamed, re-typed, re-nulled or re-defaulted column
  no longer matches -> FAIL, and exact per-table column-set equality catches extras.
- **23 index DEFINITIONS** (full `pg_indexes.indexdef`): a same-name wrong-definition index (e.g.
  unique swapped for non-unique) no longer matches -> FAIL.
- **6 FK DEFINITIONS** (constraint + table + column + referenced table + update/delete rules): a
  same-name wrong-behaviour FK (e.g. ON DELETE CASCADE) no longer matches -> FAIL.
- All **36 enum (type,value) pairs**; the explicit D65 3/3 present-AND-NOT-NULL belt retained.
- ABSENT phases assert the same objects (tables, columns, indexes, enum pairs) do NOT exist.

**Empirical fail-closed evidence (disposable local PostgreSQL 16.14; never a shared environment):**
the harness simulates Prisma's ledger exactly (per-statement apply + sha256 checksum rows) and
applies the real 63 migration files progressively 0->52->57->63, running the preflight at each
state. **Round-3 matrix: 31/31 correct** (12 positives incl. repaired-state re-passes; 19 negatives
each exiting psql code 3), now including the four definition-drift classes Codex required:
**same-count column substitution** (drop+add different name, count unchanged), **same-name wrong
type** (text->varchar), **same-name wrong default** (1->2), **same-name non-unique index**, and
**same-name FK with ON DELETE CASCADE**; plus the full prior battery (all-3-D65-columns dropped,
D65 nullable, table/index dropped, stray table, googlePlaceId dropped, checksum tamper,
unfinished/rolled-back/unknown ledger rows, wrong scenarios, missing `-v scenario`). Full log in
the PR discussion. Known limitation: index/default deparse strings are compared against PG16
output; a future Postgres major could format them differently (fails CLOSED, never open).

## 9. Warning and uncertainty ledger

| # | Item | Action |
|---|---|---|
| U1 | PITR history window = **21600s (6h)** (confirmed read-only via list_projects); PITR is root/production-only, irrelevant to staging child | Reconfirm at execution |
| U11 | Child-branch in-place restore semantics + connection stability (Part 3.8 Option A) not provable read-only | Mandatory 3.2 rehearsal proves it, else Option B (rebuild) |
| U2 | Railway topology | CLOSED 2026-07-19 (read-only, names/booleans only): backend `web` + `worker` DATABASE_URLs BOTH pooled; NO MIGRATION_DATABASE_URL on any service. Credential delivery = Part 13-CRED (owner-injected ephemeral, same role) |
| U3 | Checksum + schema assertions empirically validated on disposable local PG (31/31 matrix); the live-DB harness simulates Prisma's ledger shape, so `migrate status` at execution remains the final belt | Run preflight + `migrate status` at execution |
| U4 | Live deployed worker env (`MAINTENANCE_*` already set?) | Verify at execution |
| U5 | Both branches `protected:false` | Pre-window backup (branch for staging, Snapshot for production) is the mitigation; consider protection for the window |
| U6 | D65 `MerchantAgreementRecord` immutability is app-level only (no DB trigger) | Unchanged by this window; open solicitor question |
| U7 | Neon Snapshot availability is plan-dependent (production windows only; staging uses a backup branch) | Confirm `neon snapshots list` works before a production window |
| U8 | `lock_timeout` via connection-string `options` unverified for Prisma 7 engine | Prefer `ALTER ROLE ... SET`; test the connection-string fallback on a disposable connection |
| U9 | Probe cleanup gaps (MerchantAgreementRecord FK + orphaned R2 PDF) | Tool built + locally guard-tested + DB lane live-proven in the core rehearsal; R2 lanes NOT yet live-proven: scheduled in the completion rehearsal (Part 14.10) |
| U10 | Secret connection strings / DIRECT endpoint values | Not read (boundary); operator injects at execution |

## 10. Open owner decisions (consequential)
1. **Production structure:** the recommended two-window split (4.1/4.2) vs a single 11-migration window.
2. **Branch protection** on the target during the window (provider change)?
3. **DIRECT migration credential delivery** (U2 topology is CLOSED: Railway backend + worker are
   both pooled and no MIGRATION_DATABASE_URL exists anywhere). Recommended method in Part 13-CRED:
   same-role (`neondb_owner`) direct URI, owner-injected as an ephemeral env var in the operator
   shell at window time; never stored, committed, or added to Railway; no new role (a second role
   would reintroduce the ownership churn that the H2 inspection just ruled out). Owner approves the
   method + performs the injection at the window.
4. **Staging recovery: RESOLVED 2026-07-19 = Option B** (see Part 3.8). Option A remains untested
   (tooling-blocked), revisitable only via a dedicated disposable rehearsal if a management-API key
   is ever provisioned.
5. **Completion rehearsal approval** (Part 14): disposable branches/computes + uniquely-prefixed
   disposable R2 objects + the credential-injection dry-run.

## 11. Cross-check: Codex issues -> resolution

Round 4 (four findings, 2026-07-19d):

| Codex finding (round 4) | Resolution |
|---|---|
| 1. Contradictory Option-B rehearsal wording | The stale "restore into a scratch DB" bullet in Part 3.8 removed; ONE authoritative procedure remains (3.2 step 8: pre-change dump at 57 -> migrate the SAME target to 63 -> restore the pre-change dump INTO it over its own endpoint -> prove `staging_pre`), with 3.8 explicitly deferring to it and naming the scratch-DB variant as NOT the rehearsal |
| 2. `includes()` target identity too weak | ANCHORED identity: `--target` must EQUAL the full hostname or its exact first label (Neon endpoint id), min 8 chars. Negative tests 5/5: short broad, broad substring, 8-char partial of the host, near-match host, suffix fragment all exit 1 (Part 6.2) |
| 3. Production verification posture undefined | Part 4.4: production is NON-WRITE ONLY (preflight scenarios, migrate status, boot/scheduler health, health endpoint, live-traffic monitoring); NO D65 legal record, NO R2 object, NO fixture, NO probe that writes even an audit row is ever created on production by verification; write-path assurance = same-SHA + identical-schema (identity preflight) + staging battery; any future production write-probe is a separate owner decision. Cleanup tool = staging-only by construction |
| 4. R2 claim vs behaviour | prepareR2 now proves LIVE delete capability with a real sentinel DeleteObject BEFORE any DB deletion (creds + bucket + delete permission; a failure aborts with rows untouched: empirically verified with an unreachable endpoint). Claim NARROWED: sentinel proves bucket-level capability at T0; per-key/mid-run failures after DB deletion are collected -> non-zero exit + keys -> owner-gated reconciliation. **AMENDED 2026-07-19: the live R2 success/failure lanes were NOT exercised in the core rehearsal; they run in the owner-gated completion rehearsal (Part 14)** |

Round 3 (four findings, 2026-07-19c):

| Codex finding (round 3) | Resolution |
|---|---|
| 1. Schema claim fail-open to definition drift | Preflight rewritten to DEFINITION IDENTITIES: 112 ground-truth-generated column identity rows (name/type/nullability/default), 23 full index definitions, 6 full FK definitions (rules + referenced table). New negatives all fail closed: same-count column substitution, wrong type, wrong default, same-name non-unique index, same-name FK ON DELETE CASCADE (Part 8; round-3 matrix 31/31) |
| 2. Option-B rehearsal did not prove rollback | 3.2 step 8 rewritten: PRE-change dump captured at 57 -> the SAME rehearsal target migrated to 63 -> pre-change dump restored INTO the migrated target via the intended same-endpoint procedure with `pg_restore --single-transaction --exit-on-error` (fail-fast + transactional; retry prep explicit) -> `staging_pre` PASS proves the rollback. Option B main procedure gains the same controls |
| 3. Timeout restoration lossy | Part 5: exact captured prior values are RESTORED when they existed; RESET only for previously-absent settings; restoration placed in the always-run teardown (success AND failure); byte-identical `rolconfig` verification logged |
| 4. Cleanup script hardening | `--max` bounded safe integer (NaN/Infinity/floats rejected); R2 config validated + client constructed BEFORE any DB delete; partial R2 failures collected -> non-zero exit + keys listed; repo-local `node_modules/.bin/tsx` documented; `--apply` gated on `--target` host match + `REDEEMO_CLEANUP_OWNER_APPROVED=yes`. 10/10 guard tests incl. rows-survive-bad-R2-config (Part 6.2) |

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

---

## 12. Core rehearsal 2026-07-19: as-executed evidence (precise proven / not-proven)

Owner-authorized; disposable resources only; real staging and production verified unchanged after.
Rehearsal `<CANDIDATE>` = `e3b61f2d` (the #532 squash = then-current main HEAD; migration-delta 0;
63-set confirmed).

As-executed: disposable branch created from staging (auto-expiry safety net) -> fail-closed identity
preflight `staging_pre` PASS (its FIRST live-Neon run: validates the sha256-checksum assumption
against Prisma's real ledger rows) -> `pg_dump` custom pre-state (456 TOC entries; merchants=21
users=105 vouchers=50 redemptions=37) -> REAL mechanism migration (fresh candidate worktree, in-tree
`npm ci`, node 24.16.0 / npm 11.13.0 / LOCAL prisma 7.8.0) applied exactly the 6 packets ->
`staging_post` PASS with all pre-existing data intact and new tables empty -> cleanup tool exercised
live (dry-run; FK-restrict block demonstrated; anchored endpoint-id `--target` matched; gated apply;
merchant delete unblocked) -> RECOVERY: `DROP SCHEMA public CASCADE` + `pg_restore
--single-transaction --exit-on-error` into the SAME endpoint, exit 0 -> `staging_pre` PASS on the
recovered state; recovered counts EXACTLY matched the pre-dump records; one endpoint/connection
served the whole cycle. Disposable branch deleted (verified by empty search); dump + connection-URI
files purged.

**PROVEN:** the six packets apply cleanly by the real tooling to real staging-derived data; the
Option B recovery MECHANISM end-to-end on one stable endpoint; schema-definition identity + ledger +
checksum equality pre vs recovered (the full fail-closed preflight); exact row-count equality on
Merchant / User / Voucher / VoucherRedemption; error-free transactional restore; the cleanup tool's
DB lane against real Neon.

**NOT PROVEN (wording correction: the recovered state was NOT shown "byte-equivalent"):** full
logical data equality (no per-table content digests were taken; Part 14 adds them); ownership/ACL
outcomes under any role other than the single dev role used throughout (H2 behavior half);
recovery under live consumer sessions (H1); the backup-branch attach-compute + cross-branch dump
path (M4); the R2 success/failure lanes (M5); the lock-timeout capture/set/restore controls under
concurrency (M6); Option A in any form.

## 13. Closure checklist (H1, H2, M3-M7): executable

Each item: command(s) -> expected -> stop condition -> cleanup. Inspection halves executed
read-only 2026-07-19 are marked CLOSED with their evidence.

1. **H1 sessions + guarded DROP (real window + Part 14 rehearsal).**
   Stop the staging backend + worker SERVICES (not merely "no writes"): Railway dashboard stop
   (owner action). Verify: `SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()
   AND pid<>pg_backend_pid();` -> expected **0**; stop condition: nonzero after service stop
   (investigate the holder; never proceed). Run the recovery DROP under
   `SET lock_timeout='5s'; SET statement_timeout='60s';` in the same session -> expected: completes
   in seconds; stop condition: SQLSTATE 55P03 (a session still holds a lock). Cleanup: restart the
   services only after recovery verification.
2. **H2 role/ownership/GRANT model. INSPECTION CLOSED 2026-07-19 (read-only, live staging):**
   distinct table owners = **1** (`neondb_owner`); grants to non-owner roles = **0**; RLS
   policies/enabled tables = **0**; non-system schemas = `public` only; the only default ACLs are
   Neon-internal (`cloud_admin` r/S on public). Residual behavior half: the restore must RUN AS
   `neondb_owner` (the Part 13-CRED method guarantees this); confirmed-by-construction once
   the credential method is followed. Stop condition: any second app role or non-owner grant appears
   before the window (re-run the inspection at window open).
3. **M3 destructive path under the REAL injected credential (Part 14).**
   On the disposable target only, using the owner-injected credential: run the full DROP+restore
   cycle -> expected: identical results to the core rehearsal; stop: any permission error.
4. **M4 backup-branch cross-dump (Part 14).** Create the backup branch of the disposable target;
   verify its compute; `pg_dump` FROM the backup's endpoint; restore INTO the target -> expected:
   deep-verification PASS (item 7); stop: dump/restore error; cleanup: delete backup branch.
5. **M5 R2 lanes (Part 14; owner-approved disposable objects only).** Success lane: put a
   uniquely-prefixed disposable object (`rehearsal-r2-<uuid>/...`), seed a matching probe row on the
   disposable DB, run the cleanup tool with `--delete-r2` -> expected: sentinel probe OK, row+object
   deleted, exit 0. Failure lane (NARROWED CLAIM): unreachable endpoint -> expected: capability
   probe FAILS, exit 1, DB rows untouched: this proves the PRE-DELETION capability-failure path
   only; a per-key/mid-run failure AFTER a successful sentinel is not safely reproducible and
   remains the documented owner-gated reconciliation residual (details Part 14 step 7). Never
   read/overwrite/delete any pre-existing object; cleanup: verify the prefix lists empty afterward.
6. **M6 timeout capture/set/restore under concurrency (Part 14).** Capture
   `SELECT rolconfig FROM pg_roles WHERE rolname=current_user;` -> set timeouts -> hold an open
   transaction lock from a second session -> run a conflicting DDL -> expected: 55P03 fail-fast ->
   release -> re-run OK -> restore per Part 5 option 2 (exact prior values; RESET only if previously
   absent) -> re-query `rolconfig` -> expected: byte-identical to capture. Stop: any residue.
7. **M7 hidden-object coverage. INSPECTION CLOSED 2026-07-19 (read-only, live staging):**
   sequences **0** (all ids are TEXT; no sequence-position risk), publications **0**, subscriptions
   **0**, matviews **0**, RLS **0**, extensions = `plpgsql` only, single `public` schema; the one
   replication slot is Neon's internal PHYSICAL `wal_proposer_slot` (platform-managed; not dumped,
   not affected by schema drop). Residual: per-table logical digests added to Part 14 verification;
   re-run this inventory at window open (stop condition: any new nonzero).

### 13-CRED: DIRECT migration-credential delivery (recommended method)
Use the SAME role the schema already belongs to (`neondb_owner`, per the CLOSED H2 inspection:
single owner, zero secondary grants) over the target DIRECT (non-pooler) endpoint. Delivery: the
owner retrieves the direct connection string from the Neon console at window/rehearsal start and
injects it as an EPHEMERAL environment variable in the operator shell only; it is never stored on
disk, never committed, never added to Railway/Vercel, and the shell is closed when the window ends.
NO NEW ROLE is created: a second role would reintroduce exactly the ownership/ACL churn that H2
ruled out, and role creation/rotation is outside authorization. Rejected alternatives: a dedicated
migration role (ownership churn + credential sprawl); storing a MIGRATION_DATABASE_URL in Railway
(persistent secret with no runtime consumer). Approval + injection are owner actions at each window.

## 14. COMPLETION REHEARSAL (bounded; owner-gated; smallest safe design; rev 2026-07-19f)

Purpose: close every NOT-PROVEN item from Part 12 in ONE disposable pass. Nothing touches real
staging/production; all writes on disposable resources; everything deleted afterward.

**Credential handling (Finding-3 rule):** TWO separately injected ephemeral DIRECT connections are
used: one for target branch D, one for backup branch B. Delivery per Part 13-CRED, EXCEPT that the
values are injected as the libpq environment variables (`PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`/
`PGSSLMODE=require`) per target, entered via `read -s` (no shell-history echo). Consequences: psql /
pg_dump / pg_restore are invoked with NO connection string in any command argument; Prisma receives
`DATABASE_URL` as an environment variable only (never argv). Neither value is ever printed, placed
in a command argument, persisted to disk, added to Railway/Vercel, or written into any evidence
file; the operator shell is closed at the end. Evidence files record host FIRST LABELS only.

**Deep-verification manifest (Finding-4 spec; replaces the earlier illustrative key-table digest):**
- Table-selection rule: EVERY base table in schema `public` (`information_schema.tables` where
  `table_type='BASE TABLE'`), INCLUDING `"_prisma_migrations"`. No exclusions.
- Per-table record: `(table_name, row_count, digest)` where
  `digest = coalesce(md5(string_agg(h, '' ORDER BY h)), 'EMPTY')` over
  `(SELECT md5(t::text) AS h FROM "<table>" t)`.
- Determinism: rows are hashed individually (`md5(row::text)`) and aggregated ORDERED BY THE ROW
  HASH itself, so the manifest is independent of physical row order and of any primary-key shape.
- NULL / binary / text representation: the Postgres composite-record text form (`t::text`) is the
  canonical serialization; it is identical for identical data on identical DDL, and identical DDL
  is independently guaranteed by the fail-closed identity preflight run alongside every manifest.
  `bytea` renders as `\x..`; NULL renders as an empty position with commas preserved.
- Empty tables: `row_count = 0`, `digest = 'EMPTY'` (the coalesce arm), so empties are asserted,
  not skipped.
- Generation: one psql run builds the per-table statements from `information_schema.tables` via
  `format()` + `\gexec`, emitting one `(table, count, digest)` row per table; the output is sorted
  and compared with `diff` between runs. Chosen over dump-text diffing because it is compact,
  ordering-insensitive and produces an attributable per-table failure.
- Required equalities: PRE-CHANGE manifest(D) == manifest(B) (proves B is a faithful backup);
  POST-RESTORE manifest(D) == the pinned PRE-CHANGE manifest(D).

Sequence (single disposable branch D from staging + its backup child B):
1. Create D (child of staging, auto-expiry) -> preflight `staging_pre` PASS (via D's env).
2. Create B (child of D) = the backup-branch analog; verify B's compute (M4 setup).
3. **Owner injects the TWO ephemeral DIRECT connections** (D and B) per the Finding-3 rule above.
   All subsequent DB actions use them (M3).
4. PRE deep-baseline: run the manifest on D AND on B (must be EQUAL: pins the baseline and proves
   the backup); run the Part 13.7 object inventory; snapshot `pg_stat_activity`. Store manifests
   locally as evidence (they contain digests + counts only, no data, no hosts).
5. M6 drill (connection-correct, state-neutral; D at 57):
   a. Capture `SELECT rolconfig FROM pg_roles WHERE rolname=current_user;` (session 1).
   b. `ALTER ROLE ... SET lock_timeout='5s', statement_timeout='60s';` then PROVE via a FRESH
      connection: `SHOW lock_timeout; SHOW statement_timeout;` -> expected 5s / 60s (role defaults
      apply only to NEW connections; testing on the setting session would be vacuous).
   c. Session X: `BEGIN; SELECT * FROM "Merchant" LIMIT 1;` (holds AccessShare). Fresh session Y
      runs a conflicting DDL -> expected FAIL SQLSTATE 55P03 within ~5s.
   d. Release X. The success proof is ROLLBACK-ONLY:
      `BEGIN; ALTER TABLE "Merchant" ADD COLUMN _m6_probe integer; ROLLBACK;` -> expected: succeeds
      inside the transaction, leaves NO persistent change.
   e. Re-run schema identity: preflight `staging_pre` on D -> PASS (proves state-neutrality).
   f. Restore per Part 5 option 2 (exact prior values; RESET only if previously absent); verify
      `rolconfig` byte-identical to the capture AND verify from ANOTHER fresh connection that
      `SHOW lock_timeout` is back to the pre-drill default.
6. Migrate D to 63 with the local prisma binary (D env) -> preflight `staging_post` PASS.
7. **M5 R2 lanes (D at 63, where `MerchantAgreementRecord` EXISTS):**
   a. Choose the disposable key `document/rehearsal-r2-<uuid>/probe.pdf` (INSIDE the cleanup
      tool's permitted `document/` namespace; `<uuid>` freshly generated).
   b. Prefix isolation proof: LIST objects with prefix `document/rehearsal-r2-<uuid>/` ONLY ->
      expected EMPTY. No broad/unprefixed list is ever issued; no existing object is read,
      listed, overwritten or deleted at any point.
   c. Success lane: PUT the disposable object at that key; seed a probe merchant + agreement row
      on D whose `pdfKey` = that key; run the cleanup tool `--apply --delete-r2` (anchored
      `--target` = D's endpoint first label; owner env set) -> expected: sentinel capability
      probe OK, DB row deleted, THIS object deleted, exit 0; LIST the prefix -> EMPTY.
   d. Failure lane (NARROWED CLAIM): re-seed a probe row; run with an unreachable `R2_ENDPOINT`
      -> expected: capability probe FAILS, exit 1, DB row VERIFIED still present. This proves
      the PRE-DELETION capability-failure path ONLY. A per-key or mid-run failure AFTER a
      successful sentinel is NOT safely reproducible against a real bucket and remains
      UNPROVEN; its handling stays what the tool implements (collect, non-zero exit, keys
      listed) with owner-gated manual reconciliation as the documented residual.
   e. Clean the re-seeded probe row (tool without `--delete-r2`); final prefix LIST -> EMPTY.
8. H1 drill: attach a dummy "consumer" session to D; the sessions check
   (`pg_stat_activity`, Part 13.1) reports count>0 -> close it -> count=0 -> proceed.
9. M4+M3: `pg_dump` FROM B (B env; cross-branch); recovery INTO D (guarded DROP under the M6
   timeouts + `pg_restore --single-transaction --exit-on-error`, D env).
10. Deep verification: preflight `staging_pre` PASS on D + manifest(D) == pinned step-4 manifest
    + object inventory EQUAL. (Digest equality upgrades "counts match" to content equality.)
11. Delete B, D, dumps, manifest files; verify staging/production unchanged (baseline queries).

Owner approvals required to start Part 14: (a) create/delete the TWO disposable branches + computes;
(b) the disposable-prefix R2 object write + deletions of step 7 (never touching existing objects);
(c) the TWO ephemeral credential injections per Part 13-CRED / the Finding-3 rule (owner provides
them at rehearsal start; not stored); (d) running the deliberate blocking/dummy sessions on the
disposable branch only.
Stop conditions: any preflight FAIL, any permission error, any manifest mismatch, any R2 LIST
returning a non-empty result outside the disposable prefix's own lifecycle, any operation that
would target a non-disposable resource. Cleanup is mandatory regardless of outcome.
