# Neon CU-Burn Fix: Durable Maintenance Scheduler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Status: DRAFT for Codex + owner review (revision 2, post-concurrency review). Docs-only. Implementation NOT authorised.** Values gated on §15 owner decisions / §9 benchmark gates of the spec (`docs/superpowers/specs/2026-07-01-neon-cu-burn-maintenance-scheduler-design.md`) are marked **[GATED: …]** and MUST be resolved before the corresponding task runs. Do not implement, push, open a PR, access providers, deploy, or change any hold until Codex + owner approve.

**Goal:** Replace the three always-on 60s/hourly BullMQ maintenance repeatables with one process-local-timer maintenance floor of independent, bounded, advisory-locked sweeps, so Neon can scale to zero when idle, without weakening delivery/promotion durability.

**Architecture:** DB rows stay authoritative (durable guarantee); the process-local timer is Redis-independent but not durable; each sweep runs its DB work inside the same interactive transaction that holds its per-sweep `pg_try_advisory_xact_lock` (lock lifetime == work lifetime), bounded by `statement_timeout` + the Prisma interactive-tx `timeout`, then performs idempotent Redis side-effects after the lock releases; per-sweep independent state/backoff/metrics/flags; DB-authoritative clock; adminNotify-based alerting.

**Tech Stack:** Node 24 + TypeScript, Prisma 7 (`@prisma/adapter-pg`, interactive `$transaction` with explicit `timeout`, `SET LOCAL statement_timeout`), BullMQ + IORedis (fast paths only), Postgres xact advisory locks (mirrors `redemption/service.ts:410-426`), `adminNotify()` in-app alerts, vitest + loopback-Postgres integration tests.

---

## Accepted invariants (must hold at every step)

- DB records authoritative; boot re-derivation reconstructs all state; the timer is not durable.
- Redis accelerates; the floor is process-local-timer-driven (Redis-independent).
- 24h `CommunicationLog` expiry (→ FAILED + `payload` NULL) preserved exactly.
- Lock lifetime == sweep DB-work lifetime; leadership never released while DB work is in-flight; timeouts actually cancel (statement_timeout + tx rollback), no `Promise.race`.
- Per-sweep independent state/error-boundary/backoff/timeout/metrics/enable-flag/last-success/last-failure. Sequential-within-tick, each bounded.
- DB-authoritative `dbNow` per scan.
- Alert sink = `adminNotify()` in-app `ADMIN_DELIVERY_FAILED` + structured logs; never email; never PII/secret payload.
- Config startup policy (canonical, §14): `MAINTENANCE_MODE=disabled` is the ONLY intentional maintenance-off path (boots WITHOUT the scheduler + a loud structured log); when enabled or defaulted, missing/invalid scheduler config FAILS STARTUP non-zero; an unsupported `MAINTENANCE_MODE` value FAILS STARTUP; a validation failure NEVER silently becomes disabled — never a silent burn path.
- Worker stays Offline through the whole stack; one owner-approved staging activation.
- `F_idle` > 5 min always.

---

## File structure

| File | Responsibility | PR |
|---|---|---|
| `src/api/queues/maintenanceSweep.ts` (create) | `runBoundedSweep(prisma, spec)` — one interactive tx holding the per-sweep xact advisory lock; parameterized `set_config('statement_timeout',...)`; `SELECT now()`; run the DB phase on `tx`; return an explicit `SweepResult{state,full}`; run bounded (monotonic soft-budget, per-row-isolated) Phase-B side-effects after the tx settles | A |
| `src/api/queues/maintenanceScheduler.ts` (create) | Process-local timer; per-sweep state (`nextEligibleAt`, `degradedStreak`, `lastSuccessAt/FailureAt`); sequential per-tick; aligned healthy cadence + per-sweep degraded backoff; BOOT/IDLE/ACTIVE/DEGRADED; start/stop | A |
| `src/api/queues/maintenanceMetrics.ts` (create) | Per-sweep counters + structured-log emit + the `adminNotify`-based expiry/degraded alert seam with dedup window + redaction | C |
| `src/worker.ts` (modify) | Replace the 3 repeatables with `startMaintenanceScheduler`; keep email/moderation workers + the MAINTENANCE worker for the per-record pending-hours nudge; **`await scheduler.stop()` first in shutdown** (bounded active-tick drain before resource close) | A, B |
| `src/api/queues/processors/outboxReconciler.ts` (modify) | Delete `scheduleReconcile`; split `reconcileOutbox` into a `tx`-parameterised DB phase (expiry + candidate id selection using `dbNow`) returning ids, + keep the MAINTENANCE worker's per-record nudge dispatch | A |
| `src/api/queues/processors/promotePendingHours.ts` (modify) | Delete `schedulePromotePendingHours`; re-parameterise `promotePendingHours`/`promoteOnePendingHours` to run on a passed `tx` + `dbNow` (no own transaction) | B |
| `src/api/queues/processors/claimStaleSweep.ts` (modify) | Delete `scheduleClaimStaleSweep`; re-parameterise `sweepStaleClaims` on `tx` + `dbNow` | B |
| `src/api/shared/env.ts` (modify) | Fail-safe maintenance config validation (§14) | A, B |
| `tests/api/queues/maintenanceSweep.integration.test.ts` (create) | **Loopback Postgres**: lock held for the whole tx; timeout rolls back + releases + cancels; two concurrent holders of one key → one runs; per-sweep keys don't block each other; `dbNow` used not app clock | A |
| `tests/api/queues/maintenanceScheduler.test.ts` (create) | Per-sweep isolation + unexpected-rejection handling, per-sweep backoff, sequential bounds, single-flight, ACTIVE-on-needsRescan, config fail-closed (non-zero startup), cooperative-stop drain (before/after each sweep + Phase-B predicate) + `forceJoin` | A |
| `tests/api/queues/maintenanceMetrics.test.ts` (create) | expiry → deduped adminNotify + log; degraded → external log then a distinct-phase recovery notice (recovery NOT suppressed by a recent degraded); redaction; no email | C |
| `tests/api/queues/maintenance-contract-guard.test.ts` (create) | Registration-contract guard (primary) + static scan (secondary) | D |

Preserved suites (must stay green): existing outbox/promotion/stale/email tests (idempotency, window, 24h expiry, promotion idempotency).

---

## PR stack + merge order

`PR-A` → `PR-B` → `PR-C` → `PR-D`, all merged + verified **with the worker Offline**. `PR-E` (Railway/provider runbook) + `PR-F` (runbook + cost-monitoring) are docs/config after `PR-C`. **O5 is a separate future release.** Each behavioral PR (A, B, C) carries source + tests + rollback together.

---

## PR-A: Bounded locked sweep + scheduler + outbox onto it

**[GATED: §15 D1]** ownership = enforced replicas=1 + per-sweep advisory lock. **[GATED: §9]** `F_idle`/timeout numbers below are candidates pending benchmarks; the mechanism is not gated.

### Task A1: Bounded locked-sweep wrapper (lock lifetime == work lifetime)

**Files:** create `src/api/queues/maintenanceSweep.ts`; test `tests/api/queues/maintenanceSweep.integration.test.ts` (loopback Postgres).

