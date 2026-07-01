// src/api/queues/maintenanceSweep.ts
//
// Neon CU-burn PR-A Task A1: the bounded advisory-locked sweep wrapper.
// Governing docs: docs/superpowers/specs/2026-07-01-neon-cu-burn-maintenance-scheduler-design.md §4.2
// + docs/superpowers/plans/2026-07-01-neon-cu-burn-maintenance-scheduler.md Task A1.
//
// One sweep run = TWO phases:
//   Phase A (locked, light, DB-only): ONE interactive transaction that (1) bounds
//   every statement server-side via a PARAMETERIZED set_config('statement_timeout'),
//   (2) takes the per-sweep pg_try_advisory_xact_lock — transaction-scoped, so the
//   lock lifetime IS the DB-work lifetime and leadership can never be released
//   while DB work is in flight, (3) reads ONE authoritative `SELECT now()` (the
//   DB clock — worker clock skew cannot move the cutoffs), and (4) runs the
//   sweep's light selection/bulk work on the SAME `tx`. Prisma's interactive-tx
//   `timeout` (explicit, NOT the 5s default) rolls the whole thing back on
//   expiry — releasing the lock AND cancelling the in-flight statement.
//   Ordering invariant: STATEMENT_TIMEOUT_MS < txTimeoutMs (validated in env, A4).
//
//   Phase B (unlocked, idempotent side-effects): AFTER the transaction settles,
//   the per-row work (Redis enqueues etc.) runs WITHOUT the lock under a
//   COOPERATIVE soft budget — an item cap + a monotonic time budget + the
//   terminal `isStopping()` shutdown predicate, all checked BETWEEN rows. The
//   budget bounds how many rows are STARTED; it does NOT cancel an in-flight
//   operation (shutdown force-close does that, Task A6). Every row runs in its
//   own try/catch: one bad row never stops the rest. Anything unprocessed stays
//   durable (still QUEUED/PENDING) and is re-selected next scan.

import type { PrismaClient, Prisma } from '../../../generated/prisma/client'

/** Explicit sweep-result STATE contract — every run resolves to exactly one state. */
export type SweepState = 'SUCCESS' | 'LOCK_SKIPPED' | 'TIMEOUT' | 'FAILURE'

export interface SweepResult {
  state: SweepState
  /** needsRescan (stay on F_active): a full Phase-A batch OR a hit budget/cooperative stop.
   *  A per-row Phase-B FAILURE also sets full=true (rows remain durable) but the run is
   *  classified FAILURE → the sweep's OWN degraded backoff, NEVER the active cadence. */
  full: boolean
  error?: unknown
}

/** Light, DB-only Phase-A work on `tx` (the connection holding the lock), using the DB clock. */
export type SweepPhaseA<TSide> = (
  tx: Prisma.TransactionClient,
  dbNow: Date,
) => Promise<{ full: boolean; sideEffects: TSide }>

/** The cooperative Phase-B budget, checked BETWEEN rows (never a hard cancel). */
export interface PhaseBBudget {
  maxItems: number
  budgetMs: number
  /** Monotonic clock (performance.now) — wall-clock jumps must not distort the budget. */
  monotonicNowMs: () => number
  /** Terminal shutdown predicate: once true, NO new row or side-effect may start. */
  isStopping: () => boolean
}

export interface BoundedSweepSpec<TSide> {
  name: string
  /** Distinct per sweep — advisory-lock identity. */
  lockKey: bigint
  /** Server-side per-statement bound. MUST be < txTimeoutMs (validated in env, A4). */
  statementTimeoutMs: number
  /** Explicit Prisma interactive-tx timeout (NOT the 5s default). */
  txTimeoutMs: number
  phaseBMaxItems: number
  phaseBBudgetMs: number
  dbPhase: SweepPhaseA<TSide>
  /** Phase B: idempotent, unlocked, per-row-isolated, budgeted via runBudgetedRows.
   *  `failedRows > 0` makes the whole sweep FAILURE (degraded backoff), while
   *  `full` alone is the benign backlog signal (active cadence). */
  runSideEffects: (side: TSide, budget: PhaseBBudget) => Promise<PhaseBOutcome>
}

/**
 * Recognise the two DB-enforced cancellation shapes that mean TIMEOUT (the
 * bounds working as designed) rather than FAILURE (something broke):
 *   - Prisma interactive-transaction timeout: code P2028;
 *   - Postgres statement_timeout / query_canceled: SQLSTATE 57014 (surfaced via
 *     meta.code on raw-query errors, or in the driver message).
 */
export function isTimeout(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: unknown; meta?: unknown; message?: unknown }
  if (e.code === 'P2028') return true
  const metaCode =
    e.meta && typeof e.meta === 'object' ? (e.meta as { code?: unknown }).code : undefined
  if (metaCode === '57014') return true
  const msg = typeof e.message === 'string' ? e.message : ''
  return msg.includes('57014') || /statement timeout/i.test(msg)
}

