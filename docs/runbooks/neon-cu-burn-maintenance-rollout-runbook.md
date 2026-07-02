# Neon CU-Burn Maintenance Scheduler — Provider Rollout Runbook (PR-E + PR-F)

> **STATUS: DRAFT / PREPARATION ONLY — do NOT execute.** Docs-only. No step here has been run: no provider was accessed, no variable set, no migration applied, no deployment or restart triggered, no Redis key inspected or deleted while drafting this document. Execution requires Codex review + explicit SHA-bound owner approval, and remains gated by the R1 recovery preconditions (**P1a/P1b, P8, P9 — all currently BLOCKED/OPEN**, `docs/runbooks/r1-key-rotation-activation-runbook.md` §1/§13).
>
> **Audience:** the owner (or an owner-supervised operator) preparing and later executing the staging activation of the merged Neon CU-burn maintenance scheduler (PR-A..PR-D + the CI-truthfulness fix + the explicit worker pool mechanism, all on `main`).
>
> **Companion docs (anchors):** the design spec `docs/superpowers/specs/2026-07-01-neon-cu-burn-maintenance-scheduler-design.md` (§9 cost/rollout gates, §14 fail-safe config, §15 owner decisions), the implementation plan `docs/superpowers/plans/2026-07-01-neon-cu-burn-maintenance-scheduler.md` (PR-E/PR-F sections), `docs/runbooks/r1-key-rotation-activation-runbook.md` (P1-P9, §13 recovery ordering — the sequencing spine this runbook slots into), `docs/runbooks/deploy-security-runbook.md` (§1.5 two-process build, §7 Neon safety, §10 rollback), `docs/runbooks/2026-06-25-staging-deploy-runbook.md` (staging infra state + the 🛑 do-not-recreate warning), and `docs/runbooks/railway-backend-hosting-plan.md` (D-3 direct-endpoint migration rule — ⚠️ currently an UNTRACKED file on the owner's machine; see §12 warnings).
>
> **Source of truth for cited code behaviour:** `src/worker.ts`, `src/api/shared/env.ts`, `src/api/queues/maintenanceScheduler.ts`, `src/api/queues/maintenanceSweep.ts`, `src/api/queues/maintenanceMetrics.ts`, `src/workerShutdown.ts`, `src/api/queues/processors/{outboxReconciler,promotePendingHours,claimStaleSweep,email,moderation}.ts`, `.env.example`, `prisma/migrations/` — all at `main` `1f07d90137089a952ed83e25d25ef40f36eb2412` (the governing SHA for this draft; re-verify at execution time).

---

## 0. What this runbook IS and is NOT

**It IS** the owner-gated preparation (PR-E) + rollout/rollback/observation (PR-F) procedure for ONE staging activation of the maintenance scheduler: provider configuration, migration ordering, legacy-repeatable cleanup, the deliberate worker start, and the 48-72 h observation window.

**It is NOT (hard boundaries):**
- It does **not** authorise executing anything now. Every provider step below is owner-gated and separately approved.
- It does **not** complete R1 key-rotation activation by itself. The maintenance work satisfies **only the persistent-worker-activity-reduction precondition for the worker RESTART** (r1 runbook §11 / §13.7 / D-R9) — and only **after** staging acceptance here, not at merge time.
- It does **not** touch encryption R2/R3/R4, Operations A/B, Phase 2B credential rotation, stale-claim ownership hardening (a separate owner decision), or PR #338.
- It does **not** approve any production value. Every number below is a **candidate** unless marked owner-decided.
- It does **not** permit destructive operations: no Neon branch recreation/reset, no data deletion, no Redis flush, no down-migration (staging runbook §11 🛑; deploy-security §7).

---

## 1. Recorded operational snapshot (anchors — NOT live state; re-verify EVERYTHING at execution)

The following was recorded during prior sessions. It requires **fresh owner verification** at execution time; nothing here was re-inspected while drafting (no provider access during this task).

| Item | Recorded state | Fresh verification required before execution |
|---|---|---|
| Railway project / environment | project `redeemo`, environment `staging` | Confirm project + environment + service identity in the Railway dashboard |
| Worker service | **Offline** (stopped) | Confirm stopped; confirm start command does NOT launch the daemon |
| Web service | **Failed / non-serving** on deployment `1d65f2ec…` | Confirm current deployment state + history |
| Redis (Railway) | Online | Confirm reachability + `noeviction` policy |
| GitHub auto-deploy | **Disabled** on Web AND Worker | Confirm still disabled on BOTH before any config change |
| Neon | Launch plan exists; branch/compute/endpoint state UNVERIFIED | Full P1a/P1b re-verification per r1 runbook §13.1-§13.3 |
| R1 gates | **P1 (split P1a/P1b), P8, P9 all BLOCKED/OPEN** | These gates block execution of this runbook (see §6 step 1) |
| Neon spending limit | Owner-set `$20` known | Hard-stop enforcement remains **UNVERIFIED** (§8) |

**Plainly: while P1a/P1b, P8 and P9 remain blocked, NO step of §4-§7 may execute.** The r1 runbook §13.8 recovery ordering (compute headroom → resume → P1a → pre-R1 baseline + P8 → P9 fixture → P1b → migration) must complete first or alongside; this runbook's rollout sequence (§6) states where it slots in.

---

## 2. Approved code state (source-verified at `1f07d901…`)

- **PR-A..PR-D merged** (bounded advisory-locked sweeps; process-local scheduler; per-sweep enable flags; AlertSink metrics/alerting; contract guards) + the CI-truthfulness fix (PR #354) + **the explicit worker Prisma pool mechanism** (PR #356).
- **The three 60-second/hourly BullMQ maintenance repeatables are DELETED from the code.** All recurring sweeps run on the process-local maintenance scheduler; the MAINTENANCE queue's BullMQ worker serves ONLY the per-record pending-hours delayed nudge (`src/api/queues/processors/outboxReconciler.ts` `startReconcileWorker` dispatch guard).
- **`WORKER_DATABASE_POOL_MAX` is REQUIRED for EVERY worker start** — normal boot, `MAINTENANCE_MODE=disabled`, AND `--verify-keyring-and-exit` (`resolveWorkerDatabasePoolMax`, `src/api/shared/env.ts`). Valid range integer 1-10 inclusive; no silent node-postgres default; the ceiling 10 preserves the previously-inherited maximum. **The candidate value 5 is local-benchmark staging evidence ONLY — not applied anywhere, not a production approval.**
- **Fail-closed maintenance config** (`resolveMaintenanceConfig`): `MAINTENANCE_MODE=disabled` is the only intentional off-path; enabled/unset requires ALL nine scheduler values valid or the worker exits non-zero; an unsupported mode value fails startup; a validation failure never silently disables.
- **Boot order (`src/worker.ts` `main()`):** `validateRequiredEnv()` → `resolveWorkerDatabasePoolMax(process.env)` → the `--verify-keyring-and-exit` early path (constructs Prisma via the shared `createWorkerPrisma` factory; registers NO BullMQ) → `resolveMaintenanceConfig(process.env)` → Prisma via `createWorkerPrisma` → best-effort keyring fingerprint publish → three BullMQ workers (email, maintenance-nudge, moderation) → the maintenance scheduler (unless `disabled`) → ordered bounded shutdown (`src/workerShutdown.ts`).
- **Worker concurrency:** moderation `WORKER_CONCURRENCY` (default 5); email 1; maintenance-nudge 1; maintenance sweeps sequential (1 locked DB connection at a time).
- **The worker remains Offline.** Merging the code changed no provider state.

---

## 3. PR-E — Provider configuration preparation (owner-gated; staged, no accidental deploy)

> ⚠️ **Provider variable changes may trigger a deployment even when GitHub auto-deploy is disabled.** On Railway, saving service variables can queue a redeploy of the service's current image. Therefore EVERY variable operation below: (a) is performed under this approved runbook, deliberately; (b) is staged and applied in a way the operator confirms does NOT queue an unintended deployment (r1 runbook §13.4 "Railway staged-change safety": after applying config, confirm no new deployment appears before any deliberate deploy); (c) **during PR-E preparation, any redeploy a variable save triggers would use the OLD / last-built worker image (which re-registers the 60-second/hourly repeatables = the CU burn) — it must be CANCELLED, never accepted**; the only deliberate deployments are §6 step 6 (Web) and §6 step 9 (worker, new image, full env set); and (d) any worker process start that results requires the fingerprint re-verification of §6 step 7 before the daemon start of §6 step 9.
>
> **Secrets convention (same as r1 runbook):** never print, paste, or record a secret value or connection string. Variables are set through the provider UI/secret store; preflights print only host + database identifiers (r1 §3.0). This runbook contains **no** secret values.

### 3.1 Railway service identity + posture (verify FIRST)

| # | Check | Expected | Stop if |
|---|---|---|---|
| E1 | Project/environment identity | Railway project `redeemo`, environment `staging`, the correct **worker** service selected | Any production identifier; wrong service |
| E2 | **Worker replicas = 1** | Exactly 1 replica configured (spec §4.3: the advisory lock is overlap protection, NOT permission for N replicas — every extra replica wakes the DB with lock-check queries) | Replicas ≠ 1 and cannot be set to 1 |
| E3 | Worker remains **Offline** | Service stopped throughout PR-E preparation | Worker running before §6 step 9 |
| E4 | GitHub auto-deploy | Disabled on Web AND Worker; stays disabled throughout | Auto-deploy enabled on either |
| E5 | Staged-change safety | After each variable/config save: deployment list shows NO new queued/started deployment (unless that save is the deliberate deploy step) | An unintended deployment was queued — pause, cancel/confirm state, report |
| E6 | Start command | The worker start command runs `node dist/src/worker.js` (the daemon) ONLY when §6 step 9 deliberately starts it; no restored auto-start before then | A daemon-start path exists before step 9 |
| E7 | **Railway Web pre-deploy migration command DISABLED** | The Web service's pre-deploy `npx prisma migrate deploy` inherits the Web service's runtime `DATABASE_URL` — recorded as **POOLED** (r1 §2), and pooled migrations are prohibited (§4.2). The prior pre-deploy migrate failed with **P1001** (pooled-host is a confirmed migration MISMATCH but is **not proven** to be the P1001 cause — r1 §13; staging runbook D-3 conflictingly records the endpoint as direct — resolve LIVE via the §4.2 step-0 preflight; the disable holds under either reading). The command is **disabled BEFORE the recovery/combined activation deployment**. Changing the pre-deploy command is itself an **owner-approved provider operation** (r1 §13.4 / D-R5); apply it WITHOUT triggering an unintended deployment (E5 rules) and **confirm the deployment list is unchanged after saving** | The command cannot be disabled safely; a save queues a deployment; any migration command remains active on the Web service |

### 3.2 Neon compute posture (owner/provider-gated)

- **Scale-to-zero: enabled** on the staging compute (this is the entire point of the programme — the floor cadence must let the compute suspend; `MAINTENANCE_FLOOR_IDLE_MS` must exceed Neon's 5-minute scale-to-zero window, enforced in code by `MAINTENANCE_IDLE_FLOOR_MIN_MS = 300000`).
- **Autoscaling minimum/maximum: OWNER/PROVIDER-GATED — no value is invented here** (spec §15 decision 7). Record the chosen min/max in the §9 ledger when the owner decides; verify actual settings at execution.
- **Connection budget coordination:** the worker's explicit pool (`WORKER_DATABASE_POOL_MAX`, ≤10) plus the API service's Prisma pool (which still uses the implicit node-postgres default max of 10 — `src/api/plugins/prisma.ts`, intentionally out of this programme's scope) must fit the Neon compute's connection budget at the chosen autoscaling size. Verify the provider's connection limit for the chosen compute size before locking values; do not assume headroom.
- **The `$20` owner-set spending limit is known; its hard-stop enforcement is UNVERIFIED** — treat it as budget signal, never as guaranteed cost protection (§8).

### 3.3 Worker environment variables (complete required set)

Every value below marked **[CANDIDATE]** is benchmark-derived or `.env.example`-derived and remains **owner/provider-gated** — setting it in staging is an owner decision at execution time; nothing is applied by this document. Final `F_idle`/`F_active` numbers are **NOT decided here** (spec §9 benchmark gates + §15 decision 6).

| Variable | Requirement (source: `src/api/shared/env.ts` + `.env.example`) | Candidate (staging) | Status |
|---|---|---|---|
| `WORKER_DATABASE_POOL_MAX` | **REQUIRED for every worker start** (normal boot, `MAINTENANCE_MODE=disabled`, `--verify-keyring-and-exit`). Integer 1-10 inclusive; fail-closed; no silent default. Coordinate with the API pool + Neon connection budget (§3.2). | `5` **[CANDIDATE — 2026-07-01 provider-free benchmark evidence only; NOT applied; NOT a production approval; production value separately gated]** | Owner-gated |
| `WORKER_CONCURRENCY` | Optional; moderation worker concurrency; default 5 | keep default `5`; **any increase requires a coordinated pool/DB-capacity review** (it raises worst-case simultaneous DB work against the pool max) | Owner-gated on change |
| `MAINTENANCE_MODE` | `disabled` \| `enabled` \| unset (unset ⇒ enabled). Unsupported value fails startup. `disabled` boots WITHOUT the scheduler (email/moderation/nudge still run) + a loud log. | `enabled` for the activation (step 9); if a worker start is ever needed WITHOUT the floor, `disabled` explicitly | Owner-gated |
| `MAINTENANCE_FLOOR_IDLE_MS` | Required when enabled; integer > 300000 (must exceed Neon's 5-min scale-to-zero window) | `1800000` (30 min) **[CANDIDATE — final value benchmark/owner-gated; spec §9 table: 30 min ≈ ~30 CU-hr/mo at 0.25 CU]** | Owner-gated |
| `MAINTENANCE_FLOOR_ACTIVE_MS` | Required when enabled; integer > 0 (backlog-drain cadence) | `5000` **[CANDIDATE]** | Owner-gated |
| `MAINTENANCE_PHASE_B_MAX_ITEMS` | Required when enabled; integer > 0 | `200` **[CANDIDATE — matches the locked LIMIT-200 batch shape]** | Owner-gated |
| `MAINTENANCE_PHASE_B_BUDGET_MS` | Required when enabled; integer > 0 | `10000` **[CANDIDATE]** | Owner-gated |
| `MAINTENANCE_STATEMENT_TIMEOUT_MS` | Required when enabled; integer > 0; **must be < TX timeout** | `4000` **[CANDIDATE]** | Owner-gated |
| `MAINTENANCE_TX_TIMEOUT_MS` | Required when enabled; integer > 0 | `8000` **[CANDIDATE]** | Owner-gated |
| `MAINTENANCE_SWEEP_OUTBOX_ENABLED` | Required when enabled; exactly `true`/`false` | `true` | Owner-gated |
| `MAINTENANCE_SWEEP_PENDING_HOURS_ENABLED` | Required when enabled; exactly `true`/`false` | `true` | Owner-gated |
| `MAINTENANCE_SWEEP_CLAIM_STALE_ENABLED` | Required when enabled; exactly `true`/`false` | `true` | Owner-gated |

Notes:
- An invalid/missing value in ANY of the above (per its mode) makes the worker **exit non-zero at boot** with an aggregated `[env] Refusing to start…` error — that is the designed behaviour, not an incident; fix the variable and retry deliberately.
- The three per-sweep enable flags are ALSO the per-sweep rollback switches (§7): disabling one sweep leaves the siblings on the floor and never restores any 60-second polling.
- The existing 24 staging variables (staging runbook §6.1 / §A) stay untouched; **`ENCRYPTION_KEY` is never regenerated** (r1 P4).

### 3.4 What PR-E preparation does NOT do

- It does not start the worker (that is §6 step 9, after migrations + verify-keyring + cleanup).
- It does not apply migrations (§4) or touch Redis (§5).
- It does not modify the Web service beyond what the r1 recovery sequence already governs.
- It does not decide production values — production sizing/cadence is a separate owner decision after staging evidence (§8, §9).

---

## 4. Migration inventory + ordering (migrate-before-image; direct endpoint only)

### 4.1 Inventory — present in `main` but NOT proven applied to staging

**Application state is NOT inferred from Git.** The last recorded staging evidence (r1 runbook P5, drafted pre-PR-C) showed `20260629000000_keyring_fingerprint` pending. Since the recorded deployable baseline (the protected pre-R1 branch at `53bafac4…`; the Web service has NO serving deployment — recorded Failed on `1d65f2ec…`), `main` has added exactly TWO migrations:

| Migration | Programme | Content (verified additive) | Rollback behaviour |
|---|---|---|---|
| `20260629000000_keyring_fingerprint` | R1 | `CREATE TABLE "KeyringFingerprint"` + unique index; no column drops, no backfill | Code rollback leaves a harmless empty table; NO down-migration |
| `20260702000000_maintenance_alert_types` | Neon CU-burn PR-C | `ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_MAINTENANCE_DEGRADED'` + `…'ADMIN_MAINTENANCE_RECOVERED'` — additive enum values only | Code rollback leaves two unused enum values — harmless; **additive enum values are NOT removed; there is NO destructive enum down-migration** |

Earlier migrations' staging state is likewise unproven from Git; the fresh `prisma migrate status` below is the only authority.

### 4.2 Ordering + procedure (mirrors r1 §2-§3; owner-run)

0. **Provider pre-deploy migration hook disabled FIRST (§3.1 E7).** Migrations for this activation run **ONLY ONCE, from the controlled operator process on the verified DIRECT endpoint** (step 1 below) — **the provider runs NO migration at all**; that invariant, not the endpoint class, is the single source of truth for this gate. Context: the Railway Web pre-deploy `npx prisma migrate deploy` inherits the Web service's runtime `DATABASE_URL`, whose recorded endpoint class **conflicts across sources** (r1 §2 records it POOLED and pooled migrations are prohibited; staging runbook D-3 records the endpoint as direct) — and the prior pre-deploy migrate failed with P1001 (pooled host = confirmed migration mismatch, though not proven to be the P1001 cause, r1 §13). **At execution, resolve the conflict live as part of E7:** record the Web service's actual pre-deploy command and its runtime endpoint class via the credential-safe host preflight pattern (r1 §3.0 — host + db identifiers only, never the secret). **The disable requirement holds under EITHER reading** — a provider-run migration is out of policy for this activation regardless of endpoint. E7 must be verified DONE before step 4 below and re-verified at §6 step 6. (Web-only: the **worker** service carries no pre-deploy migrate hook — the Procfile has no release line and §6 step 9 is a daemon start, not a migration.)
1. **Fresh target-identity verification (P1b)** — the Neon **direct** (non-`-pooler`) endpoint, exact database, exact migration role + grants, via the separately-approved read-only preflight (r1 §13.2/§13.3) and the credential-safe §3.0 preflight (prints host + db only; never the secret). **Pooled endpoints are prohibited for migrations** (hosting plan D-3; r1 §2). Railway's runtime `DATABASE_URL` stays pooled and unchanged.
2. **`npx prisma migrate status`** from the controlled operator process (direct `DATABASE_URL` injected by the secret store; never inline). **Expected pending set for a combined activation from current `main`: exactly `20260629000000_keyring_fingerprint` + `20260702000000_maintenance_alert_types`.** Record the FULL pending list verbatim.
3. **Stop conditions:** any pending migration OUTSIDE the expected set; any non-additive statement in a pending migration; a pooled/`-pooler` host; any production identifier; a role lacking migration permissions; `migrate status` reporting drift/failed state. STOP and report — the owner decides.
4. **Apply additive migrations BEFORE the new image** (`npx prisma migrate deploy`), then re-run `migrate status` → "Database schema is up to date." The new image (which emits `ADMIN_MAINTENANCE_DEGRADED`/`RECOVERED` notifications and publishes `KeyringFingerprint` rows) must never boot against a schema missing them.
5. **Image/schema rollback separation:** a code/image rollback NEVER requires a DB rollback here (both migrations additive — deploy-security §10). No destructive down-migration exists or is authorised. A genuine destructive surprise ⇒ STOP + the separate owner-approved incident path (r1 §8; never branch recreation or data deletion).
6. **Post-deployment migration policy (standing):** do **NOT** restore the old pooled pre-deploy migration command after the activation. Automatic provider migration stays **disabled**; permanent migration automation remains **blocked until the separately-approved `MIGRATION_DATABASE_URL` workstream (r1 §13.6 / D-R8) is implemented and verified fail-closed**. Staging/production migrations must **never silently fall back to the pooled `DATABASE_URL`** — the controlled operator process on the direct endpoint is the only migration path until D-R8 lands.

### 4.3 Reconciliation with the R1 runbook (explicit contradictions — owner decision D-M1)

- **r1 P5 states the KeyringFingerprint migration must be "the ONLY pending migration".** That was true when drafted; from current `main` the honest pending set is the TWO migrations above. Resolution paths (owner decision, §9 D-M1): **(a) sequential** — run the r1 activation first from a re-anchored R1 SHA applying only its migration, then this rollout applies `maintenance_alert_types`; or **(b) combined (recommended)** — one activation from current `main` whose expected pending set is exactly the two migrations, superseding P5's "only pending" wording for the combined path. Either way, an UNEXPECTED third pending migration is a hard stop.
- **r1 P3 pins "`src/` equivalence to `b66b0f95`"** — now FALSE on `main` (the maintenance scheduler + worker-pool code merged). `<R1_COMMIT>` must be **re-anchored to a fresh owner-approved SHA** (currently `1f07d901…` or later) before the r1 activation deploys. Recorded in the r1 runbook §11 note added by this PR and in the §9 ledger (D-M2).

---

## 5. Legacy Redis repeatable cleanup (owner-gated operational mutation; read-only inventory FIRST)

### 5.1 The issue

The pre-PR-A code registered three BullMQ repeatables on the MAINTENANCE queue at every worker boot. The NEW code registers none — but **an already-registered repeatable persists in Redis independently of the worker being Offline**. Whether any exists in staging Redis is **UNVERIFIED** (no Redis access during drafting; it depends on whether the old worker ever ran against staging Redis).

**Exact legacy identities (verified from the pre-PR-A source at `53bafac4`):** queue `maintenance`, BullMQ prefix `redeemo` (default; `BULLMQ_PREFIX`):

| Job name / jobId | Cadence (`repeat.every`) |
|---|---|
| `reconcile-outbox` | 60000 ms |
| `promote-pending-hours` | 60000 ms |
| `sweep-stale-claims` | 3600000 ms |

**Honest risk framing:** the NEW maintenance worker's processor dispatches ONLY jobs with `job.name === 'maintenance'` AND `job.data.job === 'promote-pending-hours'` (the per-record nudge) — a leftover legacy repeatable job is processed as a **silent no-op** (no DB query from it). So a leftover repeatable causes Redis-side churn, misleading queue counts and log/metric noise — **not a Neon CU burn by itself**. Cleanup is required hygiene + observability clarity, not the burn fix.

**MUST-PRESERVE:** the per-record pending-hours **delayed nudge** jobs (`jobId = promote-hours-<branchId>`, job name `maintenance`, `data.job='promote-pending-hours'`, one-shot with `delay`) are LIVE production state and must never be deleted. They are structurally distinct from the legacy repeatables (which carry the job names above + a `repeat` configuration) — the inventory below must show that distinction before anything is removed.

### 5.2 Procedure (two separately-approved phases)

**Phase 1 — read-only inventory (separately approved; no mutation):** using the installed BullMQ 5.78.0 API from a controlled operator process against the staging `REDIS_URL`, enumerate BOTH surfaces on the `maintenance` queue: `queue.getRepeatableJobs()` AND `queue.getJobSchedulers()` (both exist on the installed `Queue`; classic `repeat`-registered entries may surface via either depending on BullMQ-internal representation — enumerate both, mutate via the API that surfaced the entry). Record every entry's `name`/`id`/`key`/`every` verbatim, plus `queue.getJobCounts()` and the delayed-job list (to confirm which delayed entries are legitimate `promote-hours-<branchId>` nudges). **No deletion in Phase 1.**

**Phase 2 — bounded deletion (separately approved, after the owner reviews the Phase-1 inventory):**
- Delete ONLY entries whose identity EXACTLY matches one of the three legacy identities in §5.1 (name + cadence), using the matching removal API for how each was surfaced: `queue.removeRepeatableByKey(<key>)` for `getRepeatableJobs()` entries; `queue.removeJobScheduler(<id>)` for `getJobSchedulers()` entries.
- **Never** `FLUSHALL`/`FLUSHDB`, never delete keys by pattern, never touch the `email`/`moderation` queues, never delete a delayed `promote-hours-<branchId>` nudge, never `obliterate()` the queue.
- Re-run the Phase-1 inventory afterwards: the three legacy identities are gone; nudge/delayed jobs and counts otherwise unchanged.
- **Stop-and-report if identity cannot be proven exactly** (an entry resembles but does not exactly match §5.1; an unexpected repeatable exists; the API output shape differs from the installed-version expectation). No "close enough" deletion.

**Command honesty:** the exact invocation (a small read-only Node script vs a REPL) is left to the approved execution session — this document deliberately does NOT freeze a script that has never been run against live data. The API names above are verified against the installed `bullmq@5.78.0`; re-verify at execution if the dependency has moved.

**Ordering:** Phase 1 may run any time after Redis access is approved; Phase 2 SHOULD complete before the deliberate worker start (§6 step 8 before step 9) so post-activation queue metrics are clean — but a leftover no-op repeatable does not block activation correctness (risk framing above) if the owner chooses to defer.

---

## 6. PR-F — Rollout ordering (ONE owner-approved staging activation)

Every step is owner-approved, deliberate, and stops on its stop condition. The worker stays Offline until step 9.

| # | Step | Gate / evidence | Stop condition |
|---|---|---|---|
| 1 | **Reverify P1a/P1b, P8, P9 + current provider state** (r1 §1/§13; §1 snapshot above is stale by definition) | All r1 gates green; snapshot re-verified | Any gate blocked ⇒ this runbook cannot proceed |
| 2 | **Record known-good rollback evidence** — the protected pre-R1 branch (`53bafac4…`) rebuild path + a currently-visible Railway Redeploy/Rollback action (r1 P8/D-R6 BOTH-legs model) | §13.5 evidence recorded | Either evidence leg missing ⇒ P8 BLOCKED |
| 3 | **Confirm the recovery-branch / source-rebuild path** (r1 §13.4: ruleset intact; `git rev-parse` = the verified SHA) | Branch tip verified | Tip ≠ verified SHA |
| 4 | **Owner approves provider values + the cost envelope** — §3.3 candidates confirmed or replaced; Neon autoscaling min/max decided; §8 cost thresholds filled in | §9 ledger rows D-E1..D-E4 closed | Any value still open |
| 5 | **Apply the additive migrations ONCE** from the controlled operator process via the verified DIRECT endpoint (§4.2), with the Railway Web pre-deploy migration command already DISABLED (§3.1 E7 / §4.2 step 0) | `migrate status` → up to date; expected set matched exactly | §4.2 stop conditions |
| 6 | **Deliberately deploy the merged Web image** per the r1 sequence (§13.8 step 7-8 / r1 §4) — auto-deploy stays disabled; `<R1_COMMIT>` re-anchored (§4.3 D-M2). **Before clicking deploy: visually confirm the Web service's pre-deploy migration command is DISABLED** (§3.1 E7). This deploy runs **build + boot ONLY** against the already-migrated schema (step 5); Railway runs NO migration | Build+boot success (no migration executed by the provider); `/health` 200; `web` fingerprint row present | **`npx prisma migrate deploy`, any other migration command, or any pooled migration path is active on the Web service ⇒ STOP before deploying**; r1 §4 failure paths (rollback to the P8 target) |
| 7 | **Run the merged worker image with `--verify-keyring-and-exit`** (r1 §5 procedure + OWNER-GATED direct-URL injection). **`WORKER_DATABASE_POOL_MAX` MUST already be present in the operator/service env — the probe fail-closes without it** (§2). The probe registers no BullMQ, starts no sweep, and exits 0 only on a successful publish. Then verify **fingerprint parity** (r1 §6: two rows, `v2-reader-v1`, byte-identical). | Exit 0; parity PASS | Exit 1; parity mismatch — never proceed on mismatch |
| 8 | **Perform any approved legacy-repeatable cleanup** (§5 Phase 2, after the Phase-1 inventory was owner-reviewed) | Post-cleanup inventory clean; nudges preserved | Identity unprovable; unexpected entries |
| 9 | **Deliberately start EXACTLY ONE worker replica** (Railway; replicas=1 per §3.1 E2) with the full §3.3 variable set, `MAINTENANCE_MODE=enabled` | Boot logs: `[worker] prisma pool max=<N> (explicit WORKER_DATABASE_POOL_MAX; no implicit pg default)` + `[worker] started: 3 processor(s) registered…` + `[worker] maintenance scheduler started (outbox ENABLED, pending-hours ENABLED, claim-stale ENABLED; F_idle=<...>ms, F_active=<...>ms)` | Non-zero exit (env validation — fix + retry deliberately); wrong replica count; unexpected extra deployment |
| 10 | **Confirm all three sweeps registered ONCE with NO 60-second repeatable** — the step-9 scheduler log line lists the three sweeps + flags; the §5 inventory (re-run read-only) shows zero maintenance repeatables/schedulers; the BOOT scan runs immediately (spec §4.4) then settles to the floor cadence | Log + inventory evidence recorded | A repeatable (re)appears; a sweep registers twice; scan cadence beats `F_idle` while idle |
| 11 | **Staging correctness/acceptance checks** — §8.1 acceptance table | All pass | Any failure ⇒ §7 rollback ladder |
| 12 | **Observe 48-72 hours** — §8.2 operator table + §8.3 stop conditions armed | Window completes clean | Any stop trigger fires |
| 13 | **Keep other programmes blocked until their own gates pass** — staging acceptance HERE satisfies only the worker-restart precondition (D-R9); R1 rotation steps (R2/R3/R4, Operations A/B), Phase 2B, stale-claim hardening, production sizing each remain separately gated | §11 boundaries | Any attempt to piggyback another programme on this activation |

---

## 7. Rollback (executable at every stage)

**First action in ANY rollback: stop/pause the worker service** (Railway → worker → stop). The worker Offline is the known-safe state this entire programme has operated in; email/nudge/moderation pause with it (their durable rows + delayed jobs persist and drain on the next start).

| Level | Action | Effect | Cost/behaviour honesty |
|---|---|---|---|
| L0 — pause | Stop the worker service | All sweeps + processors stop; DB rows/queue jobs remain durable; Neon can scale to zero | The known-good containment posture; always safe |
| L1 — per-sweep disable | Set that sweep's `MAINTENANCE_SWEEP_*_ENABLED=false` + deliberate worker restart | Isolates ONE misbehaving sweep; siblings keep the floor; **never** restores any 60-second polling | A variable change restarts the process — deliberate, per §3 staged-change rules; fingerprint re-verification not required for a variable-only restart of the SAME image, but record the restart |
| L2 — cadence retune | Owner-approved change to `MAINTENANCE_FLOOR_*` values + deliberate restart | Slows/retunes the floor without code change | Values remain owner-gated; never below the 300000 ms floor (code-enforced) |
| L3 — image rollback | Redeploy the previously-verified image (the protected pre-R1 baseline per P8, or a later verified target) | **Reintroduces the OLD scheduling behaviour** — the prior image carries the 60-second/hourly repeatables and will re-register them at boot, resuming the CU burn. A deliberate, cost-accepted EMERGENCY only, normally with the worker paused instead | Re-run §5 cleanup after any L3 excursion back to the new image; the additive `NotificationType` values + `KeyringFingerprint` table remain harmless under the old image; **no enum down-migration ever**. **An image rollback does NOT restore the pooled pre-deploy migration command** — restoring a previous image and restoring migration policy are SEPARATE decisions (§4.2 step 6) |
| L4 — provider state | Restore provider source/variables | Only through the separately-approved provider steps (r1 §13.4 model); auto-deploy stays disabled | Never silently. **Any provider rollback that changes the pre-deploy command must preserve the direct-only migration rule** — the unsafe pooled `npx prisma migrate deploy` hook is never restored; automatic migration stays disabled until D-R8 (§4.2 step 6) |

**After every rollback action: verify the final worker state explicitly** (Railway service state + last boot log lines + whether the scheduler line shows the intended flag set) and record it. A rollback is complete only when the observed state matches the intended state.

---

## 8. Observation + stop conditions (48-72 h window)

### 8.1 Activation acceptance checks (step 11)

| # | Check | How (read-only unless noted) | Expected |
|---|---|---|---|
| M1 | Worker boot clean | Railway logs | Pool-max line + 3-processors line + scheduler line with all three sweeps ENABLED and the approved floors |
| M2 | No repeatable resurrected | §5 read-only inventory | Zero maintenance repeatables/schedulers; nudges intact |
| M3 | BOOT scan ran + settled | Structured sweep logs (AlertSink `sweepRun`) | One immediate scan per sweep, then no idle scan more frequent than `F_idle` |
| M4 | Fingerprint parity intact | r1 §6 read-only query | 2 rows, `v2-reader-v1`, identical; the worker row now refreshes at boot |
| M5 | Outbox behaviour preserved | A QUEUED CommunicationLog older than the 2-min grace is re-enqueued on the next scan; 24 h expiry intact | Matches spec §2/§7 |
| M6 | Pending-hours nudge + floor | A due pending row promotes via nudge; with the nudge absent, within one floor scan | Promotion correct, idempotent |
| M7 | Alerting live | A degraded/recovery cycle (if any occurs) produces the in-app bell per PR-C; expiry produces `ADMIN_DELIVERY_FAILED` coalesced alerts | No email; redacted |
| M8 | Web unaffected | `/health` 200; smoke per deploy-security §9 | Unchanged |

### 8.2 Operator observation table (record at least daily; more often on day 1)

| Signal | Where | What to record |
|---|---|---|
| Idle CU / burn rate | Neon dashboard (owner) | CU-hours consumed per day; compare against the §9-decided envelope + the spec §9 table |
| Compute wake frequency | Neon dashboard | Wakes/hour while idle — should approximate the floor cadence, not 60 s |
| Per-sweep duration/state/backoff | Structured `sweepRun` logs (`sweep`, `state`, `durationMs`, `full`) | Any TIMEOUT/FAILURE, degraded streaks, backoff divergence |
| Expired / FAILED / degraded / recovered counts | AlertSink counters + `ADMIN_DELIVERY_FAILED` / `ADMIN_MAINTENANCE_*` notifications + FAILED CommunicationLog rows | Counts + whether coalescing behaves |
| Backlog size / drain | QUEUED CommunicationLog + PENDING opening-hours rows (read-only counts) | Backlog drains via LIMIT-200 on `F_active`; no unbounded growth |
| DB connection usage | Neon dashboard | Peak connections vs the §3.2 budget (worker ≤ pool max; API ≤ 10) |
| Redis / queue errors | Worker logs (`[worker:reconcile] worker error`, producer errors) + Railway Redis metrics | Any connection churn or command failures |
| Web/worker health | Railway service state + `/health` | No crash loops; no unexpected restart |
| Fingerprint parity | r1 §6 query (read-only) | Still 2 identical rows |
| Unexpected deployment/restart | Railway deployment list | NONE outside the deliberate steps — any surprise deployment is a stop trigger |
| Cost-to-date + forecast | Neon billing page | Actual spend + linear forecast vs the owner envelope |

### 8.3 Stop / pause triggers

**Hard correctness/security stops (pause the worker IMMEDIATELY — L0):**
- Any evidence of data mutation outside the sweeps' contracts, wrong-target DB access, or a production identifier anywhere.
- Fingerprint parity breaks (r1 §6 mismatch semantics).
- A 60-second-style scan pattern reappears (any sweep querying more frequently than its floor while idle).
- Sweep FAILURE storms (persistent degraded streaks across restarts) or unbounded backlog growth.
- An unexpected deployment/restart not initiated by a runbook step.
- Any secret/connection-string exposure in logs.

**Owner cost thresholds — TO BE FILLED by the owner at §6 step 4 (no number invented here):**
- Daily CU-hours above `<owner value>` ⇒ pause and review.
- Forecast monthly spend above `<owner value>` (within the known `$20` limit context) ⇒ pause and review.
- **The `$20` limit's hard-stop enforcement is UNVERIFIED — never rely on it as guaranteed cost protection; the operator table is the real control.**

**Latency/backlog thresholds — to be set from staging evidence during the window (no unsupported numbers invented):** record baseline sweep durations + drain rates in the first 24 h; the owner then sets the pause thresholds for the remainder of the window.

---

## 9. Owner-decision ledger (every unresolved value/action)

| # | Decision | Status |
|---|---|---|
| D-E1 | `WORKER_DATABASE_POOL_MAX` staging value (candidate 5; benchmark evidence only) | OPEN — owner, at §6 step 4 |
| D-E2 | `MAINTENANCE_FLOOR_IDLE_MS` / `MAINTENANCE_FLOOR_ACTIVE_MS` staging values (candidates 1800000 / 5000) | OPEN — benchmark/owner (spec §15 decision 6) |
| D-E3 | Phase-B budgets + statement/tx timeouts staging values (candidates 200 / 10000 / 4000 / 8000) | OPEN — owner |
| D-E4 | Neon staging autoscaling minimum/maximum + scale-to-zero confirmation | OPEN — owner/provider (spec §15 decision 7) |
| D-E5 | Cost thresholds for §8.3 (daily CU-hours; forecast spend) | OPEN — owner, before step 9 |
| D-E6 | **Disable the Railway Web pre-deploy `npx prisma migrate deploy`** before the recovery/combined activation deployment (§3.1 E7 / §4.2 step 0) — an owner-approved provider operation; this is the same disable r1 **D-R5** requires for the recovery deploy, extended as the STANDING policy for this activation. It is NOT restored afterwards; permanent migration automation stays blocked on r1 **D-R8** (`MIGRATION_DATABASE_URL`, implemented + verified fail-closed) | OPEN — owner |
| D-M1 | Migration path: sequential (R1 first, then maintenance enum) vs **combined activation from current `main` (recommended)** with the two-migration expected set superseding r1 P5's "only pending" wording | OPEN — owner |
| D-M2 | Re-anchor `<R1_COMMIT>` (r1 P3 src-equivalence to `b66b0f95` is now false) to a fresh owner-approved SHA (`1f07d901…` or later) | OPEN — owner |
| D-C1 | Approve §5 Phase 1 (read-only Redis inventory) | OPEN — owner |
| D-C2 | Approve §5 Phase 2 (bounded deletion of exactly-matched legacy identities) after reviewing the Phase-1 inventory | OPEN — owner |
| D-F1 | Approve the single staging activation (§6 step 9) after steps 1-8 | OPEN — owner |
| D-F2 | Declare staging acceptance after the 48-72 h window ⇒ the worker-restart precondition (r1 D-R9) is satisfied | OPEN — owner |
| D-F3 | Production values (pool max, floors, autoscaling) — an entirely separate later decision from production evidence + its own runbook pass | OPEN — owner (not this activation) |
| D-P1 | `railway-backend-hosting-plan.md` is untracked but cited as an anchor by tracked runbooks — track it (its own small PR) or re-home the D-3 rule | OPEN — owner (repo hygiene; out of this PR's scope) |

---

## 10. Cross-check table (runbook step vs source/document evidence)

| Step | Source / document evidence | Expected result | Stop condition | Rollback | Owner approval |
|---|---|---|---|---|---|
| §1 snapshot re-verify | r1 runbook §1/§13; staging runbook §A | Fresh state matches or deltas recorded | Unexplained drift; production identifier | n/a (read-only) | Yes |
| §3.1 replicas=1 | spec §4.3 (lock ≠ N-replica permission); plan PR-E | Railway worker replicas exactly 1 | ≠1 | n/a (config) | Yes |
| §3.1 staged-change safety | r1 §13.4 staged-change rule; Railway behaviour (variables can trigger deploys) | No unintended deployment after any save | A surprise deployment queued | Cancel/confirm; report | Yes |
| §3.3 fail-closed env set | `resolveMaintenanceConfig` + `resolveWorkerDatabasePoolMax` (`src/api/shared/env.ts`); `.env.example` | Worker boots only with a complete valid set; exits non-zero otherwise | Any silent-default expectation | Fix variable + deliberate retry | Yes |
| §3.1 E7 / §4.2 step 0 pre-deploy disable | r1 §2 (runtime `DATABASE_URL` = POOLED, must stay pooled) + r1 §13 P1001 record (pooled host = confirmed migration mismatch, NOT proven P1001 cause); r1 §13.4 / D-R5. NOTE: staging runbook D-3 separately records the endpoint as direct and `fe10fb16`'s pre-deploy migration as successful — **reconcile the actual endpoint at execution**; the disable is safe under either reading | Command disabled BEFORE the activation deployment; deployment list unchanged after the save; NOT restored afterwards (D-R8 gates permanent automation) | Cannot disable safely; a save queues a deployment; any migration command still active at §6 step 6 | Re-verify + cancel any queued deployment; STOP | Yes (D-E6) |
| §4.2 migrate status | r1 §3.1; `prisma/migrations/` inventory (§4.1) | Pending set = exactly the two listed migrations (combined path, D-M1) | Any other pending; non-additive; pooled host; prod identifier | n/a (nothing applied) | Yes |
| §4.2 migrate deploy | migration SQLs (verified additive); deploy-security §1.5/§7 | Both applied; status clean | DDL error; wrong target | None needed (additive); surprise ⇒ r1 §8 incident path | Yes |
| §5 inventory | pre-PR-A source at `53bafac4` (exact identities); installed `bullmq@5.78.0` API (`getRepeatableJobs`/`getJobSchedulers` verified present) | Entries enumerated verbatim; nudges distinguished | API shape differs; identity ambiguous | n/a (read-only) | Yes (D-C1) |
| §5 deletion | same + `removeRepeatableByKey`/`removeJobScheduler` (verified present) | Only the 3 exact identities removed; nudges intact | Identity unprovable; unexpected entries | Stop; no pattern deletes; never flush | Yes (D-C2) |
| §6 step 6 Web deploy | r1 §4 + §13.8 | Boot clean; `web` fingerprint row | r1 §4 failures | Redeploy the P8 target | Yes |
| §6 step 7 verify-keyring | `src/worker.ts` boot order (pool max resolved BEFORE the keyring path); `keyringVerify.ts`; r1 §5-§6 | Exit 0; parity; no BullMQ | Exit 1; mismatch; missing `WORKER_DATABASE_POOL_MAX` (fail-closed refusal) | Fix env; re-probe | Yes |
| §6 step 9 worker start | `src/worker.ts` boot logs; §3.3 set | The three boot log lines; 1 replica | Non-zero exit; wrong flags/floors in the scheduler line | L0 pause | Yes (D-F1) |
| §6 step 10 no-repeatable proof | scheduler log + §5 re-inventory; PR-D contract guard (code) | Zero repeatables; floor cadence honoured | Repeatable reappears; sub-floor idle scanning | L0 pause | Yes |
| §7 rollback ladder | per-sweep flags (`env.ts` + `buildMaintenanceRegistration`); P8 image model (r1 §13.5) | Each level executable as described | L3 without cost acceptance | As per ladder | Yes |
| §8 observation | AlertSink logs/counters (`maintenanceMetrics.ts`); Neon/Railway dashboards | Signals recordable; stop triggers armed | Any §8.3 hard stop | L0 first, then ladder | Yes (D-E5 thresholds) |

---

## 11. Programme boundaries (explicit)

- **This maintenance work satisfies ONLY the persistent-worker-activity-reduction precondition** for the worker restart (r1 §11 / §13.7 / D-R9) — and only **after** the §6 step 12 observation window completes and the owner declares acceptance (D-F2). Code-merge alone satisfies nothing operationally.
- **It does NOT complete R1 activation by itself.** R1's own steps (migration, Web deploy, parity, acceptance within the P9 data boundary) remain governed by the r1 runbook; this runbook only sequences around them (D-M1).
- **Encryption R2/R3/R4 and Operations A/B remain separate programmes** with their own gates.
- **Phase 2B credential rotation remains separate.**
- **Stale-claim ownership hardening remains a separate owner decision** — not started, not implied.
- **PR #338 remains untouched.**
- **No production activation is described or approved here** — production is a later, separately-approved repeat with its own values (D-F3).

---

## 12. Warnings + contradictions register (as of this draft)

1. **P1a/P1b, P8, P9 are BLOCKED/OPEN** — this runbook is not executable until the r1 §13.8 recovery ordering closes them.
2. **r1 P3 is stale** (src-equivalence to `b66b0f95` false on `main`) — D-M2.
3. **r1 P5 "only pending migration" conflicts** with the two-migration reality of a combined activation — D-M1.
4. **`docs/runbooks/railway-backend-hosting-plan.md` is UNTRACKED** on the owner's machine yet cited as an anchor by tracked runbooks (including this one, for D-3) — D-P1.
5. **Legacy repeatable existence in staging Redis is UNVERIFIED**; if present, the new worker no-ops them (churn/noise, not DB burn) — §5.
6. **The `$20` Neon limit's hard-stop enforcement is UNVERIFIED** — never describe it as guaranteed cost protection.
7. **The API service's Prisma pool still uses the implicit node-postgres default (max 10)** — intentionally out of scope, but it is an input to the §3.2 connection budget.
8. **Railway variable saves can trigger deployments even with GitHub auto-deploy disabled** — every variable operation follows §3's staged-change rules.
8a. **The Railway Web service currently carries a pre-deploy `npx prisma migrate deploy` that inherits the runtime `DATABASE_URL` — recorded as POOLED (r1 §2)**; the prior pre-deploy migrate failed with P1001 (pooled host = confirmed migration mismatch, NOT proven to be the P1001 cause — r1 §13; staging runbook D-3 separately records the endpoint as direct — reconcile at execution). It MUST be disabled before the activation deployment (§3.1 E7 / §4.2 step 0 / §6 steps 5-6, D-E6) and is NOT restored afterwards; permanent migration automation stays blocked until r1 D-R8 (`MIGRATION_DATABASE_URL`) is implemented and verified fail-closed. Never silently fall back to pooled `DATABASE_URL` for staging/production migrations.
9. **`WORKER_DATABASE_POOL_MAX=5` is an unapplied staging candidate only** — not a production approval; no provider value is authorised by this document.
10. **23 Redis-dependent backend unit tests skip in CI without Redis** (pass locally with Redis) and **the CI integration pilot remains advisory** despite its maintenance command being genuinely green — carry-over test-signal caveats, unchanged by this PR.

---

## Closing

This is a **preparation draft**. Nothing here has been executed: no Neon, Railway, Redis or Neon-MCP access occurred while writing it; no migration was applied; no variable, deployment, restart, autoscaling or key change was made; the worker remains Offline; PR #338 is untouched. Execution requires Codex review, the r1 recovery gates, and explicit SHA-bound owner approval for each separately-gated step.