- [ ] **Step 1: Write failing loopback-Postgres tests** (mocks alone are insufficient — Codex #2)

```ts
// Against the loopback test Prisma (tests/prisma/*.integration.test.ts pattern):
// T1 lock-held-for-whole-tx: while holder A is mid-Phase-A, a second call on connection B
//    with the SAME key gets acquired:false (pg_try_advisory_xact_lock returns false).
// T2 per-sweep-keys-independent: A holding KEY_OUTBOX does not block B acquiring KEY_PENDING.
// T3 timeout-cancels-and-releases: a Phase-A body that sleeps past the tx timeout causes a
//    rollback; afterwards the lock is free (a fresh acquire succeeds) AND no partial write persisted.
// T4 statement_timeout: a single statement exceeding STATEMENT_TIMEOUT_MS is cancelled server-side.
// T5 dbNow: the body receives a dbNow from SELECT now(); a skewed app Date() is NOT used.
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/api/queues/maintenanceSweep.integration.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import type { PrismaClient, Prisma } from '../../generated/prisma/client'

/** Explicit sweep-result STATE contract (Codex #1) — every run resolves to exactly one state. */
export type SweepState = 'SUCCESS' | 'LOCK_SKIPPED' | 'TIMEOUT' | 'FAILURE'
export interface SweepResult { state: SweepState; full: boolean; error?: unknown }

export interface SweepPhaseA<TSide> {
  /** Light, DB-only work on `tx` (the connection holding the lock), using `dbNow`. Returns Phase-B side-effects. */
  (tx: Prisma.TransactionClient, dbNow: Date): Promise<{ full: boolean; sideEffects: TSide }>
}
export interface PhaseBBudget { maxItems: number; budgetMs: number; monotonicNowMs: () => number; isStopping: () => boolean }
export interface BoundedSweepSpec<TSide> {
  name: string
  lockKey: bigint             // distinct per sweep
  statementTimeoutMs: number  // < txTimeoutMs (validated in env, A4)
  txTimeoutMs: number         // explicit Prisma interactive-tx timeout (NOT the 5s default)
  phaseBMaxItems: number      // Phase-B item cap
  phaseBBudgetMs: number      // Phase-B COOPERATIVE SOFT time budget (monotonic; NOT a hard cancel — see below)
  dbPhase: SweepPhaseA<TSide>
  /** Phase B: idempotent, unlocked, per-item. COOPERATIVE SOFT budget checked BETWEEN rows via a MONOTONIC
   *  clock (`monotonicNowMs`, e.g. performance.now) — Codex #2. It bounds how many rows are STARTED, NOT an
   *  in-flight `Queue.add`, which can block on a Redis outage because the shared connection uses
   *  maxRetriesPerRequest:null. The full finite producer LIFECYCLE is locked by §4.2 / Task A5; only its
   *  numeric values are benchmark/owner-gated. Each row runs in its OWN try/catch: a per-row failure does
   *  NOT stop later rows. COOPERATIVE SHUTDOWN (Codex): it ALSO checks `budget.isStopping()` BEFORE starting each row
   *  AND before every SEPARATELY-AWAITED DB/Redis/alert op WITHIN a row (an atomic single-tx row — pending-hours,
   *  and stale-claim per the owner-approved 2026-07-03 Option C amendment — is ONE awaited op, NOT broken mid-tx),
   *  returning full=true immediately when stopping — so once stop() is requested NO new row/op starts
   *  (the unprocessed durable rows stay QUEUED/PENDING and are re-selected next scan). It does NOT cancel a row
   *  already awaiting Redis/DB. Returns full=true (needsRescan) if the item cap or time budget was hit with rows
   *  remaining OR Phase A returned a full batch — so the scheduler stays on ACTIVE cadence and the durable rows
   *  are re-selected next scan. A per-row FAILURE is reported SEPARATELY (failedRows) and classifies the whole
   *  sweep FAILURE → that sweep's OWN degraded backoff, NEVER the active cadence (implementation correction,
   *  Codex PR-A round 2: Redis-down + one stale row must not re-create the tight-cadence CU burn). */
  runSideEffects: (side: TSide, budget: PhaseBBudget) => Promise<{ full: boolean; failedRows: number }>
}

export async function runBoundedSweep<TSide>(
  prisma: PrismaClient, spec: BoundedSweepSpec<TSide>, monotonicNowMs: () => number, isStopping: () => boolean,
): Promise<SweepResult> {
  let acquired = false, full = false, side: TSide | undefined
  try {
    await prisma.$transaction(async (tx) => {
      // (1) bound each statement server-side, PARAMETERIZED (no interpolation) — Codex #6
      await tx.$queryRaw`SELECT set_config('statement_timeout', ${String(spec.statementTimeoutMs)}, true)`
      // (2) leadership: xact-scoped, released only when THIS tx settles
      const lock = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${spec.lockKey}) AS locked`
      if (!lock[0]?.locked) return                                          // LOCK_SKIPPED (acquired stays false)
      acquired = true
      const nowRows = await tx.$queryRaw<{ now: Date }[]>`SELECT now() AS now`   // (3) DB-authoritative clock
      const r = await spec.dbPhase(tx, nowRows[0].now)                           // (4) light DB-only Phase A
      full = r.full; side = r.sideEffects
    }, { timeout: spec.txTimeoutMs, maxWait: spec.txTimeoutMs })
  } catch (err) {
    // tx rollback released the lock + cancelled the statement (statement_timeout / tx timeout)
    return { state: isTimeout(err) ? 'TIMEOUT' : 'FAILURE', full: false, error: err }
  }
  if (!acquired) return { state: 'LOCK_SKIPPED', full: false }
  if (isStopping()) return { state: 'SUCCESS', full: true }               // stop requested after Phase A → skip Phase B; durable rows deferred (needsRescan)
  // (5) Phase B: item-capped + monotonic-soft-time-budgeted, per-row-isolated, durably reschedulable, cooperative-stop-aware
  try {
    const b = side !== undefined
      ? await spec.runSideEffects(side, { maxItems: spec.phaseBMaxItems, budgetMs: spec.phaseBBudgetMs, monotonicNowMs, isStopping })
      : { full }
    return { state: 'SUCCESS', full: full || b.full }
  } catch (err) {
    return { state: 'FAILURE', full: false, error: err }
  }
}
```

`isTimeout(err)` recognises the Prisma tx-timeout + Postgres `57014` statement-timeout codes.

- [ ] **Step 4: Run → PASS** (loopback Postgres).
- [ ] **Step 5: Commit** — `feat(queues): bounded advisory-locked sweep (lock lifetime == work lifetime, statement+tx timeouts)`

### Task A2: Scheduler (per-sweep isolation, sequential-bounded, aligned + degraded)

**Files:** create `src/api/queues/maintenanceScheduler.ts`; test `tests/api/queues/maintenanceScheduler.test.ts`.

Config: `F_idle` **[GATED]** default 30 min prod / 60 min staging (validated > 5 min); `F_active` 5s; `EMPTY_SCANS_TO_IDLE` 2; per-sweep `statementTimeoutMs`/`txTimeoutMs`; `degradedBaseMs`/`degradedMaxMs`/`alertAfterFailures`; `stopDrainMs` (bounded active-tick drain window on shutdown) **[GATED]**.

- [ ] **Step 1: Write failing tests**

```ts
// 1. per-sweep isolation: sweep B FAILURE increments ONLY B's degradedStreak + backoff; A and C keep their own state.
// 2. unexpected rejection (Codex #1, mutation-resistant): runBoundedSweep REJECTS for sweep B → runOne classifies it
//    FAILURE for B (degradedStreak++, nextEligibleAt advanced by >= degradedBaseMs), runOne RESOLVES (never rejects),
//    and sibling C STILL runs in the same tick.
// 3. retry timing: after a FAILURE/rejection, that sweep's next run is >= degradedBaseMs away (assert no immediate
//    re-tick, i.e. nextEligibleAt is never left in the past → no tight loop).
// 4. aligned cadence: healthy sweeps share F_idle; a degraded sweep diverges onto its own backoff; timer wakes at min(nextEligibleAt).
// 5. ACTIVE on needsRescan: full=true (item cap, time budget with rows remaining, or a full Phase-A batch) keeps that
//    sweep at F_active until empty — WITHOUT dragging siblings to F_active. A per-row Phase-B FAILURE is NOT active:
//    it classifies the sweep FAILURE → degraded backoff (Codex PR-A round 2 — no Redis-down tight-cadence CU burn).
// 6. single-flight: a timer firing while a tick is in flight is a no-op (tickInFlight); arm() runs exactly once after the tick.
// 7. config (matches A4, Codex #5): missing/invalid required config → NON-ZERO startup failure; maintenance is disabled
//    ONLY when MAINTENANCE_MODE=disabled is explicitly set (never a silent disable); an unsupported MAINTENANCE_MODE value fails startup.
// 8. stop() with NO active tick: resolves { drained:true } immediately; the armed timer is cleared; no re-arm.
// 9. stop() DURING a tick (Phase A or Phase B in flight): awaits the tracked activeTick Promise and resolves
//    { drained:true } once it settles within stopDrainMs.
// 10. no re-arm after stop(): a timer firing (or a tick finishing) after stop() does NOT re-arm; `stopped` is terminal.
// 11. concurrent stop(): two stop() calls return the SAME drain Promise (one drain, not two).
// 12. drain timeout: an active tick outlasting stopDrainMs → stop() resolves { drained:false } (reported to A6 for
//     real force-close); the timeout does NOT cancel the tick (no cancellation claim) and produces no unhandled rejection.
// 13. cooperative stop mid-tick (mutation-resistant): sweeps [A,B,C]; stop() during A → the loop's post-await
//     `stopped` check BREAKS; runBoundedSweep is NEVER invoked for B or C (assert the spy call-count, not just timing).
// 14. Phase-B cooperative stop (mutation-resistant): runSideEffects sees isStopping() true before row k → returns
//     full=true and rows k..n are never STARTED (assert no side-effect fired for k..n; the durable rows are needsRescan).
// 15. forceJoin: after a drain timeout + simulated force-close (the in-flight op rejects), forceJoin(boundMs) awaits
//     the unwinding tick and resolves { joined:true } with NO unhandled rejection; a still-hung tick → { joined:false }.
// 16. alert terminal on stop (mutation-resistant): a sweep FAILS while stopped=true → recordSweepFailure (sync log) runs
//     AND degradedStreak/backoff update, but alertDegraded() is NEVER called (assert the alert-spy count is 0); NOT reclassified SUCCESS.
```

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement** (per-sweep state; no global `dbError`/`degradedStreak`/`delay`)

```ts
import type { PrismaClient } from '../../generated/prisma/client'
import { runBoundedSweep, type BoundedSweepSpec } from './maintenanceSweep'

