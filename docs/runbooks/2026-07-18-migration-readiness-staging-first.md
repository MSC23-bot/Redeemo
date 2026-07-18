# Migration Readiness Packet: Staging First (2026-07-18)

> STATUS: PREPARATION-ONLY / OWNER-APPROVAL-PENDING. Nothing here has been applied, deployed or
> mutated. All database reads were read-only SELECTs via the `neon-observer` MCP; no write, no
> `prisma migrate`, no deploy, no provider/secret change was executed. This packet supersedes the
> framing of `2026-07-15-six-packet-migration-window-packet.md` (retained as evidence): it
> re-pins the candidate, separates staging from production, and folds in the 2026-07-18 adversarial
> + mechanical review. Opaque Neon org/project/branch IDs are console-resolved placeholders
> (`<NEON_ORG_ID>`, `<NEON_PROJECT_ID>`, `<STAGING_BRANCH_ID>`, `<PRODUCTION_BRANCH_ID>`); this repo
> is public. Prepared by Fable 5 with adversarial analysis (Opus 4.8) and mechanical evidence
> (Sonnet 5); every figure independently reverified by the lead.

---

## 0. Owner summary (plain English)

We want to bring the six pending database changes to staging safely, then plan production separately.

- **Staging** is 6 migrations behind the code. All 6 are purely *additive* (new tables, new columns,
  new enum values): none rewrites or deletes existing data. Applied in the right order with a
  snapshot taken first, this is a low-risk change.
- The single most important rule this packet adds: **finish all the database migrations first and
  verify them, THEN deploy the new backend.** The new backend has code that reads/writes the new
  tables; if it runs against a half-migrated database, specific features (customer account deletion,
  merchant contract signing) break. The safe order is always "database first, code second."
- We also found a subtle trap: one migration adds three mandatory columns to a brand-new table. That
  is safe only while the table is empty. So we must never let the new backend write a contract row
  in between the two migrations. The rule "migrations fully finished before backend deploy" closes
  this.
- The real safety net is a **Neon branch snapshot taken immediately before we start** (not the
  automatic 6-hour point-in-time recovery, which can expire before a window finishes). If anything
  goes wrong, we restore that snapshot.
- **Production is a separate, bigger decision** (11 migrations, not 6). Our recommendation is to
  split it into two smaller windows rather than one. Details in Part 4.

Nothing in this packet has been executed. It is ready for review and your approval.

---

## 1. Verified current state (read-only, 2026-07-18)

### 1.1 Candidate (CORRECTED: was `d95e70cf`)
- `origin/main` HEAD = **`edfc2a1e68f7a8642c7d858675b0529c8e311042`** (PR #537, D65 evidence-UI
  dormant squash). This is the candidate for the coupled backend/worker deploy.