/** Phase-B outcome: `full` = BACKLOG signal (rows remaining for benign reasons —
 *  a full batch, a hit budget/cap, or cooperative stop) → stay on F_active.
 *  `failedRows` = SIDE-EFFECT FAILURES → the sweep is classified FAILURE and
 *  enters its own degraded backoff (NEVER the active cadence — a Redis outage
 *  plus one stale row must not re-create the 5-second CU-burn loop). */
export interface PhaseBOutcome {
  full: boolean
  failedRows: number
}

/**
 * The shared Phase-B row loop: cooperative soft budget checked BETWEEN rows.
 * Bounds how many rows are STARTED — item cap, monotonic time budget, and the
 * terminal `isStopping()` shutdown predicate (checked before EVERY row, so once
 * stop is requested no new row or side-effect begins). Each row runs in its own
 * try/catch: a per-row failure does NOT stop later rows, and is reported via
 * `failedRows` (→ sweep FAILURE + degraded backoff), NOT folded into the
 * backlog signal. Unprocessed/failed durable rows are re-selected next scan.
 */
export async function runBudgetedRows<T>(
  items: readonly T[],
  budget: PhaseBBudget,
  row: (item: T) => Promise<unknown>,
): Promise<PhaseBOutcome> {
  const startedAt = budget.monotonicNowMs()
  let started = 0
  let failedRows = 0
  for (const item of items) {
    if (budget.isStopping()) return { full: true, failedRows } // cooperative shutdown: no NEW row starts
    if (started >= budget.maxItems) return { full: true, failedRows } // item cap with rows remaining
    if (budget.monotonicNowMs() - startedAt > budget.budgetMs) return { full: true, failedRows } // time budget
    started++
    try {
      await row(item)
    } catch {
      failedRows++ // per-row isolation: later rows still run; classified FAILURE by the wrapper
    }
  }
  return { full: false, failedRows }
}

/**
 * Run ONE bounded, advisory-locked sweep. Lock lifetime == DB-work lifetime;
 * timeouts actually cancel (statement_timeout + tx rollback); Phase B runs only
 * after the lock released, cooperatively budgeted. Never throws — every outcome
 * is an explicit SweepResult state.
 */
export async function runBoundedSweep<TSide>(
  prisma: PrismaClient,
  spec: BoundedSweepSpec<TSide>,
  monotonicNowMs: () => number,
  isStopping: () => boolean,
): Promise<SweepResult> {
  let acquired = false
  let full = false
  let side: TSide | undefined
  try {
    await prisma.$transaction(
      async (tx) => {
        // (1) bound each statement server-side, PARAMETERIZED (no interpolation)
        await tx.$queryRaw`SELECT set_config('statement_timeout', ${String(spec.statementTimeoutMs)}, true)`
        // (2) leadership: xact-scoped — released only when THIS tx settles
        const lock = await tx.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(${spec.lockKey}) AS locked`
        if (!lock[0]?.locked) return // LOCK_SKIPPED (acquired stays false)
        acquired = true
        // (3) DB-authoritative clock — one read per scan, passed to every predicate
        const nowRows = await tx.$queryRaw<{ now: Date }[]>`SELECT now() AS now`
        // (4) light DB-only Phase A on the SAME connection that holds the lock
        const r = await spec.dbPhase(tx, nowRows[0].now)
        full = r.full
        side = r.sideEffects
      },
      { timeout: spec.txTimeoutMs, maxWait: spec.txTimeoutMs },
    )
  } catch (err) {
    // tx rollback released the lock + cancelled the statement
    return { state: isTimeout(err) ? 'TIMEOUT' : 'FAILURE', full: false, error: err }
  }
  if (!acquired) return { state: 'LOCK_SKIPPED', full: false }
  // Cooperative shutdown between phases: stop requested after Phase A committed →
  // skip Phase B entirely; the durable rows are deferred to the next scan.
  if (isStopping()) return { state: 'SUCCESS', full: true }
  // (5) Phase B: item-capped + monotonic-soft-time-budgeted, per-row-isolated,
  // cooperative-stop-aware, durably reschedulable.
  try {
    const b =
      side !== undefined
        ? await spec.runSideEffects(side, {
            maxItems: spec.phaseBMaxItems,
            budgetMs: spec.phaseBBudgetMs,
            monotonicNowMs,
            isStopping,
          })
        : { full, failedRows: 0 }
    if (b.failedRows > 0) {
      // A side-effect failure (e.g. Redis down) is a FAILURE, never a
      // SUCCESS/active outcome: the scheduler applies this sweep's OWN degraded
      // backoff instead of re-querying the DB on the tight active cadence.
      // Count-only error — no provider/driver message text (redaction).
      return {
        state: 'FAILURE',
        full: true,
        error: new Error(`phase-b: ${b.failedRows} side-effect row(s) failed`),
      }
    }
    return { state: 'SUCCESS', full: full || b.full }
  } catch (err) {
    return { state: 'FAILURE', full: false, error: err }
  }
}