interface SweepRuntime { spec: BoundedSweepSpec<unknown>; enabled: boolean
  nextEligibleAt: number; degradedStreak: number; lastSuccessAt?: number; lastFailureAt?: number }
export interface SchedulerConfig { idleMs: number; activeMs: number; emptyScansToIdle: number
  degradedBaseMs: number; degradedMaxMs: number; alertAfterFailures: number; stopDrainMs: number
  nowMs: () => number; monotonicNowMs: () => number }
/** stop() result — drained=true if the active tick settled within stopDrainMs; false → the drain timed out and A6 force-closes. */
export interface StopResult { drained: boolean }

export function startMaintenanceScheduler(prisma: PrismaClient, cfg: SchedulerConfig, sweeps: SweepRuntime[]) {
  let stopped = false, tickInFlight = false, timer: NodeJS.Timeout | null = null   // single-flight (Codex #3)
  let activeTick: Promise<void> | null = null                                       // the in-flight tick Promise — enables the shutdown DRAIN (Codex)
  let stopping: Promise<StopResult> | null = null                                   // idempotent stop: concurrent callers share ONE drain (Codex)
  const isStopping = () => stopped                                                   // TERMINAL cooperative stop predicate — threaded into the tick loop + Phase B (Codex)
  const emptyRun = new Map<string, number>()

  function setNext(s: SweepRuntime, delay: number) { s.nextEligibleAt = cfg.nowMs() + delay } // NO arm() here (Codex #4)
  function backoff(s: SweepRuntime) { return Math.min(cfg.degradedBaseMs * 2 ** (s.degradedStreak - 1), cfg.degradedMaxMs) }

  async function runOne(s: SweepRuntime) {
    try {
      let res: SweepResult
      try { res = await runBoundedSweep(prisma, s.spec, cfg.monotonicNowMs, isStopping) }   // explicit state; own lock/tx/budget; cooperative stop threaded into Phase B
      catch (err) { res = { state: 'FAILURE', full: false, error: err } }       // UNEXPECTED rejection → FAILURE for THIS sweep (Codex #1)
      switch (res.state) {
        case 'SUCCESS': {                                                        // a clearing scan may trigger the AlertSink RECOVERED notice — that launch is ALSO
          s.degradedStreak = 0; s.lastSuccessAt = cfg.nowMs()                    //   guarded by !isStopping() (no degraded OR recovery alert once stopping)
          const empties = res.full ? 0 : (emptyRun.get(s.spec.name) ?? 0) + 1
          emptyRun.set(s.spec.name, empties)
          return setNext(s, res.full || empties < cfg.emptyScansToIdle ? cfg.activeMs : cfg.idleMs)
        }
        case 'LOCK_SKIPPED': return setNext(s, cfg.idleMs)                       // no degrade, no tight-retry-wake
        case 'TIMEOUT':
        case 'FAILURE': {                                                        // increment ONLY this sweep (Codex #2/#3)
          s.degradedStreak++; s.lastFailureAt = cfg.nowMs()                      // per-sweep state ALWAYS updates (a failed sweep is NEVER reclassified SUCCESS when stopping)
          recordSweepFailure(s.spec.name, res.state, res.error)                  // PR-C seam: SYNC redacted log — ALWAYS, even while stopping
          if (!isStopping() && s.degradedStreak >= cfg.alertAfterFailures)       // ALERT LAUNCH IS TERMINAL under stop (Codex): the !isStopping() guard sits IMMEDIATELY
            alertDegraded(s.spec.name, s.degradedStreak)                         //   adjacent to the launch seam → NO new async alert once stop was requested
          return setNext(s, backoff(s))                                          // OWN backoff — ALWAYS advances (backoff still updates when stopping)
        }
      }
    } catch {                                                                    // last resort: runOne NEVER rejects, ALWAYS advances (no tight loop, Codex #1)
      s.degradedStreak++; s.lastFailureAt = cfg.nowMs()
      setNext(s, backoff(s))
    }
  }

  function tick() {
    if (stopped || tickInFlight) return                                    // single-flight + NO new tick once stopped (Codex #3)
    tickInFlight = true
    activeTick = (async () => {                                            // publish the in-flight tick Promise so stop() can DRAIN it (Codex)
      try {
        const now = cfg.nowMs()
        for (const s of sweeps) {                                          // COOPERATIVE STOP (Codex): check `stopped` BEFORE each sweep AND after its awaited work
          if (stopped) break                                               // before: no new sweep starts once stop was requested
          if (s.enabled && s.nextEligibleAt <= now) await runOne(s)        // SEQUENTIAL; runOne never rejects
          if (stopped) break                                               // after the await: the settled/rejected op does NOT fall through into a sibling sweep
        }
      } finally { tickInFlight = false; activeTick = null; if (!stopped) arm() }  // arm ONCE after the tick, and ONLY if not stopping (Codex #4 + shutdown)
    })()
  }
  function arm() {
    if (stopped || tickInFlight) return
    const due = sweeps.filter(s => s.enabled)
    if (!due.length) return
    const next = Math.max(0, Math.min(...due.map(s => s.nextEligibleAt)) - cfg.nowMs())
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { void tick() }, next)
  }

  for (const s of sweeps) s.nextEligibleAt = cfg.nowMs()                    // BOOT: immediate
  arm()
  return {
    // ASYNC + IDEMPOTENT bounded active-tick DRAIN (Codex shutdown). Worker shutdown AWAITS this before closing Queue/Redis/Prisma (A6).
    stop(): Promise<StopResult> {
      if (stopping) return stopping                                        // concurrent stop() callers share ONE drain Promise
      stopped = true                                                       // (1) set stopped FIRST — no new tick, no re-arm
      if (timer) { clearTimeout(timer); timer = null }                     // (2) clear the armed timer
      stopping = (async () => {
        const inFlight = activeTick                                        // (3) track the ACTIVE TICK Promise, not just tickInFlight
        if (!inFlight) return { drained: true }                           // nothing in flight → teardown proceeds normally
        let bound: NodeJS.Timeout | undefined                             // (4) await the tick within stopDrainMs; the timeout does NOT cancel it
        const deadline = new Promise<'timeout'>((res) => { bound = setTimeout(() => res('timeout'), cfg.stopDrainMs) })
        try {
          const outcome = await Promise.race([inFlight.then(() => 'drained' as const), deadline])
          return { drained: outcome === 'drained' }                       // 'timeout' → { drained:false } reported to A6 for REAL force-close
        } catch { return { drained: false } }                             // (5) every rejection caught (runOne never rejects; defensive)
        finally { if (bound) clearTimeout(bound) }                        // never leak the drain timer
      })()
      return stopping
    },
    // BOUNDED POST-FORCE JOIN (Codex): A6 calls this AFTER force-closing Queue/Redis/Prisma. The still-unwinding
    // tick rejects on its destroyed connection, is caught at every layer (runOne never rejects), then BREAKS on
    // `stopped` — so it starts NO new work and settles. This awaits it within `boundMs`, swallowing any rejection.
    // joined=false → even this bound elapsed → the equally-safe process-termination fallback (worker.ts
    // `finally { process.exit() }`, worker.ts:114) applies; `stopped` being TERMINAL guarantees no new DB/Redis op.
    async forceJoin(boundMs: number): Promise<{ joined: boolean }> {
      const inFlight = activeTick
      if (!inFlight) return { joined: true }                              // tick already settled during the drain
      let bound: NodeJS.Timeout | undefined
      const deadline = new Promise<'timeout'>((res) => { bound = setTimeout(() => res('timeout'), boundMs) })
      try {
        const outcome = await Promise.race([inFlight.then(() => 'joined' as const).catch(() => 'joined' as const), deadline])
        return { joined: outcome === 'joined' }
      } finally { if (bound) clearTimeout(bound) }
    },
  }
}
```

`recordSweepFailure`/`alertDegraded` are PR-C seams; PR-A pins them as log stubs.

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(queues): maintenance scheduler with genuinely independent per-sweep state + aligned cadence`