- The previous packet pinned `d95e70cf` (PR #516). `git diff d95e70cf..edfc2a1e` touches **no**
  `prisma/migrations/**` and **no** `prisma/schema.prisma`: the migration set is identical. It adds
  only the dormant evidence UI plus the evidence-**read** backend routes
  (`src/api/admin/merchants/agreementEvidence.ts`, `routes.ts`) which SELECT the D65 columns.
- **Consequence (Finding F1):** backend and admin-web must deploy from the **same** SHA `edfc2a1e`.
  Deploying the older `d95e70cf` backend while admin-web (auto-deployed from `main`) ships the
  evidence client would 404 the evidence routes the moment the UI flag is ever enabled. Anywhere the
  old packet says deploy `d95e70cf`, read `edfc2a1e`.
- Repo migration count: **63**. Open PRs touching `prisma/migrations` or `schema.prisma`: **0**
  (80 open PRs scanned). Stale branch `chore/fix-auth-followups` touches old April-2026 migrations
  but is ~1789 commits behind `main` with zero overlap with the 11 pending migrations: **benign,
  not a candidate** (do not merge/rebase for this work).

### 1.2 Live database posture (neon-observer, read-only SELECT)
Project `<NEON_PROJECT_ID>` (name Redeemo, aws-eu-west-2, PG16).

| Environment | Branch | Applied | Pending | Unfinished | Rolled back | Latest applied |
|---|---|---|---|---|---|---|
| **Staging** | `<STAGING_BRANCH_ID>` (name `staging`, parent = production) | **57** | **6** (the packets) | 0 | 0 | `20260709190638_branch_merchant_confirmed_confidence` |
| **Production** | `<PRODUCTION_BRANCH_ID>` (name `production`, primary/default) | **52** | **11** (5 earlier + 6 packets) | 0 | 0 | `20260624190418_branch_opening_hours_multi_window` |

- Both branches have **`protected: false`** (no Neon branch protection): Finding F10.
- **No drift.** Staging has 60 public tables and none of the 6 new packet tables exist yet;
  production has 58 tables, `VoucherPendingEdit`/`Branch.googlePlaceId`/`LocationConfidence`.`MERCHANT_CONFIRMED`
  all absent: exactly matching the pending set. Migration records match reality on both branches.
- **Checksum drift check (read-only, Finding F7 partially closed):** Prisma's stored `checksum` is
  `sha256(migration.sql)`. Spot-check of 7 already-applied migrations (all 5 earlier + oldest +
  newest-applied) against the current repo files = **7/7 match**. The definitive full check is
  `prisma migrate status` against each target's DIRECT endpoint at execution (needs credentials).

### 1.3 The 11 pending migrations (apply order) and classification
Every migration is **additive** (confirmed by full SQL read). "Pending on" = which environments lack it.

| # | Migration | What it does | Class | Pending on |
|---|---|---|---|---|
| 1 | `20260629000000_keyring_fingerprint` | new table `KeyringFingerprint` + unique index | additive | production |
| 2 | `20260702000000_maintenance_alert_types` | `NotificationType` +2 enum values | additive enum | production |
| 3 | `20260707135148_voucher_governed_flows` | new type; `ApprovalStatus`+`WITHDRAWN`, `ApprovalType`+`VOUCHER_EDIT`; new table `VoucherPendingEdit` + FKs (new empty table) | additive | production |
| 4 | `20260709095646_branch_google_place_id` | `Branch.googlePlaceId` nullable TEXT | additive column (metadata-only) | production |
| 5 | `20260709190638_branch_merchant_confirmed_confidence` | `LocationConfidence` +`MERCHANT_CONFIRMED` | additive enum | production |
| 6 | `20260710000000_admin_capability_grants_field_role` | `AdminRole` +`FIELD`; new table `AdminCapabilityGrant` + FK to `AdminUser` | additive | staging + production |
| 7 | `20260712000000_merchant_lead_packet` | 2 new types; new leaf table `MerchantLead` (no FK to existing tables) | additive | staging + production |
| 8 | `20260713000000_merchant_note_packet` | 2 types; new tables `MerchantNote`, `MerchantNoteEvent` + FKs | additive | staging + production |
| 9 | `20260714000000_d65_merchant_agreement_record` | type; new leaf table `MerchantAgreementRecord` + FK to `Merchant` | additive | staging + production |
| 10 | `20260714210000_customer_invite_referral_packet` | 3 types; new tables `MerchantInvite`, `InviteRewardGrant`, `BusinessSuppression` + 10 indexes; **zero FK constraints** | additive | staging + production |
| 11 | `20260715000000_d65_agreement_reviewed_body` | `MerchantAgreementRecord` +3 columns `reviewedContentHash`/`reviewedBody`/`pdfHash` **NOT NULL, no default** | **conditionally safe** (empty-table only) | staging + production |

**On PG16, `ALTER TYPE ... ADD VALUE` runs inside a transaction and none of these migrations uses a
newly-added enum value within its own file: so no enum-in-transaction hazard.** All indexes are on
brand-new (empty) tables, so `CONCURRENTLY` is irrelevant. The one non-trivial item is #11: see F2
below.

---

## 2. Key findings that change the plan (adjudicated)

Adversarial (Opus) + mechanical (Sonnet) review, adjudicated by the lead. Full ledger in Part 7.

- **F1 · candidate SHA (HIGH):** re-pin to `edfc2a1e`; backend + admin-web same SHA. (Part 1.1)
- **F2 · packet-4→packet-6 partial-apply trap (HIGH):** #11 adds NOT-NULL-no-default columns to the
  table #9 creates. Safe **only while that table is empty**. If `migrate deploy` commits #9 then
  dies before #11, and the backend is then deployed and *any* contract is signed, the table gains a
  row and **#11 can never apply** (`ADD COLUMN NOT NULL` without default fails on a non-empty table).
  → **Hard gate: `migrate deploy` must reach 63 / zero-unfinished and be verified BEFORE any backend
  deploy.** If migrate fails mid-run, do not deploy the backend; resolve to 63 (or restore the
  snapshot) first. The benign direction (#9 applied, #11 not, no backend deployed) is fully
  recoverable: the table stays empty and a re-run completes.
- **F3 · snapshot ≠ PITR (MEDIUM):** the 6h PITR window can expire before a window (apply + deploy +
  probes + sign-off) finishes; and migrations are forward-only (enum adds irreversible). → the **real
  rollback is a Neon branch snapshot taken immediately before apply**, with its branch id + LSN
  recorded. PITR is only a short-lived fallback.
- **F5 · deploy ordering (MEDIUM):** SAFE order = worker env complete (lead flag `false`) → migrate
  to 63 + verify → deploy backend+worker `edfc2a1e` → flip lead flag `true` after `MerchantLead`
  confirmed. "Old backend + new schema" is always safe; "new backend + old schema" breaks
  (account-deletion scrub → packet 10; D65 sign + evidence read → packets 4+6; worker boot → env
  completeness).
- **F6 · production split (MEDIUM):** recommend two production windows, not one (Part 4).
- **Connection topology conflict (uncertainty):** an untracked `railway-backend-hosting-plan.md`
  (D-3) says Railway `DATABASE_URL` is direct-for-everything; the later staging-deploy + security
  reconciliation runbooks say Railway runtime is **pooled** and migrations run from a controlled
  host with a **separately-injected DIRECT** endpoint. Confirm the live Railway value at execution
  (Part 6).

---

## 3. STAGING execution sequence (the deliverable)

Target: staging `<STAGING_BRANCH_ID>`, applying the **6 packets** (#6-#11) to reach 63, then
deploying the coupled backend/worker at `edfc2a1e`. Owner-executed; every step is owner-gated.
Read each step's STOP condition before running it.

### 3.1 Preconditions (all must hold before touching the database)
1. **Candidate frozen:** `origin/main` == `edfc2a1e`; backend AND admin-web will deploy from this SHA.
   Confirm no new merge to `main` since (this packet's freeze list, §5).
2. **DIRECT endpoint:** obtain staging's DIRECT (non-`-pooler`) Neon connection string as a
   separately-injected credential in the operator's shell only. **Never** run `migrate deploy`
   through the pooled endpoint (advisory-lock failure P1001). Do not print or store the value.
3. **Worker env completeness:** confirm the staging worker's env has ALL `MAINTENANCE_*` variables
   present and valid (the scheduler is fail-closed: 6 numeric + 4 booleans, or the worker refuses to
   boot), with `MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED=false` for now. Confirm Redis reachable and
   `STORAGE_ENABLED` state known (evidence PDF path needs it, but is dormant).
4. **Provider auto-migrate disabled:** confirm Railway does not run `migrate deploy` on deploy (must
   be operator-driven from the DIRECT host).
5. **Read-only preflight passes:** run the read-only preflight (Part 8 tooling): candidate SHA,
   repo=63 migrations, staging applied=57 / pending=exactly the 6 packets, 0 unfinished, no drift,
   new tables absent. STOP if any mismatch.

### 3.2 Backup / restore point (do this immediately before apply)
6. **Reconfirm PITR retention** on the project via the Neon console (prior value 6h; not surfaced by
   the read-only MCP describe: must be checked at execution).
7. **Create a named Neon snapshot branch from `<STAGING_BRANCH_ID>`** at its current head. Record in
   the window log: (a) snapshot branch id, (b) the source branch LSN at snapshot time, (c) timestamp.
   This is the durable rollback. (Owner-gated: branch creation is not authorised by this packet.)
8. Confirm no scheduled automation performs `reset_from_parent`/branch-delete on staging during the
   window (branches are `protected:false`). Consider enabling branch protection for the window.

### 3.3 Apply migrations (database first: F2 hard gate)
9. From the DIRECT-endpoint operator shell at `edfc2a1e`: `npx prisma migrate deploy`. This applies
   exactly the 6 pending packets in timestamp order (#6→#11).
10. **VERIFY to 63 before anything else:**
    - `SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)` = **63**;
      `count(*) FILTER (WHERE finished_at IS NULL)` = **0** (zero unfinished); `rolled_back` = 0.
    - `to_regclass` on `AdminCapabilityGrant`, `MerchantLead`, `MerchantNote`, `MerchantNoteEvent`,
      `MerchantAgreementRecord`, `MerchantInvite`, `InviteRewardGrant`, `BusinessSuppression` = all
      non-null (tables exist).
    - `information_schema.columns` shows `MerchantAgreementRecord.reviewedContentHash` /
      `reviewedBody` / `pdfHash` present and `is_nullable = NO`.
    - Enum values present: `AdminRole.FIELD`.
    - **STOP CONDITION (F2):** if `migrate deploy` reports any failure or unfinished > 0, do **NOT**
      deploy the backend. Investigate; re-run `migrate deploy` (idempotent for the remaining pending)
      until 63/zero-unfinished, or restore the snapshot (§3.6). A backend deploy against a
      partially-migrated DB is the trap.

### 3.4 Deploy the coupled backend + worker (only after 63 verified)
11. Deploy backend + worker at **`edfc2a1e`** to staging (Railway "Deploy latest commit", SHA-stamped;
    do not `railway up` from a worktree: stale-artifact risk). Worker env still has lead flag `false`.
12. **Worker boot probe:** worker boots cleanly (no `process.exit(1)` from env-completeness),
    BullMQ workers + maintenance scheduler up, zero boot errors.
13. **Flip `MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED=true`** only now (MerchantLead exists). This is a
    provider env change (owner-gated); redeploy/restart the worker. Confirm the lead-anonymise sweep
    runs without error on its first cycle.

### 3.5 Behavioural probes (prove the release; delete-account is GATING, not advisory)
14. **D65 sign (write path):** an assisted or self-serve contract sign creates a
    `MerchantAgreementRecord` row with `reviewedBody`/`reviewedContentHash`/`pdfHash` populated. No
    500 (would mean packet 4/6 missing).
15. **Account deletion / GDPR (GATING):** `POST /auth/customer/delete-account` completes: the
    unconditional `scrubInvitesForUser` reads `MerchantInvite`/`InviteRewardGrant` inside the
    anonymisation transaction. A 500 here means packet 10 missing → **immediate stop**. (The action
    token is consumed before the transaction; a failure strands the user: treat as a release blocker.)
16. **Evidence read/PDF (dormant):** these routes exist at `edfc2a1e` and SELECT packet-4/6 columns.
    They stay behind `contract:view-evidence` + the default-off `NEXT_PUBLIC_EVIDENCE_UI_ENABLED`
    (do NOT enable it). Optional operator-only check with the capability: `GET .../agreement/evidence`
    returns 200 (columns exist); the PDF route needs `STORAGE_ENABLED`.
17. **Lead sweep + maintenance:** scheduler runs all four sweeps; no "maintenance degraded" alerts;
    queue drains; zero errors on soak.

### 3.6 Stop conditions and rollback
- **Immediate STOP** on any of: `migrate deploy` failure / unfinished>0; the delete-account probe
  500s; the D65 sign probe 500s; the worker crash-loops on boot; any migration verify mismatch.
- **Rollback:** restore the **snapshot branch** captured in §3.2 (owner-gated). Because all
  migrations are additive and forward-only (enum adds irreversible), there is no down-migration: 
  snapshot restore is the recovery. PITR to the pre-window LSN is a fallback ONLY if still inside the
  retention window (reconfirmed in step 6); assume it may have expired and rely on the snapshot.
- Data written between the snapshot and a mid-window failure would be lost on restore: staging soak
  should avoid real writes during the window (freeze list §5).

### 3.7 When the freeze may end
The merge freeze on migration/schema/worker-env paths (Part 5) may lift once staging is at **63 /
zero-unfinished**, all §3.5 probes pass, and the release has soaked without error. Production remains
frozen until its own window (Part 4). Record the freeze-end decision in the window log.

---

## 4. PRODUCTION plan (separate decision)

Production is **11 behind** (the 5 earlier additive migrations + the 6 packets). All 11 are additive
and data-safe, but production is a bigger blast radius and a separate approval.

### 4.1 Recommendation: TWO windows (Finding F6)
- **Window A: the 5 earlier migrations, no backend deploy.** Apply `20260629…keyring_fingerprint`
  through `20260709190638…branch_merchant_confirmed_confidence` to production with the **current
  production backend still running**. These are backward-compatible (old backend ignores new
  tables/enum values), already staging-proven for weeks. This window proves the DIRECT-endpoint
  mechanics, the snapshot/restore drill, and pooled-vs-direct handling on production at near-zero
  risk, with no coupled deploy.
- **Window B: the 6 packets + coupled backend/worker deploy at `edfc2a1e`.** Same sequence as
  staging Part 3, after staging has fully proven it. Blast radius reduced from 11 to 6; the coupled
  (breaking-if-misordered) release is isolated.

**Why split:** the account-deletion hard-dependency means the candidate backend cannot deploy until
packet 10 is applied anyway, so bundling the 5 harmless intervening migrations into the risky coupled
window buys nothing and enlarges the failure/debug surface. Splitting isolates risk and gives two
smaller, independently-verifiable changes.

- **Downtime:** none expected for either window: additive DDL on new/empty objects; a nullable
  column add on `Branch` (packet 4 equivalent already on staging) is metadata-only on PG16.
- **Rollback:** each window gets its own pre-apply snapshot branch + LSN. Same forward-only/additive
  posture as staging.
- **Single-window alternative (if owner prefers):** applying all 11 at once is data-safe but has an
  11-migration failure surface and requires explicit "11-not-6" consent; not recommended.

### 4.2 Evidence required from staging before production is considered
Staging at 63/zero-unfinished; all §3.5 probes green (especially the GDPR delete-account probe);
worker stable with lead flag `true`; no drift; soak clean. Production is not scheduled until that
evidence exists and the owner opens the window.

---

## 5. Freeze and dependency analysis

**Freeze during any window** (do not run: they write to the shared DB):
- Seed commands are highest risk: `prisma/seed.ts` / `seed-demo.ts` / `seed-reference.ts`, and any
  `npx prisma db seed` (wired to `prisma/seed.ts` via `prisma.config.ts`).
- Tracked write-capable `prisma/*.ts` (backfills, grant/revoke, set-auth-state, reset-*, market/
  locality mutators): full list in the evidence packet; freeze all.
- The 12 untracked local dev/QA prisma scripts (create/update/delete): do not run during a window.
- Merges to `main` touching `prisma/migrations/**`, `prisma/schema.prisma`, `src/api/shared/env.ts`,
  or the worker boot path: freeze until the relevant window closes (keeps the candidate stable).

**Dependency chain (must hold):**
- Packet 11 after packet 9, zero rows written to `MerchantAgreementRecord` in between (F2).
- Packet 10 before the candidate backend serves account-deletion (GDPR scrub is ungated).
- Packets 4+6 before the candidate backend serves D65 sign or evidence reads.
- Packet 7 (`MerchantLead`) before `MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED=true`.
- Worker env `MAINTENANCE_*` complete before the worker boots at all (schema-independent).

## 6. Environment / worker readiness + connection assessment

- **Worker boot is fail-closed on config completeness:** all `MAINTENANCE_*` numeric + boolean vars
  must be present/valid or the worker refuses to boot: independent of schema. Verify the full set on
  staging (and later production) before deploying the candidate worker.
- **Lead-anonymise flag ordering:** `false` until `MerchantLead` exists, then `true`. Enabled sweeps
  scan at boot, so an early `true` fails on the first cycle.
- **Redis** must be reachable for BullMQ + the scheduler (worker-deploy precondition; not a migration
  dependency).
- **Storage:** the evidence-PDF route needs `STORAGE_ENABLED`; dormant behind the UI flag, so not a
  window blocker, but note its state.
- **Direct vs pooled (assessment):** the code has ONE `DATABASE_URL`, no `directUrl` split, no
  `MIGRATION_DATABASE_URL` in code. `prisma migrate deploy` **requires the DIRECT (non-pooler)
  endpoint** (advisory lock + session state fail through PgBouncer). The verified operational pattern
  (staging-deploy + security-reconciliation runbooks): Railway runtime `DATABASE_URL` stays **pooled
  and unchanged**; the operator runs migrations from a controlled host whose own `DATABASE_URL` is a
  separately-injected DIRECT credential. **Uncertainty:** the untracked `railway-backend-hosting-plan.md`
  (D-3) proposes the opposite (direct-for-everything). Confirm the live Railway value at execution
  before running migrations; it changes who needs which credential.

## 7. Warning and uncertainty ledger

| # | Item | Status / action |
|---|---|---|
| U1 | PITR retention not surfaced by read-only MCP describe (prior: 6h) | Reconfirm via Neon console at execution (step 6) |
| U2 | Railway `DATABASE_URL` topology: pooled+separate-direct (runbooks) vs direct-for-all (D-3 draft) | Confirm live Railway value before the window |
| U3 | Full checksum stability of all 57/52 applied rows | Read-only spot-check 7/7 clean; operator `prisma migrate status` is definitive at execution |
| U4 | Deployed worker env (are `MAINTENANCE_*` already set on staging/prod?) | Code contract read; live env not readable here: verify at execution |
| U5 | Both Neon branches `protected: false` | Snapshot is the mitigation; consider enabling protection for the window; confirm no `reset_from_parent` automation |
| U6 | D65 `MerchantAgreementRecord` immutability is application-level only (no DB append-only trigger) | Unchanged by this window; open solicitor question (per packet-4 header) |
| U7 | Behavioural probes need a running deployed service | Cannot pre-run; scripted in §3.5 |
| U8 | Secret connection strings / DIRECT endpoint values | Not read (boundary); operator injects at execution |

## 8. Read-only preflight tooling (proposed, reviewed separately)

To make execution safer, a **read-only** preflight is proposed (SELECT-only + git checks; no writes,
no mutation, no secrets embedded: operator supplies the DIRECT connection at run time). It verifies:
candidate SHA, repo=63, target applied-count + exact pending set, 0 unfinished, checksum drift, new
tables absent (pre-apply) / present (post-apply). Delivered as a separate file and reviewed
independently of execution (see the changed-file report). It performs no migration and no deploy.

## 9. Cross-check: objective + safety boundaries

| Requirement | Where satisfied |
|---|---|
| Execution-ready staging sequence | Part 3 (preconditions → backup → apply → verify → deploy → probes → stop → rollback → freeze-end) |
| What changes in staging & why | Part 1.3 + Part 3.3 verify list |
| What to back up first | Part 3.2 (snapshot branch + LSN, not just PITR) |
| Env/worker preconditions | Part 3.1 + Part 6 |
| How migrations are applied | Part 3.3 (DIRECT endpoint, migrate deploy, to 63) |
| Post-apply verification | Part 3.3 step 10 |
| When backend/worker deploy | Part 3.4 (only after 63 verified: F2 gate) |
| Behavioural probes | Part 3.5 (delete-account GATING) |
| Immediate-stop conditions | Part 3.6 |
| Rollback / recovery | Part 3.6 (snapshot restore; PITR fallback) |
| When freeze ends | Part 3.7 |
| Production as separate decision | Part 4 (A/B split recommendation) |
| Verified candidate + counts + pending | Part 1 |
| Direct-vs-pooled | Part 6 |
| No migration/deploy/provider/secret/mutation performed | This packet is preparation-only; all steps owner-gated |

## 10. Open owner decisions (consequential only)
1. **Production window structure:** approve the recommended **two-window split** (Part 4.1) vs a
   single 11-migration window.
2. **Branch protection for the window:** enable Neon branch protection on the target during the
   window (Part 3.2 step 8)? (Provider change, owner-gated.)
3. **Railway topology confirmation (U2):** who confirms the live `DATABASE_URL` pooled-vs-direct
   state before the window, and is a separate DIRECT migration credential already provisioned?

See also §11 of the retained six-packet packet for the D65 evidence-UI (#537) activation checkpoint,
now `MERGED DORMANT` and gated behind this migration window plus the UI flag.
