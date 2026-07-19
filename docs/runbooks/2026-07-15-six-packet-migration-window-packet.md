# Six-Packet Migration + Deployment Reconciliation Packet

> SUPERSEDED (2026-07-18) by `2026-07-18-migration-readiness-staging-first.md`, which re-pins the
> candidate to `edfc2a1e` (this doc's `d95e70cf` is stale: see Finding F1), separates staging from
> production, adds the packet-4-then-6 partial-apply gate, the snapshot-not-PITR rollback, and the
> two-window production recommendation. This file is retained as detailed evidence (SQL review §2,
> env-guard inventory §4, probes §6) and for the #537 activation checkpoint (§9). Read the new packet
> for the execution sequence; treat every `d95e70cf` reference below as `edfc2a1e`.

> NOTE: opaque Neon organisation/project/branch IDs are redacted to placeholders
> (`<NEON_ORG_ID>`, `<NEON_PROJECT_ID>`, `<STAGING_BRANCH_ID>`, `<PRODUCTION_BRANCH_ID>`,
> `<DEV_BRANCH_ID>`) because this repo is public; the operator resolves them from the Neon
> console at window time. They are low-sensitivity identifiers, not credentials (owner
> decision 2026-07-18, option C): no historical sweep or history rewrite is performed.
>
> STATUS: PREPARATION-ONLY / OWNER-APPROVAL-PENDING. Nothing in this document has
> been applied, deployed, or mutated. It is a read-only reconciliation packet
> produced for owner review before any migration window is opened. Every database
> read below was performed via the read-only `neon-observer` MCP; no write, no
> `prisma migrate`, no deploy, no env/secret change was executed.

Author: Opus 4.8 (read-only reconnaissance). Date: 2026-07-15.
Updated: Sonnet 5, 2026-07-18 (still preparation-only / read-only): PR #516 (D65
personalised-agreement) merged to `origin/main`, adding a 6th unapplied migration.
Candidate SHA, packet count, and all dependent arithmetic revised below; no new
production facts introduced beyond the 6th packet's own contents.
Candidate SHA: `d95e70cf181a57286646cb1bc46a0bb13fbd780e` (origin/main HEAD, re-fetched
and confirmed this session).

---

## 0. Executive summary (read this first)