### Task A3: Wire the scheduler; retire the outbox repeatable (deleted, not flag-restored)

**Files:** modify `src/worker.ts`, `src/api/queues/processors/outboxReconciler.ts`.

- [ ] Split `reconcileOutbox` into `outboxDbPhase(tx, dbNow) → { full, sideEffects: ids[] }` (expiry `updateMany` + candidate `findMany` of ids, using `dbNow`) + `outboxSideEffects(ids)` (the Redis re-enqueues). Build the outbox `BoundedSweepSpec`. **Delete `scheduleReconcile`** (the 60s repeatable). Keep `startReconcileWorker` only for the per-record pending-hours nudge dispatch.
- [ ] `worker.ts`: replace `await scheduleReconcile()` with `const scheduler = startMaintenanceScheduler(prisma, cfg, [outboxSweep])`; in `shutdown()` **`await scheduler.stop()` FIRST** (the bounded active-tick drain) and let it resolve BEFORE closing Queue/Redis/Prisma (full ordered sequence in A6).
- [ ] Tests: worker boot registers no `RECONCILE_JOB` repeatable; the existing `reconcileOutbox` window/expiry/idempotency behaviours are preserved by `outboxDbPhase` (re-point those tests at the phase function).
- [ ] **Rollback for A3 (Codex #4): NO legacy-restore flag exists.** The new image has no 60s repeatable. Rollback = pause the worker (Offline) and/or redeploy the previously-verified image. Documented in PR-F.
- [ ] Commit — `feat(worker): run outbox reconcile on the durable floor; delete the 60s repeatable`

### Task A4: Fail-safe config (Codex #9)

**Files:** modify `src/api/shared/env.ts`; extend boot-mode tests.

- [ ] **Resolve `MAINTENANCE_MODE` FIRST, then the scheduler values (canonical order, §14):** (1) **`MAINTENANCE_MODE=disabled`** → boot WITHOUT the scheduler + a loud structured log (the scheduler values are NOT required in this mode); (2) **`MAINTENANCE_MODE` unset or `=enabled`** → maintenance ON (default enabled) → validate `MAINTENANCE_FLOOR_IDLE_MS` (`> 300_000`), `MAINTENANCE_FLOOR_ACTIVE_MS`, `MAINTENANCE_PHASE_B_MAX_ITEMS`/`MAINTENANCE_PHASE_B_BUDGET_MS`, per-sweep `STATEMENT_TIMEOUT_MS`/`TX_TIMEOUT_MS` (assert `STATEMENT < TX`), per-sweep enable flags; (3) any other/unsupported `MAINTENANCE_MODE` value → FAIL STARTUP non-zero (never coerced to disabled or enabled). **Fail-closed (Codex #7): when enabled or defaulted, missing or invalid config makes the validator THROW and the worker exit non-zero (supervisor-visible). A validation failure NEVER silently becomes disabled — only an explicit `MAINTENANCE_MODE=disabled` turns maintenance off. There is NO silent half-running-with-maintenance-off default and NO 60s path.** Local/test may pass explicit test config.
- [ ] Tests: `IDLE_MS=300000` rejected; `STATEMENT >= TX` rejected; **missing/invalid config (mode unset or `=enabled`) → validator throws → non-zero exit**; **`MAINTENANCE_MODE=disabled` → boots, scheduler not started, loud log emitted (scheduler values not required)**; **unsupported `MAINTENANCE_MODE` value (e.g. `off`) → validator throws → non-zero exit (never coerced to disabled)**; **an invalid config never resolves to disabled** (the test asserts a throw, not a disabled-boot).
- [ ] Commit — `feat(env): fail-safe maintenance config (F_idle>5min, statement<tx, disable-on-missing)`

---

### Task A5: Locked finite producer LIFECYCLE (readiness+command+recovery) + deterministic-jobId contract (MANDATORY pre-release gate, Codex boundedness/jobId/readiness)

**Files:** modify `src/api/queues/connection.ts` (dedicated NON-BLOCKING producer connection — lazy, finite `connectTimeout` + finite `retryStrategy`); `src/api/queues/index.ts` (producer `Queue`s use it with `skipWaitingForReady`; memoised-Queue eviction + force-disconnect; `enqueue()` requires a deterministic `jobId`); test `tests/api/queues/producerLifecycle.integration.test.ts`.

- [ ] **Locked FULL-LIFECYCLE mechanism (verify exact BullMQ/IORedis lifecycle vs installed versions; only NUMBERS gated):** a **dedicated non-blocking producer created LAZILY** (IORedis `lazyConnect:true` + BullMQ `skipWaitingForReady:true` so Queue creation does not block on 'ready'); **finite connection establishment** = `connectTimeout` + a **finite `retryStrategy`** (null after a bounded attempt/time budget so reconnection TERMINATES rather than looping); **`enableOfflineQueue:false`**; **finite `commandTimeout` + finite `maxRetriesPerRequest`**. The **blocking Worker connections stay separate at `maxRetriesPerRequest:null`** (UNCHANGED; BullMQ blocking reads require it). `commandTimeout` alone is NOT the complete bound (it starts only after a command is issued) — cold-start readiness must be bounded too. Not an open fork. **[GATED: numeric `connectTimeout` / `retryStrategy` budget / `commandTimeout` / `maxRetriesPerRequest`, benchmark]**
- [ ] **Locked creation sequence (connect-before-Queue, Codex #1):** (1) memoise one in-flight creation Promise; (2) instantiate the dedicated IORedis producer (`lazyConnect:true` + finite readiness/command options); (3) **explicitly `await redis.connect()`** inside the finite readiness policy (`connectTimeout` + finite `retryStrategy` govern this — NOT `commandTimeout`); (4) verify `'ready'`; (5) only THEN construct + memoise the BullMQ Queue; (6) `skipWaitingForReady` may remain only after the explicit ready step, or be omitted if BullMQ's ready check is then immediately satisfied; (7) on connect/readiness/BullMQ-init/version-check failure → force-`disconnect()`, remove listeners, atomically evict the creation entry, permit recreation. Without the explicit connect+ready, `lazyConnect` + `skipWaitingForReady` + `enableOfflineQueue:false` would let the FIRST Queue op reject during connection establishment even when Redis is HEALTHY. `redis.connect()` is bounded by `connectTimeout` + `retryStrategy`, NOT `commandTimeout`.
- [ ] **`commandTimeout` semantics (Codex #1):** it only rejects the caller's Promise; it does NOT prove the queued/transmitted command was cancelled or cannot run later. A timed-out `Queue.add` outcome is **UNKNOWN** — classify the row **UNKNOWN/needsRescan** (NOT definitively failed) so it is reprocessed with the SAME `jobId`, a BullMQ no-op if the first attempt actually landed. NOT a `Promise.race` fake cancel.
- [ ] **Deterministic-jobId contract (Codex #2):** `enqueue()` REQUIRES a deterministic `jobId` at the **type level** (required param, not optional) and asserts it at runtime; **no unkeyed direct `queue.add`** may bypass `enqueue`. Producer-site audit (verified anchors; the audit + PR-D guard must cover any missed site):

  | Producer site | Queue | jobId | Deterministic? |
  |---|---|---|---|
  | CommunicationLog email enqueue (`notify.ts:215`) | EMAIL | `communicationLogId` | Yes |
  | Outbox re-enqueue (`outboxReconciler.ts:97`) | EMAIL | CommunicationLog `id` | Yes |
  | Moderation enqueue | MODERATION | `branchPhotoId` | Yes |
  | Pending-hours nudge (`branch/service.ts:1058`) | MAINTENANCE | `promote-hours-${branchId}` | Yes |
  | Maintenance repeatables (reconcile/claim/promote) | MAINTENANCE | stable | DELETED by this programme (moved to the process-local floor) |

- [ ] **Memoised producer recovery (Codex #3):** producers are memoised (`makeQueue`). Invalidating errors = connection 'end'/'error' after the finite retry policy, BullMQ init/version-check rejection, `commandTimeout`, and the `enableOfflineQueue:false` immediate-reject. On such an error: **atomically evict** the Queue + connection from the maps, **force-`disconnect()`**, remove listeners (no leaked socket/listener/timer). Concurrent callers memoise the **in-flight CREATION Promise** (not just the resolved Queue) → exactly ONE replacement producer during recreation; on creation failure the entry is evicted so the next call recreates; a later enqueue after Redis recovery builds a fresh healthy producer. Deterministic `jobId` keeps the retry safe when the prior outcome was UNKNOWN.
- [ ] Tests (installed-version, simulated Redis): **Redis HEALTHY cold-start** → the first enqueue explicitly connects, reaches ready, and succeeds (one connect, one Queue); **no command is issued before 'ready'** when `enableOfflineQueue:false`; **Redis unavailable BEFORE first producer/Queue use** → bounded failure within the READINESS bound (`connectTimeout`+`retryStrategy`, not a hang); **shutdown while `connect()` is pending** remains bounded; **Redis half-open after readiness** → command await rejects within `commandTimeout`; a stalled/failed producer is **discarded** leaving no socket/listener/timer; the timed-out enqueue is classified UNKNOWN/needsRescan (not failed) and does NOT HOL-block a following sweep; **Redis recovery** → the next same-`jobId` enqueue creates a FRESH producer and succeeds **without duplication**; **concurrent callers during recreation use ONE replacement producer**; `scheduler.stop()` + shutdown (including during initial connect/readiness) are bounded and leave no handles; the deterministic-`jobId` type/runtime requirement holds; **blocking Worker connection behaviour is unchanged**.
- [ ] **Release gate:** do not declare the producer lifecycle or sweep end-to-end bounded, and do not ship v1, until the FULL lifecycle (readiness + command-await + force-close + recreation) is merged + verified.
- [ ] Commit — `feat(queues): locked finite producer lifecycle (readiness+command+recovery) + deterministic-jobId contract`

---

### Task A6: Bounded shutdown / real force-close (MANDATORY pre-release gate, Codex #4/#5)

**Files:** modify `src/worker.ts` (shutdown sequence) + `src/api/queues/index.ts` (`closeQueues` bounded close + force-disconnect); wire `AlertSink.stop()`; test `tests/api/queues/shutdown.integration.test.ts`.

- [ ] Shutdown contract (ORDERED — the tick COOPERATIVELY stops, drains, then resources close; grounded in the real `worker.ts` shutdown, `worker.ts:99-116`): (0) **terminal cooperative signal** — `stop()` sets `stopped=true` BEFORE draining; the tick loop checks it **before every sweep AND after each awaited sweep**, Phase B checks `isStopping()` **before every row AND before every separately-awaited DB/Redis/alert op within a row** (an atomic single-tx row is one awaited op, not broken mid-tx — since the 2026-07-03 Option C amendment this covers BOTH pending-hours AND the stale-claim CAS + bell transaction), and every degraded/recovery alert launch is guarded by **`!isStopping()` immediately adjacent to the seam** — so once stop is requested NO new sweep, Phase-B row, in-row op, or alert starts (a failed sweep still logs synchronously + backs off, and is never reclassified SUCCESS). It does NOT cancel an already-running Prisma/Redis op — a force-close makes that op REJECT; the cooperative signal only prevents NEW work; (1) **`await scheduler.stop()`** — async, idempotent, bounded drain within `stopDrainMs`; resolves `{ drained:true }` (tick settled) or `{ drained:false }` (bound expired). Worker shutdown AWAITS this before touching Queue/Redis/Prisma; (2) **`AlertSink.stop()`** (no new producer/alert work); (3) bounded graceful `Queue.close()` (`closeQueues()`, `worker.ts:109`) + owned worker/producer connection `quit()` (`worker.ts:108`) within a bound; (4) on drain/close-bound expiry, **REAL force-close** — `disconnect()`/destroy the producer + Redis sockets and `prisma.$disconnect()` (`worker.ts:110`) so the tick's in-flight awaited op REJECTS promptly (not a cosmetic `Promise.race`); (5) **bounded post-force join** — `await scheduler.forceJoin(joinBoundMs)` awaits the now-unwinding tick (which rejects, is caught at every layer, then BREAKS on `stopped`), swallowing every rejection; (6) **equally-safe process-termination fallback** — if `forceJoin` also times out, `shutdown()`'s `finally { process.exit(exitCode) }` (`worker.ts:114`) terminates the process; `stopped` being TERMINAL + checked before every sweep, after each awaited sweep, before every Phase-B row, before every separately-awaited in-row DB/Redis/alert op, and immediately adjacent to every degraded/recovery alert launch guarantees NO new DB/Redis/alert op regardless, `process.exit` destroys all remaining handles, and a late rejection is caught per-row or by the process-level `unhandledRejection` LOG backstop (`worker.ts:128`). `recoveryPending` stays best-effort across restart. **Ordering invariant: `stop()` (cooperative drain) → `AlertSink.stop()` → bounded `Queue.close()`/`quit()` → force-`disconnect()`/`$disconnect()` → `forceJoin()` → (fallback) `process.exit()`.**
- [ ] Tests (mutation-resistant): **stop during sweep 1 of several → later sweeps never start** (spy: `runBoundedSweep` NOT invoked for the later sweeps once `stopped`); **stop during Phase B → no later row starts** (spy: no side-effect for rows after the stop; remaining rows stay durable/needsRescan); **stop before a stale-claim row → its atomic transaction never starts; a started one commits/rolls back whole (Option C, 2026-07-03)**; **stop between any multi-op Phase-B steps → no subsequent resource op starts**; **durable rows remain eligible for later reconciliation** (unstamped/unprocessed rows are re-selected next scan); **drain timeout → force-close → the current op settles/rejects safely** (`forceJoin` resolves, every rejection caught, no unhandled rejection); **no DB/Redis operation begins after closure** — once `$disconnect()`/force-`disconnect()` have run, no sweep issues a further DB/Redis call; **concurrent `stop()` calls share one result**; **no timer re-arm after stop, no unhandled rejection, no lingering handle** (`why-is-node-running`-style assert / all owned connections destroyed); **drain success before teardown** — a tick in flight at shutdown is awaited to settle and NO Queue/Redis/Prisma close begins until `scheduler.stop()` resolves; Redis-unavailable / half-open shutdown completes within the bound, **including while the producer is in initial connect/readiness (Redis down at cold start)**; force-`disconnect()` destroys the producer connection; an in-flight AlertSink write racing `$disconnect()` rejects and is caught; no new alert launched after `stop()` (`alertDegraded` never called once `isStopping()`, even for a failing sweep).
- [ ] **Shutdown cooperative-stop source cross-check (verified against the real source):**

  | Real source (verified) | Loop shape | Cooperative-stop guarantee in this design |
  |---|---|---|
  | `worker.ts:99-116` shutdown | idempotent (`shuttingDown`); `workers.close()` → `connections.quit()` → `closeQueues()` → `prisma.$disconnect()` → `finally process.exit()` | `await scheduler.stop()` inserted FIRST; then force-close + `forceJoin`; the existing `finally { process.exit(exitCode) }` (`:114`) IS the bounded process-termination fallback |
  | `outboxReconciler.ts:95-105` | `for (const row of stale) { try { await enqueue(...) } catch {} }` | `runSideEffects` checks `budget.isStopping()` before each `enqueue`; stop → break, rows stay QUEUED (needsRescan) |
  | `promotePendingHours.ts:174-187` | `for (const row of due) { try { await promoteOnePendingHours(...) } catch {} }` (each opens its OWN `$transaction`) | same predicate before each promote; a promote already inside its tx is not cancelled — force-close/`$disconnect()` rejects it, caught per-row |
  | `claimStaleSweep.ts` (`alertOneStaleClaim`) | ONE bounded atomic transaction/row: snapshot CAS on `lastStaleAlertAt` THEN `adminNotify(tx)` — **amended 2026-07-03 (owner-approved Option C)**, replacing the former two-awaited-ops shape | predicate checked before the row; a started transaction commits or rolls back as one awaited op (never split mid-tx); a CAS loss (ownership/state changed) is a safe skip with NO bell; a bell failure rolls the stamp back → clean retry, no duplicate |
  | `worker.ts:128-134` crash policy | `unhandledRejection` → LOG + continue; `uncaughtException` → exit 1 | late post-force rejections are caught per-row / by `forceJoin`; the LOG backstop guarantees no unhandled crash |

  **Under the new model the maintenance sweeps run on the process-local scheduler, NOT inside a BullMQ Worker job**, so `worker.close()` (which drains an active BullMQ job) no longer covers them — `scheduler.stop()`'s cooperative drain + `forceJoin` is what bounds the in-flight tick.
- [ ] **Release gate:** v1 not shipped until merged + verified.
- [ ] Commit — `feat(worker): bounded shutdown with real force-close (no lingering handles) + AlertSink drain`

---

## PR-B: Pending-hours + stale-claim onto the floor (isolated)

**Files:** modify `promotePendingHours.ts`, `claimStaleSweep.ts`, `worker.ts`, `env.ts`; extend scheduler tests.

- [ ] Wrap pending-hours and stale-claim as `BoundedSweepSpec`s, each with its OWN `lockKey` + timeouts, following the outbox split: **Phase A (locked, light)** = `dbPhase(tx, dbNow)` SELECTs the due pending-hours ids (`status='PENDING' AND effectiveAt <= dbNow`, LIMIT 200) / the eligible stale-claim ids using `dbNow`, returned as `sideEffects`; **Phase B (unlocked, idempotent)** = `runSideEffects` promotes each pending-hours id via the existing **re-read-and-recheck** `promoteOnePendingHours` in its own short statement-timeout-bounded transaction, and applies each stale-claim row as ONE bounded atomic transaction (**amended 2026-07-03, owner-approved Option C**: a snapshot CAS on `lastStaleAlertAt` must WIN before `adminNotify` writes the bell inside the SAME transaction — commit-or-rollback together; `lastStaleAlertAt` dedup preserved). Each row runs in its **own try/catch** (a per-row failure does NOT stop later rows), respects the `PhaseBBudget` (`maxItems`/`budgetMs` via `monotonicNowMs`, **and `isStopping()` checked before each row — pending-hours' `promoteOnePendingHours` and the stale-claim `alertOneStaleClaim` are each one atomic tx per row (not broken mid-tx); outbox is one `enqueue` per row**), and returns `full=true` (needsRescan) if the budget/stop signal is hit with rows remaining OR Phase A returned a full batch — so the sweep stays on `F_active` and the durable rows are re-selected next scan; a per-row failure is reported via `failedRows` and classifies the sweep FAILURE → its own degraded backoff (Codex PR-A round 2), with the durable rows replaying after recovery. Keep `promoteOnePendingHours` idempotent (re-read only-if-still-PENDING + the partial-unique index) — load-bearing because Phase B is unlocked. **Shutdown edge RETIRED (Option C, 2026-07-03):** the former stop-between-`adminNotify`-and-stamp duplicate-bell edge no longer exists — the stale-claim row is atomic, so a stop before the row starts nothing and a started row commits or rolls back whole (an aborted transaction leaves the row eligible with NO bell committed). We still do not claim to cancel an in-flight transaction; the force-close makes it reject and roll back. **Delete `schedulePromotePendingHours` + `scheduleClaimStaleSweep`.**
- [ ] Add both to the scheduler's `sweeps` with their own enable flags (`MAINTENANCE_SWEEP_PENDING_HOURS_ENABLED`, `MAINTENANCE_SWEEP_CLAIM_STALE_ENABLED`).
- [ ] Keep the per-record pending-hours delayed nudge on BullMQ (unchanged accelerator).
- [ ] Tests: (1) disabling the pending-hours sweep leaves outbox + stale running (independent) **and does not enable any 60s polling**; (2) a due pending-hours row is promoted by the floor within one `F_idle` when the nudge is absent, using `dbNow`; (3) promotion idempotency preserved on `tx`; (4) stale-claim capped LIMIT-200; (5) a pending-hours DB error degrades only the pending-hours sweep.
- [ ] **Rollback:** per-sweep enable flags disable one sweep without touching the others and without enabling 60s polling; full rollback = pause worker + redeploy prior image.
- [ ] Commit per sweep — `feat(worker): pending-hours promotion on the durable floor (isolated)` / `… stale-claim …`

---

## PR-C: Observability — metrics + alerting + additive NotificationType migration (Codex #3/#4/#5)

**Files:** create `src/api/queues/maintenanceMetrics.ts`; add the additive `NotificationType` enum migration (if the new degraded type is chosen); wire seams in scheduler + outbox phase; test `tests/api/queues/maintenanceMetrics.test.ts`.

- [ ] Per-sweep counters (`scanned/re_enqueued/expired/promoted/failed{sweep}`, `degraded_db{sweep}`, last-run duration) surfaced as **structured logs** (no external metrics backend — none exists).
- [ ] **Alert execution contract `AlertSink` (Codex async-seam):** the scheduler calls the seam SYNCHRONOUSLY, never awaited. `sweepFailure(name,state,error)` = SYNC structured log. `degraded(alertKey, detail)` = SYNC void that — **when `isStopping()` it does NOTHING beyond the synchronous redacted log: it launches NO async alert (degraded OR recovery), so no alert starts after `stopped=true`; the scheduler ALSO guards each launch site with `!isStopping()` immediately adjacent to the call** — (i) logs the redacted stderr IMMEDIATELY; (ii) if not already in-flight for `alertKey`, launches the async `getAlertableAdmins` + per-recipient `adminNotify` **fire-and-forget with `.catch`** (single-flight per key — the key includes the sweep + alert-type + PHASE, so `DEGRADED` and `RECOVERED` are separate keys; clears the in-flight marker in `finally`); (iii) **skips the in-app DB write while the DB is known-degraded** (log-only) and sets a process-local `recoveryPending`; (iv) on a later successful scan (DB-recovery signal) fires the `RECOVERED`-phase recovery notice fire-and-forget (distinct identity — never suppressed by the earlier `DEGRADED`). `stop()` launches no new alert, **tracks in-flight attempts and drains them within a bound**, then proceeds to the controlled Prisma `$disconnect()` (any still-in-flight write rejects, `.catch`'d) — shutdown never waits indefinitely and cannot race `$disconnect()` into an unhandled rejection (Task A6). **Durability honesty:** `recoveryPending` is process-local → **best-effort across restart** (a restart mid-outage loses it, no notice); a guaranteed recovery notice would need a durable incident table (separately-gated follow-up).
- [ ] **Expired communication alert (Codex #3/#8/#9):** structured external log (counts + types) PLUS explicit in-app fan-out done by US — **`getAlertableAdmins(prisma)`** (active OPS + SUPER_ADMIN, the M8 / PR #237 pattern) then **one `adminNotify(prisma, { adminUserId, type, title, body, referenceId?, referenceType? })` call per recipient**. `adminNotify()` writes a SINGLE in-app `Notification` per call and does **NOT** itself fan out; it sends **no email / no CommunicationLog** (no recursion through the failing outbox). **Coalescing:** one notification per (recipient, alert-type) per window — never one-per-row. `type='ADMIN_DELIVERY_FAILED'`. **Redaction:** counts + type labels only, never payload/PIN/reset-link/PII (payload is already NULLed). Replace `outboxReconciler.ts:79-84`'s bare `console.warn`. The `adminNotify(prisma, { adminUserId, type, title, body, referenceId?, referenceType? })` contract + `getAlertableAdmins(prisma)` (active OPERATIONS + SUPER_ADMIN) are **verified** — a routine source-drift recheck is standard, not deferred.
- [ ] **Dedup (Codex #3/#10) — on `Notification.sentAt` (the model has NO `createdAt`):** before emitting, check the most-recent maintenance `ADMIN_DELIVERY_FAILED` notification's `sentAt` per (recipient/type) — and, for the degraded/recovery family, per (recipient/type/**PHASE**, so a `RECOVERED` notice is never suppressed by a recent `DEGRADED`) — and suppress if within the window **[GATED: window, candidate 15 min]**. **Race honesty:** even at ONE replica, overlapping async emitters would race a plain query-then-create, so emission is **serialized in-process by the per-alert-key single-flight** (the `AlertSink` contract above) — no double-write within a replica. Dedup is otherwise **best-effort**: a restart mid-window or a future second replica can still duplicate. The atomic upgrade (advisory lock around check-then-insert, OR a unique persisted `(type, time-bucket)` key) is the multi-emitter path. The **concurrent-emitter test asserts the SELECTED contract** (in-process single-flight; best-effort across restart/replicas), not merely alternatives.
- [ ] **Degraded vs recovery = distinct alert identities + additive migration + ordering (Codex #4 + CodeRabbit):** the alert **phase** (`DEGRADED`/`RECOVERED`) is part of BOTH the process-local single-flight key AND the persisted dedup identity, so **a `RECOVERED` notice is never suppressed by a recent `DEGRADED`** (a duplicate `DEGRADED` coalesces only with `DEGRADED`, a duplicate `RECOVERED` only with `RECOVERED`). **Minimal representation (recommended, smallest source-compatible):** ONE additive maintenance-status `NotificationType` (candidate `ADMIN_MAINTENANCE_DEGRADED`) PLUS a persisted phase discriminator (e.g. `referenceType='DEGRADED'|'RECOVERED'`) folded into the dedup key; the alternative is two distinct types (`…_DEGRADED`/`…_RECOVERED`). If the new `ADMIN_MAINTENANCE_DEGRADED` type is chosen, PR-C **includes the additive Prisma `NotificationType` enum migration** and follows **migrate-before-image** ordering (apply the additive enum migration on the Neon **direct** endpoint BEFORE the PR-C image deploys, per the approved direct-migration procedure). **No migration is authorized now**; any staging application remains gated by the existing **P1/P8/P9/R1 recovery sequence** and the approved direct-migration procedure. If an existing type is reused (with the phase discriminator), no migration is needed.
- [ ] **DB-unavailable alert:** structured external log/error WHILE the DB is unavailable (no in-app write during a DB outage). AFTER recovery: `getAlertableAdmins(prisma)` + one `adminNotify(prisma, { adminUserId, type: <ADMIN_MAINTENANCE_DEGRADED | existing>, ... })` per recipient carrying the **`RECOVERED` phase** (distinct identity — never suppressed by the earlier `DEGRADED`). **Non-DB degradation (DB still reachable):** the `DEGRADED` in-app notice MAY be written immediately, and a later successful scan emits the distinct `RECOVERED` notice. No email anywhere.
- [ ] Tests: expiry → `getAlertableAdmins` called + one `adminNotify` per recipient with `adminUserId` (NOT once total) + structured log; **dedup on `sentAt`**: a second expiry within the window emits NO new `adminNotify`; **concurrent-emitter test** (documents best-effort at replicas=1 / the atomic mechanism if chosen); degraded → external log during + per-recipient recovery notice using the explicit type after; **degraded→recovered within the SAME dedup window still emits the `RECOVERED` notice** (distinct phase identity) while a **duplicate same-phase notice inside the window is suppressed**; a **per-row Phase-B failure does not stop later rows and classifies the sweep FAILURE (degraded backoff, NOT active cadence — Codex PR-A round 2)**; redaction pin (no payload/PII); no email path invoked; **async rejection**: a rejecting `adminNotify` is `.catch`'d (NO unhandled rejection; scheduler rescheduling unaffected); **repeated degraded scans** → at most one in-flight per `alertKey` (single-flight/coalesced); **DB-degraded** → in-app write suppressed (log only); **recovery** → exactly one recovery notice after a DB-recovery signal, and a simulated restart mid-outage loses `recoveryPending` → NO notice (best-effort pinned); **alert terminal on stop** → with `isStopping()` true, a failing/degraded scan writes the sync redacted log but launches NO `adminNotify` (degraded OR recovery).
- [ ] **Rollback:** the additive enum value is forward-compatible (no data change; rolling back the image leaves an unused enum value — harmless; no down-migration). Metrics/alerts are observational.
- [ ] Commit — `feat(queues): maintenance metrics + adminNotify expiry/degraded alerting (+ additive NotificationType migration)`

---

## PR-D: Contract guard (Codex #7)

**Files:** create `tests/api/queues/maintenance-contract-guard.test.ts`.

- [ ] **Primary (registration/config contract):** construct the scheduler from the real registration and assert (a) every sweep's effective idle cadence ≥ the approved floor (`> 300_000`); (b) no BullMQ repeatable is registered for the maintenance sweeps (assert the deleted `schedule*` are absent / not called at boot); (c) the env validation rejects `F_idle <= 5min` and `STATEMENT >= TX`.
- [ ] **Deterministic-jobId producer guard (Codex #2):** a test that fails if any `Queue.add`/`enqueue` producer site omits a deterministic `jobId`, or if a direct unkeyed `queue.add` bypasses `enqueue` (which requires `jobId` at type + runtime). Catches a future producer that forgets the key.
- [ ] **Secondary (static scan):** a source scan flags any `setInterval`/`setTimeout`/`repeat.every` under a threshold that touches the DB, outside an allow-list — explicitly documented as a secondary defence, not the sole proof (it cannot catch variable-derived cadences or other scheduler APIs).
- [ ] Commit — `test(ci): maintenance registration-contract guard (+ secondary static scan)`

---

## PR-E: Railway / provider configuration runbook (owner-run; no repo code)

Docs only. **[GATED: owner + provider]**
- **Enforce AND verify worker replicas = 1 in Railway** (not just a policy line) — the advisory lock is overlap protection, not permission for N replicas; N replicas each wake the DB.
- Staging autoscaling fixed/low CU + scale-to-zero on (candidate 0.25) **[GATED: §9 idle-CU measurement]**.
- Keep the worker Offline until the whole stack (A-D) is verified + cost-accepted (§9 rollout).
- Production autoscaling sizing (min/max, not 0.25-8) **[GATED: owner]**; `F_idle` per environment **[GATED: benchmark]**.
- Record the owner-set `$20` limit as owner-set; hard-stop enforcement UNVERIFIED.

## PR-F: Runbook + cost-monitoring + deployment/rollback/observation (output 7)

Docs only. Adds to `docs/runbooks/deploy-security-runbook.md` (or a new maintenance-scheduler runbook):
- **Rollout (Codex #8):** worker Offline through PR-A..PR-D; merge + verify the whole stack first; benchmark on disposable loopback Postgres unless separately approved; complete PR-E provider/runbook gates; **one owner-approved staging activation**; observe 48-72h; stop/pause on any failed cost/latency/correctness gate. No incremental "deploy PR-A while the other 60s sweep still runs."
- **Rollback (Codex #4, executable):** primary = **pause the worker (Offline) + redeploy the previously-verified image** (the prior image carries the old 60s repeatables; redeploy is a deliberate, cost-accepted emergency, normally with the worker paused). The new image contains **no** flag that re-enables 60s polling. Per-sweep enable flags disable one sweep on the floor without enabling 60s polling. **Schema/rollback model (Codex #4):** PR-C MAY apply an additive `NotificationType` enum migration (if the new degraded type is chosen); an **image rollback does NOT remove the enum value** — the unused additive value remains harmless; **no destructive down-migration** is performed; code rollback and the retained additive schema are separate concerns.
- **Observation:** 48-72h burn-rate (idle-CU, per-sweep latency, expired/FAILED/degraded counts) before declaring acceptance and before the separate worker-restart decision.
- **Records** the completed persistent-activity reduction as satisfying the worker-restart precondition (r1 §11 / §13.7 / D-R9), keeping the encryption R2/R3/R4 + Operations A/B and Phase 2B credential rotation as distinct programmes.

---

## Benchmark + acceptance gates (spec §9)

- [ ] **MANDATORY pre-release correctness gate:** verified locked finite producer LIFECYCLE (Task A5) — bounded readiness/connection establishment (lazy + `connectTimeout` + finite `retryStrategy` + `skipWaitingForReady`) AND bounded command-await + force-close + recreation (`commandTimeout` alone is NOT the complete bound); a Redis-down cold start or a stalled `Queue.add` is bounded (outcome UNKNOWN/needsRescan; jobId replay preserves correctness). Not shipped without it.
- [ ] **MANDATORY pre-release gate:** deterministic-jobId producer contract + guard (Task A5 / PR-D) — no unkeyed `Queue.add`.
- [ ] **MANDATORY pre-release gate:** bounded shutdown / real force-close (Task A6) verified with a no-lingering-handles test (incl. Redis-unavailable/half-open) + the AlertSink/`$disconnect()` race.
- [ ] `EXPLAIN (ANALYZE, BUFFERS)` on both reconciler tiers + pending-hours + stale-claim; index-covered at production-scale counts.
- [ ] Backlog benchmark: 10k+ rows drain via LIMIT-200 without lock contention.
- [ ] Idle-CU measurement per candidate `F_idle` on staging (read-only).
- [ ] Worker + DB load test; explicit worker Prisma pool `max`; no connection-budget exhaustion (account for the per-sweep locked connection + Phase-B enqueues, sequential).
- [ ] 48-72h post-activation burn-rate window.
- [ ] Stop conditions armed.

## Adversarial-review + stop-and-report

- Each behavioral PR (A, B, C) gets two-stage review + a focused adversarial review on: lock-lifetime-==-work-lifetime (no leadership release with DB work in-flight); timeout actually cancels + rolls back; per-sweep isolation (one sweep failing/timing-out does not change siblings); DB-authoritative `dbNow`; expiry preserved + alerted (`getAlertableAdmins()` + per-recipient `adminNotify`, dedup on `sentAt`, redacted, no email); config fail-closed (non-zero startup unless `MAINTENANCE_MODE=disabled`), never a silent disable or burn path; no 60s-restore flag; an unexpected sweep rejection is classified FAILURE and cannot tight-loop; Phase-B is a monotonic cooperative soft budget (Redis-blocking documented) with per-row isolation; a per-row failure classifies the sweep FAILURE (degraded backoff), never needsRescan/active (Codex PR-A round 2).
- **Stop-and-report** if: any sweep can query the DB more frequently than its `F_idle` while idle (invariant is "no more frequently than the floor," not "no query"); leadership can be released while a sweep's DB work is still in-flight; a sweep failure/timeout alters a sibling's state; the config can silently default into a cadence or 60s polling; an alert path sends email through the outbox or leaks payload/PII; the floor stops firing when Redis is down; a blocked Phase-B `Queue.add` can HOL-block later sweeps or delay shutdown (no finite producer timeout, Task A5); the async alert seam can produce an unhandled rejection or repeatedly write in-app during a DB outage; or dedup is claimed race-free within a replica without the single-flight serialization.

---

## Self-review (skill checklist)

**Spec coverage:** §4.1 per-sweep isolation → A2; §4.2 lock/timeout/tx + phased side-effects → A1; §4.3 ownership + replicas=1 verification → PR-E; §4.4 state machine → A2; §5 delivery semantics → preserved email/idempotency tests; §6 nudge → A2 ACTIVE-on-backlog + kept pending-hours nudge (B); §7 alerting contract → PR-C; §8.3 DB clock → A1/A3/B `dbNow`; §9 cost/rollout → gates + PR-F; §10 O5 out → excluded; §11 alternatives → spec; §12 failure model → adversarial list; §13 cross-check → spec; §14 fail-safe config → A4; §15 owner decisions/rollback → PR-F + [GATED]; §16 holds → unchanged.

**Placeholder scan:** cadence/timeout/window numbers are **[GATED]** on benchmarks/owner decisions (documented decision points). The alert sink is a VERIFIED contract: `getAlertableAdmins()` (active OPS + SUPER_ADMIN) + one `adminNotify(prisma,{adminUserId,type,title,body,referenceId?,referenceType?})` per recipient writing `ADMIN_DELIVERY_FAILED` (expiry) / a **phase-discriminated** degraded/recovery identity (`DEGRADED`/`RECOVERED` in both the single-flight key and the persisted dedup key — a `RECOVERED` notice is never suppressed by a recent `DEGRADED`). A routine source-drift recheck is standard; the contract is not deferred.

**Type consistency:** `SweepState = 'SUCCESS'|'LOCK_SKIPPED'|'TIMEOUT'|'FAILURE'`; `SweepResult{state,full,error?}`; `PhaseBBudget{maxItems,budgetMs,monotonicNowMs,isStopping}`; `runBoundedSweep(prisma, spec, monotonicNowMs, isStopping) → SweepResult`; `BoundedSweepSpec{name,lockKey,statementTimeoutMs,txTimeoutMs,phaseBMaxItems,phaseBBudgetMs,dbPhase,runSideEffects}`; `SweepPhaseA(tx,dbNow) → {full,sideEffects}`; `runSideEffects(side,PhaseBBudget) → {full,failedRows}`; `startMaintenanceScheduler(prisma,cfg,sweeps) → { stop(): Promise<StopResult>; forceJoin(boundMs): Promise<{joined}> }`; `StopResult{drained}`; `SchedulerConfig{idleMs,activeMs,emptyScansToIdle,degradedBaseMs,degradedMaxMs,alertAfterFailures,stopDrainMs,nowMs,monotonicNowMs}`; `SweepRuntime{spec,enabled,nextEligibleAt,degradedStreak,lastSuccessAt,lastFailureAt}` — consistent across A1-A4, B, C, D.

---

## Holds (unchanged)

All operational holds remain: `neon-observer` no-use hold; P1b/P9 blocked (P1a PASSED + P8 ESTABLISHED 2026-07-03 — r1 §13.3.1/§13.5.1; the P8 retention rule applies); no R1; no R2/R3/R4 or Operations A/B; no Phase 2B credential rotation; no Neon/Railway/Redis access, migration, deployment, restart, resume/unarchive, autoscaling change, key action; PR #338 untouched. Docs-only; implementation not authorised.