- The six packets are confirmed present on `origin/main` in dependency order and
  are **all purely additive / create-only in effect** (new enums, new tables, new
  indexes, FK ADDs only on new leaf tables). No packet drops, rewrites, or
  NOT-NULL-mutates any *existing* table's data; packet 6 does add three `NOT
  NULL` columns, but only to `MerchantAgreementRecord`, itself a brand-new, still
  unapplied, empty table created by packet 4 in the same window (see §2 Packet 6).
- **Staging** (`<STAGING_BRANCH_ID>`) has **57** applied migrations and is
  behind `origin/main` by **exactly the 6 packets**. Clean, expected state.
- **CRITICAL DRIFT — Production** (`<PRODUCTION_BRANCH_ID>`) has **52** applied
  migrations and is behind `origin/main` by **11** migrations: the 6 packets PLUS
  5 already-shipped migrations (`20260629000000` … `20260709190638`) that are on
  main and on staging but never reached production. A `prisma migrate deploy`
  against production applies **all 11 pending migrations**, not just the 6 packets.
  This must be surfaced to the owner before any production window. (All 11 are
  additive, verified below, but the scope is significantly wider than "six
  packets" implies.)
- **Hard dependency CONFIRMED:** the live account-deletion endpoint on the
  candidate SHA calls `scrubInvitesForUser()` inside its transaction, which queries
  `inviteRewardGrant` and `merchantInvite` — tables created only by packet 5. If
  the candidate backend is deployed without packet 5 applied, account deletion
  breaks. Exact code paths documented in §1.4.
- **Env precondition CONFIRMED:** `MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED` is a
  REQUIRED, fail-closed boolean. The candidate **worker will refuse to boot** if it
  is unset. It must be present and set to `false` until the `MerchantLead` table
  exists (packet 2), then flipped to `true`. Details in §4.
- No open PR adds a migration (re-checked this session: `gh pr list --state open
  --json number,files` shows zero of the 29 open PRs touching
  `prisma/migrations/**` or `prisma/schema.prisma`); the migration set is stable
  at the 6 packets (§7).

---

## 1. Environment identity + applied-migration state

### 1.1 Project / organisation

- Organisation: `Redeemo` (`<NEON_ORG_ID>`).
- **One** Neon project only: `Redeemo` = `<NEON_PROJECT_ID>`
  (aws-eu-west-2, Postgres 16). Staging and production are **branches within this
  single project**, not separate projects.
- Project-level `history_retention_seconds` = **21600 (6 hours)**. This is the PITR
  window (see §5 backup posture — it is short).

### 1.2 Branch identity

| Role | Branch name | Branch id | primary | default | parent |
|---|---|---|---|---|---|
| **Production** | `production` | `<PRODUCTION_BRANCH_ID>` | true | true | (root) |
| **Staging** | `staging` | `<STAGING_BRANCH_ID>` | false | false | `<PRODUCTION_BRANCH_ID>` |

- **Staging CONFIRMED** as `<STAGING_BRANCH_ID>` (branch `name` = "staging"),
  matching the dispatch assumption.
- **Production identified** as `<PRODUCTION_BRANCH_ID>` by three independent
  signals: branch `name` = "production", `primary: true`, and `default: true`. It
  is the root branch (no `parent_id`); staging was branched from it.
- Other branches in the project (not deploy targets, listed for completeness):
  `dev-screenshot-2` (`<DEV_BRANCH_ID>`), `dev-screenshot`
  (`<DEV_BRANCH_ID>`), and three archived branches
  (`plan-1-5-dev`, `category-taxonomy-foundation`,
  `production_old_2026-04-28T12:00:00Z`).

### 1.3 Applied-migration state (from `_prisma_migrations`, read-only)

Repo `origin/main` migration count: **63** (`prisma/migrations/*/migration.sql`).

| Environment | total applied | unfinished | rolled_back | latest applied |
|---|---|---|---|---|
| Repo (origin/main) | 63 | n/a | n/a | `20260715000000_d65_agreement_reviewed_body` |
| **Staging** | **57** | 0 | 0 | `20260709190638_branch_merchant_confirmed_confidence` |
| **Production** | **52** | 0 | 0 | `20260624190418_branch_opening_hours_multi_window` |

Both environments report zero unfinished and zero rolled-back migrations — no
partially-applied / failed migration to clean up first. Good.

**Staging is missing exactly the 6 packets** (63 − 57 = 6):
1. `20260710000000_admin_capability_grants_field_role`
2. `20260712000000_merchant_lead_packet`
3. `20260713000000_merchant_note_packet`
4. `20260714000000_d65_merchant_agreement_record`
5. `20260714210000_customer_invite_referral_packet`
6. `20260715000000_d65_agreement_reviewed_body`

**Production is missing 11** (63 − 52 = 11): the 6 packets above **PLUS** five
already-shipped, already-on-staging migrations:
- `20260629000000_keyring_fingerprint`
- `20260702000000_maintenance_alert_types`
- `20260707135148_voucher_governed_flows`
- `20260709095646_branch_google_place_id`
- `20260709190638_branch_merchant_confirmed_confidence`

**The environments do NOT agree on everything else.** Production trails staging by
those five intervening migrations. I inspected all five for destructive statements:

| Migration | Content | Class |
|---|---|---|
| `20260629000000_keyring_fingerprint` | CREATE TABLE (keyring fingerprint ledger) | additive |
| `20260702000000_maintenance_alert_types` | `ALTER TYPE "NotificationType" ADD VALUE` ×2 | additive (enum add) |
| `20260707135148_voucher_governed_flows` | `ALTER TYPE ADD VALUE` ×2 + CREATE TABLE `VoucherPendingEdit` + FK ADD to Voucher/Merchant (new leaf table) | additive |
| `20260709095646_branch_google_place_id` | ADD COLUMN (no destructive lines) | additive |
| `20260709190638_branch_merchant_confirmed_confidence` | `ALTER TYPE "LocationConfidence" ADD VALUE 'MERCHANT_CONFIRMED'` | additive (enum add) |

All five are additive; a production `migrate deploy` sweeping them in is
data-safe, but the **owner must explicitly consent to the wider 11-migration
scope on production**: this is not a "six packets" change on that environment.

### 1.4 Hard-dependency verification: CustomerInviteReferral (packet 5)

**Claim:** account-deletion queries invite/referral tables even while invites are
disabled, so packet 5 is a hard dependency of the candidate backend.

**VERIFIED TRUE.** Code paths (verified at the original candidate SHA `ea3416b1`,
PR #527; `ea3416b1` is confirmed an ancestor of the current candidate `d95e70cf`
via `git merge-base --is-ancestor`, so this code path is unchanged and still live):

- `src/api/auth/customer/routes.ts`, `POST {prefix}/delete-account`
  (line ~211). Inside a single `app.prisma.$transaction`:
  ```
  await tx.user.update({ ... status: 'DELETED' ... })
  await scrubInvitesForUser(tx, req.user.sub)   // same transaction
  ```
  The in-code comment states the user anonymisation + invite PII scrub "commit
  ATOMICALLY" — they are deliberately in one transaction.

- `src/api/customer/invites/service.ts`, `scrubInvitesForUser()` (line ~616):
  ```
  await prisma.inviteRewardGrant.deleteMany({ where: { userId, status: 'PENDING' } })
  const result = await prisma.merchantInvite.updateMany({
    where: { inviterUserId: userId, anonymisedAt: null },
    data: { note: null, inviterEmailNorm: null, ipHash: null,
            inviterUserId: null, inviterKey: null, rewardEligible: false,
            anonymisedAt: new Date() },
  })
  ```

**Failure mode if packet 5 is NOT applied but the candidate backend IS deployed:**
the first statement `tx.inviteRewardGrant.deleteMany(...)` hits a non-existent
relation (`InviteRewardGrant` / `MerchantInvite` tables do not exist) →
PostgreSQL `relation does not exist` → Prisma throws → the whole delete-account
transaction rolls back → **the customer cannot delete their account** (a
UK-GDPR-relevant, user-facing failure). Note the action token is consumed
(Redis `del`) *before* the transaction, so a failed run also leaves the user
without an easy re-run path. This confirms packet 5 must be applied to any
environment running the candidate backend, independent of whether invite
*features* are exposed. The invite write-path itself lives at
`src/api/customer/invites/{routes,service,identity}.ts` and also depends on
packet 5 (and, per its own header, on packet 2 `MerchantLead`).

---

## 2. Migration SQL review (the 6 packets)

Legend: additive = CREATE TABLE / CREATE TYPE / CREATE INDEX / ADD COLUMN /
FK-ADD-on-new-leaf-table. destructive/risky = DROP / ALTER TYPE on existing use /
NOT NULL without default on an existing column / DELETE / table rewrite.

### Packet 1 — `20260710000000_admin_capability_grants_field_role`
- `ALTER TYPE "AdminRole" ADD VALUE 'FIELD'` — additive enum value.
- `CREATE TABLE "AdminCapabilityGrant"` + 2 indexes.
- `ADD CONSTRAINT ... FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id")` —
  FK from the new (empty) table to existing `AdminUser`.
- **Class: additive.** Only existing-table touch: the FK ADD momentarily takes a
  ShareRowExclusive lock on `AdminUser` to register the constraint; validation is
  instant (new table empty). No rewrite.
- Note on `ALTER TYPE ... ADD VALUE`: on PG16 this is safe and non-rewriting, but
  the new enum value **cannot be used in the same transaction** it is added in and
  the ADD VALUE **cannot be rolled back inside a transaction**. Prisma runs each
  migration file discretely, so this is not an issue here; flagged for awareness.

### Packet 2 — `20260712000000_merchant_lead_packet`
- `CREATE TYPE "MerchantSource"`, `CREATE TYPE "LeadStage"`.
- `CREATE TABLE "MerchantLead"` + 4 indexes. **No FK** (bare-id columns by design).
- **Class: fully additive.** No existing table touched at all.

### Packet 3 — `20260713000000_merchant_note_packet`
- `CREATE TYPE "MerchantNoteStatus"`, `CREATE TYPE "MerchantNoteAction"`.
- `CREATE TABLE "MerchantNote"`, `CREATE TABLE "MerchantNoteEvent"` + 2 indexes.
- FK `MerchantNote.merchantId → Merchant("id")` (new table → existing `Merchant`);
  FK `MerchantNoteEvent.noteId → MerchantNote("id")` (new → new).
- **Class: additive.** Only existing-table touch: brief constraint-registration
  lock on `Merchant` for the one FK ADD. No rewrite.

### Packet 4 — `20260714000000_d65_merchant_agreement_record`
- `CREATE TYPE "AgreementSignMethod"`.
- `CREATE TABLE "MerchantAgreementRecord"` + 1 index.
- FK `MerchantAgreementRecord.merchantId → Merchant("id")` (new → existing).
- **Class: additive.** Immutability of the record is an application-level contract
  (service layer + guard test), NOT a DB trigger — the migration adds no
  append-only trigger. Only existing-table touch: brief FK-registration lock on
  `Merchant`.

### Packet 5 — `20260714210000_customer_invite_referral_packet`
- `CREATE TYPE "MerchantInviteStatus"`, `"InviteRewardGrantStatus"`,
  `"BusinessSuppressionReason"`.
- `CREATE TABLE "MerchantInvite"`, `"InviteRewardGrant"`, `"BusinessSuppression"`
  + indexes, including UNIQUE indexes
  `MerchantInvite_inviterKey_placeKey_key`, `InviteRewardGrant_inviteId_key`,
  `BusinessSuppression_placeKey_key`.
- **No FK constraints declared** (leafKey references are logical, not enforced FKs).
- **Class: fully additive.** No existing table touched.

### Packet 6: `20260715000000_d65_agreement_reviewed_body`
- `ALTER TABLE "MerchantAgreementRecord" ADD COLUMN "reviewedContentHash" TEXT NOT NULL`
- `ALTER TABLE "MerchantAgreementRecord" ADD COLUMN "reviewedBody" TEXT NOT NULL`
- `ALTER TABLE "MerchantAgreementRecord" ADD COLUMN "pdfHash" TEXT NOT NULL`
- **Class: additive.** All three are `NOT NULL` with no `DEFAULT` (normally a
  risky pattern on a table with existing rows, but `MerchantAgreementRecord` is
  itself created by packet 4 in this same unapplied window and holds **zero rows**
  on both staging and production; packet 4 is unapplied on both). Adding `NOT
  NULL` columns to an empty table is instant: no backfill, no rewrite of live
  data, no lock contention beyond the column-definition change.
- **Depends on packet 4** (`20260714000000_d65_merchant_agreement_record`): packet
  6 cannot apply until `MerchantAgreementRecord` exists. Timestamp ordering
  (`20260714000000` < `20260715000000`) preserves this, and `migrate deploy`
  applies in lexical order, so the dependency is self-enforcing (same mechanism
  as the packet-2-before-packet-5 case).
- No FK, no enum, no index changes; a pure 3-column `ADD COLUMN` migration. The
  columns feed the D65 personalised-agreement sign service (§3): `reviewedBody` /
  `reviewedContentHash` / `pdfHash` are written on `MerchantAgreementRecord.create`
  in `src/api/merchant/agreement/service.ts` (verified at the candidate SHA).

**Lock / rewrite audit across all 6:** No `DROP`, no `DELETE`, no `TRUNCATE`, no
`ALTER COLUMN ... SET NOT NULL` on an existing column, no `ALTER TYPE` that
rewrites an existing table, no `UPDATE`. Packet 6's three `ADD COLUMN ... NOT
NULL` statements target `MerchantAgreementRecord`, but that table is itself
unapplied/empty (created by packet 4 in the same window), not a live existing
object, so this is not a NOT-NULL-mutate of existing data. The only statements
that touch a genuinely pre-existing object are the four FK ADDs referencing
`AdminUser` (×1) and `Merchant` (×3); each takes a short-lived ShareRowExclusive
lock on the referenced table to register the constraint, with instant validation
because the referencing tables are empty. No statement rewrites or long-locks an
existing table.

**Dependency-order rationale (why this order is correct):**
1. Enums are created before the tables that use them (each packet's `CREATE TYPE`
   precedes its `CREATE TABLE`).
2. FK targets exist before the FK is added: `AdminUser` and `Merchant` are
   pre-existing; `MerchantNote` is created before `MerchantNoteEvent`'s FK to it.
3. Packet 5 (`...210000`) MUST come after packet 2 (`...merchant_lead_packet`):
   the invite service attaches/creates a `MerchantLead` (`leadId` on
   `MerchantInvite`; the invite write path references `MerchantLead`). The packet-5
   header records this explicitly. Timestamp ordering (`20260712` < `20260714210000`)
   preserves it, and `migrate deploy` applies in lexical timestamp order, so the
   order is self-enforcing.
4. Packet 6 (`...20260715000000`) MUST come after packet 4
   (`...d65_merchant_agreement_record`): its three `ADD COLUMN` statements target
   `MerchantAgreementRecord`, which packet 4 creates. Timestamp ordering
   (`20260714000000` < `20260715000000`) preserves this; packet 6 also sorts last
   overall, so it applies after every other packet in the window.

---

## 3. Candidate SHA

- Backend + migration candidate: **`d95e70cf181a57286646cb1bc46a0bb13fbd780e`**
  (`origin/main` HEAD).
- Subject: `feat(D65): personalised-agreement signing, mandatory review-binding
  (backend + admin-web + migration) (#516)`.
- Re-fetched via `git fetch origin` this session; confirmed as current
  `origin/main` HEAD. This supersedes the packet's original candidate
  (`ea3416b1…56537`, PR #527, dated 2026-07-15): `git merge-base --is-ancestor
  ea3416b1… d95e70cf…` confirms `ea3416b1` is an ancestor, so every fact
  previously verified at `ea3416b1` (§1.4 hard dependency, §4 env guard) still
  holds. Three PRs merged in between: `#531` (Vercel build-decision CI infra, not
  enabled), `#533` (D65 decision-packet doc), `#534` (customer-web /for-businesses
  rebaseline); none touches `prisma/migrations/**`, `prisma/schema.prisma`, or a
  worker/env-guard contract, so only the migration set (packet 6, from `#516`) and
  this candidate SHA changed. All 6 packet `migration.sql` files verified present
  at this SHA.
- This SHA carries the invite API code (§1.4), the lead-anonymise env guard (§4),
  **and** the D65 personalised-agreement sign service, which writes `reviewedBody`
  / `reviewedContentHash` / `pdfHash` on `MerchantAgreementRecord.create`
  (`src/api/merchant/agreement/service.ts`, also `src/api/merchant/onboarding/service.ts`):
  columns that exist only after packet 6 is applied. So the candidate backend,
  the original 5 packets, and packet 6 are all a **coupled** release: the DB must
  be at 63 migrations before this backend serves traffic on a given environment.
  If packet 6 is missing but the candidate backend is deployed, the sign-ceremony
  `create` call targets columns that don't exist yet → Postgres `column ... does
  not exist` → Prisma throws → agreement signing breaks, the same failure shape
  as §1.4 describes for packet 5 (not independently load-tested in this update;
  flagged for the owner as the packet-6 equivalent of the §1.4 hard dependency).

---

## 4. Env-guard inventory

### 4.1 `MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED` (the critical one)

- Resolved in `src/api/shared/env.ts` `resolveMaintenanceConfig()` (line ~231):
  `parseBoolVar(env, 'MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED', problems)`. It is
  a **required, fail-closed boolean**: if maintenance is enabled (the default when
  `MAINTENANCE_MODE` is unset) and this var is missing or non-boolean, it is added
  to `problems` and `resolveMaintenanceConfig` **throws**, which in
  `src/worker.ts main()` propagates to `main().catch → process.exit(1)`.
  **Consequence: the candidate worker will NOT boot unless this var is present and
  a valid boolean.** Deploying the candidate worker therefore requires this env var
  to be set on every worker environment, even just to `false`.
- Sweep wiring: `src/worker.ts buildMaintenanceRegistration()` builds
  `makeSweepRuntime(buildLeadAnonymiseSweep(prisma, maintenance),
  maintenance.sweepLeadAnonymiseEnabled)`. In
  `src/api/queues/maintenanceScheduler.ts` the tick loop gates each sweep:
  `if (s.enabled && s.nextEligibleAt <= now) await runOne(s)` (line ~251). A sweep
  with `enabled = false` is **never run** — `runOne` is never called, so its DB
  phase never executes.
- The sweep's DB phase (`src/api/queues/processors/leadAnonymiseSweep.ts`,
  `leadAnonymiseDbPhase`) runs raw SQL `... FROM "MerchantLead" ...`.

**What happens if the flag is `true` before the `MerchantLead` table exists:** the
scheduler calls `runOne` → `leadAnonymiseDbPhase` runs `FROM "MerchantLead"` →
PostgreSQL `relation "MerchantLead" does not exist`. The scheduler is designed so
sweeps "never reject" (each `runOne` is caught), so this does **not** crash the
worker — but it records a sweep failure through the AlertSink every cadence tick,
drives the sweep into degraded backoff, and (after `alertAfterFailures`) fires an
in-app admin "maintenance degraded" alert. In short: noisy, recurring false-alarm
failures, not a crash. **Therefore keep `MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED=false`
until packet 2 (`MerchantLead`) is applied, then flip to `true`.**

### 4.2 Sibling maintenance sweep flags (same required/fail-closed contract)

All parsed in the same `resolveMaintenanceConfig` block and all required booleans
when maintenance is enabled:
- `MAINTENANCE_SWEEP_OUTBOX_ENABLED`
- `MAINTENANCE_SWEEP_PENDING_HOURS_ENABLED`
- `MAINTENANCE_SWEEP_CLAIM_STALE_ENABLED`
- `MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED` (new in this candidate)

Plus the numeric maintenance config (also required/validated when enabled):
`MAINTENANCE_FLOOR_IDLE_MS`, `MAINTENANCE_FLOOR_ACTIVE_MS`,
`MAINTENANCE_PHASE_B_MAX_ITEMS`, `MAINTENANCE_PHASE_B_BUDGET_MS`,
`MAINTENANCE_STATEMENT_TIMEOUT_MS`, `MAINTENANCE_TX_TIMEOUT_MS`
(with `STATEMENT_TIMEOUT_MS < TX_TIMEOUT_MS`), and the worker pool var
`WORKER_DATABASE_POOL_MAX` (`resolveWorkerDatabasePoolMax`, 1..10, required).
`MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED` is the **only new required var** the
candidate adds versus the currently-deployed worker; the others already exist on a
booting worker, but confirm they are set before the candidate deploy.

**Other flags that assume a not-yet-created table/column:** the lead-anonymise
sweep is the only *worker-boot* env guard coupled to a packet table. The invite and
lead *API routes* (`src/api/customer/invites/*`, `src/api/admin/leads/*`) assume
packets 2 and 5 tables at query time but are not env-flag-gated — they are simply
route handlers that will 500 if invoked before their tables exist. They are
gated by capability (`lead:manage`) / auth, not by a table-existence flag, so the
protection is "don't apply the backend before the migrations," which is exactly the
coupling in §3. No separate feature flag hides them.

### 4.3 `src/worker.ts` boot order (order-of-operations)

1. `validateRequiredEnv()` — aggregated required-env check (fail-closed).
2. `resolveWorkerDatabasePoolMax(process.env)` — pure validation, throws before any
   resource is opened.
3. `--verify-keyring-and-exit` early path (if the flag is passed): builds a Prisma
   client, publishes the worker keyring fingerprint row, exits with the publish
   result code. Registers no BullMQ. (This is the parity-verification step the
   migrator can read.)
4. `resolveMaintenanceConfig(process.env)` — **this is where the lead-anonymise flag
   is validated**; throws → exit(1) if missing/invalid.
5. Construct the single Prisma client, `$connect`.
6. Best-effort keyring fingerprint publish (swallowed on error, never blocks boot).
7. Register BullMQ workers (email, reconcile, moderation) with their own Redis
   connections.
8. If `MAINTENANCE_MODE=disabled`: log and skip the scheduler entirely (the durable
   maintenance floor is OFF). Else: build the AlertSink and start the maintenance
   scheduler with all four sweeps, each gated by its own enable flag.

**Order-of-operations risk for the window:** step 4 gates the whole worker on the
new env var. If the candidate worker is deployed with the env var absent, it
exits(1) and the supervisor restarts it in a crash loop — no email delivery, no
maintenance sweeps. Set the env var (to `false`) **before** deploying the candidate
worker. There is no ordering risk between packet application and worker boot as long
as the flag stays `false` until `MerchantLead` exists.

---

## 5. Staging apply + deploy sequence (owner-executed)

> This is the ordered plan for STAGING only. Production is a separate, later,
> owner-gated window (and carries the wider 11-migration scope from §1.3: treat it
> as its own decision). Do staging first; the runbook mandates staging-before-prod
> (`deploy-security-runbook.md` §7: "still run `migrate deploy` against staging
> first").

**Runbook citation for the mechanism** (`docs/runbooks/deploy-security-runbook.md`):
- §4 line 102: run `npx prisma migrate deploy` against the environment DB **before**
  the new code serves traffic; it applies committed migrations, never generates
  new ones. The `Procfile` intentionally has **no `release:` line** — migration is
  an explicit, gated pre-deploy step.
- Same line, Neon caveat: a provider pre-deploy phase inherits Railway's **pooled**
  `DATABASE_URL`, and **pooled migrations are prohibited** (recorded P1001 failure
  path). Keep provider pre-deploy migrate **disabled** on Neon-backed environments
  and **run migrations from the controlled operator process against the verified
  DIRECT endpoint** (per the CU-burn rollout runbook §4.2), until the gated
  `MIGRATION_DATABASE_URL` workstream (r1 §13.6 / D-R8) is implemented. This is the
  single most important operational constraint: **migrate against the DIRECT
  (non-pooled) staging endpoint from an operator shell, not via Railway.**

**Ordered steps (staging):**

0. **Pre-window freeze.** Freeze the branches/PRs in §7 so the candidate SHA and the
   migration set cannot move mid-window. Announce the window.
1. **Confirm the candidate.** `git fetch origin && git rev-parse origin/main` must
   equal `d95e70cf…d780e`. Check out that SHA in the operator environment.
2. **Env preconditions (BEFORE any deploy of the candidate worker):** on the staging
   worker env, ensure `MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED=false` is set (and
   confirm the sibling required maintenance vars from §4.2 are present). Leave the
   flag `false` for now — the `MerchantLead` table will not exist until step 4.
3. **Backup posture / restore point (see §5.1).** Record the current staging LSN /
   note the PITR window, and — because PITR is only 6 hours — **create an explicit
   Neon branch snapshot of staging** as a named restore point before applying. State
   the snapshot branch id in the window log.
4. **Apply the 6 migrations to staging** from the operator process against the
   **direct** staging endpoint:
   ```
   DATABASE_URL="<staging DIRECT endpoint, <STAGING_BRANCH_ID>>" \
     npx prisma migrate deploy
   ```
   This applies the 6 pending packets in timestamp order (1→6), satisfying both
   the packet-2-before-packet-5 and packet-4-before-packet-6 dependencies
   automatically. It does **not** generate new migrations. Expected result: "6
   migrations applied," staging now at 63.
5. **Verify migration state** (read-only) before touching the backend — run the §6
   `_prisma_migrations` probe; expect 63 rows, latest `20260715000000…`, zero
   unfinished/rolled_back.
6. **Deploy the candidate backend + worker** (`d95e70cf`) to staging via the
   dashboard "Deploy latest commit" (SHA-stamped) path — NOT `railway up` from a
   worktree (stale-artifact risk, per project memory). Worker boots with the
   lead-anonymise flag `false` (dormant, safe).
7. **Post-deploy probes** — run every probe in §6. Confirm worker boot log shows
   `lead-anonymise disabled` and no relation-does-not-exist errors.
8. **Enable the lead-anonymise sweep** only after §6 confirms `MerchantLead` exists:
   set `MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED=true` on staging worker and
   restart the worker. Re-check the boot log now shows `lead-anonymise ENABLED` and
   the first sweep runs clean (no error).

### 5.1 Backup posture (state honestly)

- **PITR:** the Neon project's `history_retention_seconds` = **21600 = 6 hours**.
  Point-in-time restore is available but only within a **6-hour** window. This is
  short; if a problem is discovered after 6 hours, PITR to a pre-window point is no
  longer possible.
- **Branch snapshot:** Neon branch-copy is available and is the durable restore
  posture here — create a named branch from staging (and, for the prod window, from
  production) immediately before applying, as the explicit restore point. This does
  not expire like PITR. **This is the recommended backup** given the 6-hour PITR.
- **What is NOT available / NOT verified:** there is no evidence of an external
  logical dump (`pg_dump`) backup pipeline in the repo runbooks; the
  `deploy-security-runbook.md` §7 assumes Neon PITR + branch snapshots as the backup
  mechanism and even prescribes a one-time restore drill on staging. I did **not**
  execute any backup (read-only boundary). The owner must actually create the branch
  snapshot at window time; nothing here has done so.

### 5.2 Rollback limitations

- All 6 packets (and the 5 intervening prod-only migrations) are **additive /
  forward-only**. A code rollback to the pre-candidate backend leaves the new
  tables/enums in place, harmlessly unused — **no DB rollback is required for a code
  rollback** (`deploy-security-runbook.md` §10: "migrations are additive, so a code
  rollback doesn't require a DB rollback").
- Prisma does **not** auto-generate down-migrations; there is no `migrate undo`.
  Removing a packet would require a hand-written destructive migration (DROP TABLE /
  DROP TYPE), which is only safe while the tables are empty. Do not attempt this
  during the window; prefer forward-fix.
- `ALTER TYPE ... ADD VALUE` (packets 1, and the intervening enum adds) **cannot be
  rolled back** cleanly — an added enum value cannot be dropped without recreating
  the type. Another reason to treat the whole set as forward-only.
- If something goes wrong mid-apply: rely on the branch snapshot from §5.1 (restore
  the branch), not on a down-migration.

---

## 6. Post-deploy probes (read-only)

Run all against the target environment after apply + deploy. SQL probes via the
read-only path; HTTP probes against the deployed service.

**P0 — migration state (gate for everything else).**
```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE finished_at IS NULL) AS unfinished,
       count(*) FILTER (WHERE rolled_back_at IS NOT NULL) AS rolled_back,
       max(migration_name) AS latest
FROM _prisma_migrations;
-- expect (staging): total=63, unfinished=0, rolled_back=0,
--        latest='20260715000000_d65_agreement_reviewed_body'
```

**P1 — D65 MerchantAgreementRecord (packet 4).**
```sql
SELECT to_regclass('public."MerchantAgreementRecord"') AS tbl,
       EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AgreementSignMethod') AS enum_ok;
-- expect: tbl not null, enum_ok = true
```
HTTP: exercise the agreement service boot path (admin agreement/D65 endpoint or the
merchant onboarding step-7 route once enabled) and confirm a 200/expected response,
not a 500 relation error.

**P1b: D65 reviewed-body columns (packet 6).**
```sql
SELECT to_regclass('public."MerchantAgreementRecord"') AS tbl,
       (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'MerchantAgreementRecord'
          AND column_name IN ('reviewedContentHash', 'reviewedBody', 'pdfHash')) AS col_count;
-- expect: tbl not null, col_count = 3
```
HTTP: exercise the D65 sign path (assisted ceremony or self-serve) and confirm the
write succeeds: i.e. `merchantAgreementRecord.create` no longer throws a Postgres
`column "reviewedBody"/"reviewedContentHash"/"pdfHash" of relation
"MerchantAgreementRecord" does not exist` error. Before packet 6 this insert 500s;
after, it succeeds.

**P2 — Team & Roles: AdminCapabilityGrant + FIELD enum (packet 1).**
```sql
SELECT to_regclass('public."AdminCapabilityGrant"') AS tbl,
       'FIELD' = ANY (enum_range(NULL::"AdminRole")::text[]) AS field_role_ok;
-- expect: tbl not null, field_role_ok = true
```

**P3 — Leads: MerchantLead + sweep-ready (packet 2).**
```sql
SELECT to_regclass('public."MerchantLead"') AS tbl,
       (SELECT count(*) FROM "MerchantLead") AS rows;   -- expect tbl not null, rows=0
```
After enabling `MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED=true`: confirm the worker
boot log line reads `... lead-anonymise ENABLED ...` and that no
`relation "MerchantLead" does not exist` appears in worker logs on the next tick.

**P4 — Notes: MerchantNote + MerchantNoteEvent (packet 3).**
```sql
SELECT to_regclass('public."MerchantNote"') AS note_tbl,
       to_regclass('public."MerchantNoteEvent"') AS event_tbl;
-- expect: both not null
```

**P5 — Account-deletion / invite scrub (packet 5, the hard dependency).**
```sql
SELECT to_regclass('public."MerchantInvite"')      AS invite_tbl,
       to_regclass('public."InviteRewardGrant"')   AS grant_tbl,
       to_regclass('public."BusinessSuppression"') AS suppression_tbl;
-- expect: all three not null
```
HTTP (behavioural, the real gate for the hard dependency): on a disposable staging
customer, drive `POST /api/v1/auth/customer/delete-account` (with a valid action
token) and confirm it returns `{ message: 'Your account has been deleted.' }` and
the transaction commits — i.e. `scrubInvitesForUser` no longer throws. Before packet
5 this path 500s; after, it succeeds.

**P6 — Worker boot clean.** Inspect the worker startup log: expect
`[worker] maintenance scheduler started (outbox …, pending-hours …, claim-stale …,
lead-anonymise disabled; …)` on first deploy (flag false), then `lead-anonymise
ENABLED` after step 8, with no env-validation throw and no relation errors.

**P7 — Existing core health (regression guard).**
- Admin OTP login: drive the admin auth flow end-to-end; expect a session.
- Merchant portal read flows (merchant list, branch read, voucher list) return 200.
- A read that exercises the enum adds from the intervening migrations (for the prod
  window especially): a branch read returns `locationConfidence` values without
  error; a voucher governed-edit read (`VoucherPendingEdit`) works.
```sql
-- sanity: no failed/partial migration anywhere
SELECT migration_name FROM _prisma_migrations
WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;   -- expect 0 rows
```

---

## 7. Freeze list (freeze immediately before the window)

**No open PR adds a migration** under `prisma/migrations/`. The migration set is
stable at the 6 packets (packet 6 landed via `#516`, now merged, not an open PR);
there is no risk of a seventh packet landing mid-window from an open PR. Confirmed
by enumerating `gh pr list --state open --json number,files` (re-run 2026-07-18,
29 open PRs, zero touching `prisma/migrations/**` or `prisma/schema.prisma`).

The D65 personalised-agreement backend (`d95e70cf`, `#516`) is itself part of the
candidate now, not a separate held PR; it is a **coupled release** with packet 6:
the sign service writes `reviewedBody` / `reviewedContentHash` / `pdfHash`, columns
packet 6 adds (see §3). Both must land together in the window.

Open PRs that touch backend/schema-adjacent paths and should be **held from merge**
during the window to keep the candidate SHA (`d95e70cf`) stable:

| PR | Head branch | Touches | Why freeze |
|---|---|---|---|
| #507 | `fix/map-distance-user-relative` | `src/api` (map distance fix) | Merging moves `origin/main` off the candidate SHA. Hold until after the window. |
| #400 | `chore/seed-demo-huddersfield` | `prisma/seed-demo.ts`, `prisma/seed-data/…`, `src/api` | Seed/demo data script. Not a migration, but a data-writing change; must not run against production, and moves the SHA. Freeze. |
| #338 | `feat/reencrypt-branch-pins` | `prisma/reencrypt-branch-pins.ts` (ops tool, "not executed"), `src/api` | Ops migration tool, explicitly not executed. Freeze from merge and from execution during the window. |

Also freeze any in-flight local branch that adds a migration or changes
`prisma/schema.prisma` before the window opens. As of this packet, `origin/main`
HEAD is the candidate and no such branch is open on GitHub. (Local uncommitted work
in the working tree is out of scope for a shared window; the candidate is the pushed
SHA.)

Recommended freeze action: announce a merge freeze on `main` for the window
duration; do not merge #507 / #400 / #338 (or anything else) until staging is
verified and the owner decides on the production window.

---

## 8. Boundaries, commands NOT run, uncertainties, assumptions

**Read-only boundary honoured.** No migration applied, no deploy, no DB mutation, no
env/secret/provider change, no `railway redeploy` / `railway up`. Every DB read was
a `SELECT` via the read-only `neon-observer` MCP.

**Commands I deliberately did NOT run (would mutate / out of scope):**
- `npx prisma migrate deploy` (staging or production) — would apply migrations.
- `npx prisma migrate status` against a live DB — needs a `DATABASE_URL` and would
  connect with write-capable creds; I derived the diff instead from read-only
  `_prisma_migrations` SELECTs vs the repo migration directory (authoritative and
  non-mutating).
- Any Neon branch create/snapshot — a mutation; the owner must create the restore
  snapshot at window time.
- Any deploy / env-var set / worker restart.
- `git push` of the packet branch — the lead pushes (per dispatch).

**Uncertainties / things the owner must confirm:**
1. **Production scope.** Production is 11 migrations behind, not 6. I verified all 11
   are additive, but the owner must explicitly consent to applying the 5 intervening
   already-shipped migrations to production in the same window (or decide to apply
   them first as a separate, lower-risk step).
2. **Backup posture.** PITR is only 6 hours; I could not and did not create a branch
   snapshot. The owner/operator must create it at window time. There is no evidence
   of an external `pg_dump` pipeline; if one exists it is outside the repo.
3. **Direct-endpoint credentials.** The runbook mandates migrating from the operator
   process against the **direct** (non-pooled) endpoint. I did not access or verify
   the direct connection string (secret). The operator must supply it; do not use
   the pooled Railway `DATABASE_URL` (P1001 failure path).
4. **Worker env vars on staging/prod today.** I read the code contract (the
   lead-anonymise flag is required for boot) but could not read the actual deployed
   worker env. Confirm `MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED` (and the sibling
   required maintenance vars) are set on each environment before deploying the
   candidate worker.
5. **Behavioural probes** (P1/P5/P7 HTTP) require a running deployed service; I could
   not run them read-only. They are for the owner to execute post-deploy.

**Assumptions:**
- "Staging" = the Neon branch named `staging` (`<STAGING_BRANCH_ID>`), matching
  the dispatch. "Production" = the primary/default branch named `production`
  (`<PRODUCTION_BRANCH_ID>`).
- `migrate deploy` applies pending migrations in lexical `migration_name` (timestamp)
  order, which preserves the packet-2-before-packet-5 dependency without manual
  ordering.
- The candidate is the pushed `origin/main` SHA `d95e70cf`, not any local working-tree
  state.

---

## 9. D65 lane-2 evidence UI (#537) : activation checkpoint

This is a NAMED activation checkpoint, not an informal follow-up. PR #537 (admin signing-evidence
read + server-proxied signed-PDF retrieval) is source-approved by Codex and, at head `e601354e`,
merges DORMANT behind a default-off client release gate (`NEXT_PUBLIC_EVIDENCE_UI_ENABLED`,
fail-closed `=== 'true'`; unset/invalid = OFF). The admin web auto-deploys from `main`, so the gate
is what keeps the evidence controls hidden (even for SUPER_ADMIN) and issuing zero evidence/PDF
requests after the source reaches `main` but before the compatible backend + D65 columns are live.

**State (update this line as it changes):**

- `OPEN: awaiting dormant-merge review` : DONE. Codex source-approved the dormant merge at
  `e601354e`; owner gave SHA-bound approval.
- `MERGED DORMANT: activation blocked by migration compatibility` : **CURRENT (2026-07-18).** PR
  #537 squash-merged to `main` at `edfc2a1e68f7a8642c7d858675b0529c8e311042` (approved head
  `e601354e`). Live pre-merge gate passed (head matched, MERGEABLE/CLEAN, 0 non-pass checks).
  Read-only Vercel check beforehand: `NEXT_PUBLIC_EVIDENCE_UI_ENABLED` absent from Production /
  Preview / Development (`DORMANT PROVIDER STATE CONFIRMED`). The feature is on `main` / the
  auto-deployed admin web but OFF and inert: no controls render, zero evidence/PDF requests.
  Activation stays blocked by the migration + backend window and the flag (steps below).
- `ACTIVATED AND VERIFIED` : after the activation sequence below completes and is probe-verified.

**Activation sequence (owner-executed, in order; do NOT partially apply):**

1. Apply and verify the required D65 migration set (packets 4 and 6 at minimum: the
   `MerchantAgreementRecord` table and its `reviewedContentHash` / `reviewedBody` / `pdfHash`
   columns) in the approved environment, per §5 + the §6 P1b probe.
2. Deploy and verify the compatible backend (the `d95e70cf` candidate or later, carrying the
   evidence + PDF routes and the `contract:view-evidence` capability).
3. Confirm the admin web points only to compatible environments (the API base URL targets the
   environment where steps 1 and 2 are done).
4. Obtain explicit owner approval for any provider/environment change.
5. Enable the rollout mechanism: set `NEXT_PUBLIC_EVIDENCE_UI_ENABLED=true` in the admin web's
   hosting provider (Vercel) and rebuild. (Absence/anything-but-`true` keeps it OFF; defining this
   var is the separate owner-approved provider action, not performed by feature code.)
6. Verify authorised evidence detail loads and the signed PDF downloads (OPERATIONS + SUPER_ADMIN).
7. Verify FIELD / unauthorised roles are denied (no controls, 403 on direct route calls).
8. Verify a missing/mismatched-hash PDF fails closed (502) and releases no bytes.
9. Record deployment + probe evidence and flip the state line above to `ACTIVATED AND VERIFIED`.

**Boundaries:** none of steps 1 to 9 is authorised by the #537 correction or by this packet; each
remains owner-gated. Merging #537 dormant does NOT ship the feature.
