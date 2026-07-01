// src/api/queues/processors/promotePendingHours.ts
//
// Branches PR-4 (umbrella D4): the opening-hours 2-hour cool-off promotion.
//
// A merchant hours edit STAGES a durable BranchOpeningHoursPending row
// (proposedHours + effectiveAt = stage time + 2h) instead of writing the live
// BranchOpeningHours immediately (see src/api/merchant/branch/service.ts
// setOpeningHours). The pending row is promoted into the live (Branches PR-8:
// MULTI-WINDOW) BranchOpeningHours at effectiveAt by TWO layers:
//
//   1. a per-record DELAYED nudge enqueued at stage time
//      (enqueue(MAINTENANCE_QUEUE, { pendingId }, { jobId, delay: 2h })) — the
//      prompt-latency accelerator, UNCHANGED; and
//   2. the durable maintenance-floor SWEEP (Neon CU-burn PR-B): the ~60s BullMQ
//      repeatable is GONE — the correctness guarantee now runs on the
//      process-local maintenance scheduler as an independent, advisory-locked,
//      bounded sweep (spec §4.2), split into:
//        Phase A (locked, light, DB-only, DB clock): SELECT the due ids
//          (status='PENDING' AND effectiveAt <= dbNow, LIMIT 200) on `tx`.
//        Phase B (unlocked, idempotent, cooperatively budgeted): promote each
//          id via the existing re-read-and-recheck promoteOnePendingHours in
//          its OWN short, statement-timeout-bounded transaction. Safe without
//          the sweep lock because the in-tx re-check (only-if-still-PENDING)
//          plus the partial-unique index are load-bearing idempotency.
//
// Both layers read the durable row as the source of truth; neither trusts
// job.data beyond the id, and both skip any non-PENDING / cancelled record.

import type { Prisma, PrismaClient } from '../../../../generated/prisma/client'
import {
  runBudgetedRows,
  type BoundedSweepSpec,
  type PhaseBBudget,
  type PhaseBOutcome,
} from '../maintenanceSweep'
import type { MaintenanceConfig } from '../../shared/env'

/**
 * Stable dispatch key for the per-record delayed NUDGE (enqueued by
 * setOpeningHours via `enqueue(MAINTENANCE_QUEUE, { job: PROMOTE_PENDING_HOURS_JOB,
 * pendingId }, …)`). The nudge arrives with `job.name === MAINTENANCE_QUEUE`
 * (the shared `enqueue` helper sets the job name to the queue name), so the
 * worker distinguishes it by `job.data.job === PROMOTE_PENDING_HOURS_JOB` and
 * runs `promoteOnePendingHours(prisma, job.data.pendingId)` for that one record.
 * (The repeatable SWEEP that used to share this name is gone — PR-B moved it
 * onto the process-local maintenance scheduler.)
 */
export const PROMOTE_PENDING_HOURS_JOB = 'promote-pending-hours'

/** Bound per Phase-A scan so a backlog of due rows can't thundering-herd the promotions. */
export const PROMOTE_PENDING_HOURS_BATCH = 200

/** The pending-hours sweep's advisory-lock identity — distinct per sweep (spec §4.1). */
export const PENDING_HOURS_SWEEP_LOCK_KEY = 731_002n
export const PENDING_HOURS_SWEEP_NAME = 'pending-hours-promote'

/** One day of the staged single-window weekly schedule (the validated proposedHours payload). */
interface ProposedDay {
  dayOfWeek: number
  openTime?: string | null
  closeTime?: string | null
  isClosed: boolean
}

/** Per-row transaction bounds for the FLOOR path (spec §4.2: every Phase-B
 *  per-row transaction is itself statement-timeout-bounded). The nudge handler
 *  passes none and keeps its existing behaviour. */
export interface PromoteTxBounds {
  statementTimeoutMs: number
  txTimeoutMs: number
}

/**
 * Promote ONE staged opening-hours change atomically + idempotently. Shared by
 * BOTH the maintenance-floor sweep AND the per-record delayed-job handler so
 * promotion has a single source of truth (PR-4 §4c).
 *
 * Everything runs inside ONE `prisma.$transaction` so a crash mid-promotion can
 * never half-apply (status flipped without the live upsert, or vice versa):
 *   1. RE-READ the pending row by id (NEVER trust job.data beyond the id).
 *   2. Promote ONLY if it is still `status='PENDING'` AND `effectiveAt <= now` —
 *      so a cancel that landed first wins (non-PENDING ⇒ no-op) and a not-yet-due
 *      delayed misfire is a no-op. Idempotent: a second run sees PROMOTED ⇒ no-op.
 *   3. REPLACE the LIVE BranchOpeningHours for the branch with `proposedHours`:
 *      delete-all-for-branch + createMany (N rows per day under the PR-8
 *      multi-window model). The live hours change ONLY here.
 *   4. Flip the pending row to `status='PROMOTED'`, `promotedAt=now`.
 *
 * When `bounds` is passed (the floor's Phase B), the transaction is SHORT and
 * statement-timeout-bounded: a parameterized `set_config('statement_timeout',…)`
 * is the first statement, and the explicit Prisma tx `timeout` replaces the 5s
 * default — so an unlocked per-row promotion can never hang the sweep.
 *
 * Returns true if this call promoted the row, false if it was a no-op (already
 * promoted / cancelled / not due / missing).
 */
export async function promoteOnePendingHours(
  prisma: PrismaClient,
  pendingId: string,
  now: Date = new Date(),
  bounds?: PromoteTxBounds,
): Promise<boolean> {
  return prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      if (bounds) {
        // Floor path: bound each statement server-side, PARAMETERIZED (spec §4.2).
        await tx.$queryRaw`SELECT set_config('statement_timeout', ${String(bounds.statementTimeoutMs)}, true)`
      }
      // (1) RE-READ from the DB — the durable row is the source of truth, never job.data.
      const pending = await tx.branchOpeningHoursPending.findUnique({ where: { id: pendingId } })
      if (!pending) return false

      // (2) Promote only if still PENDING and due. A cancel that landed first wins;
      // a not-yet-due delayed misfire is a clean no-op; a re-run on a PROMOTED row
      // is a no-op (idempotent).
      if (pending.status !== 'PENDING') return false
      if (pending.effectiveAt.getTime() > now.getTime()) return false

      // (3) REPLACE the LIVE BranchOpeningHours for the branch with the proposed week.
      // Branches PR-8 (D9): the live model is MULTI-WINDOW (the
      // `@@unique([branchId, dayOfWeek])` was dropped), so the promotion does
      // delete-all-rows-for-this-branch + createMany (N rows/day) inside this same
      // transaction so the swap is atomic. proposedHours was validated by
      // validateOpeningHours at stage time.
      const proposed = (pending.proposedHours ?? []) as unknown as ProposedDay[]
      await tx.branchOpeningHours.deleteMany({ where: { branchId: pending.branchId } })
      if (proposed.length > 0) {
        await tx.branchOpeningHours.createMany({
          data: proposed.map(({ dayOfWeek, openTime, closeTime, isClosed }) => ({
            branchId: pending.branchId,
            dayOfWeek,
            openTime: openTime ?? null,
            closeTime: closeTime ?? null,
            isClosed,
          })),
        })
      }

      // (4) Flip the durable row PROMOTED in the SAME transaction as the live replace.
      await tx.branchOpeningHoursPending.update({
        where: { id: pendingId },
        data: { status: 'PROMOTED', promotedAt: now },
      })
      return true
    },
    bounds ? { timeout: bounds.txTimeoutMs, maxWait: bounds.txTimeoutMs } : undefined,
  )
}

/** The Phase-A → Phase-B payload: the due ids PLUS the DB-authoritative clock
 *  they were selected against (the per-row re-check uses the same dbNow). */
export interface PendingHoursSide {
  ids: string[]
  dbNow: Date
}

/**
 * Phase A (locked, light, DB-only) — runs on `tx`, the connection holding the
 * per-sweep advisory lock, with the DB-authoritative clock (spec §8.3): SELECT
 * the due pending-hours ids. Only light selection work happens here; every
 * promotion runs unlocked in Phase B.
 */
export async function pendingHoursDbPhase(
  tx: Prisma.TransactionClient,
  dbNow: Date,
): Promise<{ full: boolean; sideEffects: PendingHoursSide }> {
  // Candidate scan (index-backed on [status, effectiveAt]): PENDING and due.
  const due = await tx.branchOpeningHoursPending.findMany({
    where: { status: 'PENDING', effectiveAt: { lte: dbNow } },
    take: PROMOTE_PENDING_HOURS_BATCH,
    orderBy: { effectiveAt: 'asc' },
    select: { id: true },
  })
  // A full batch ⇒ needsRescan: the sweep stays on F_active until the backlog drains.
  return {
    full: due.length >= PROMOTE_PENDING_HOURS_BATCH,
    sideEffects: { ids: due.map((r) => r.id), dbNow },
  }
}

/**
 * Phase B (unlocked, idempotent, cooperatively budgeted): promote each id via
 * promoteOnePendingHours — ONE atomic statement-timeout-bounded transaction per
 * row (not broken mid-tx; the cooperative isStopping() check runs BETWEEN rows
 * inside runBudgetedRows). A per-row failure is reported via failedRows → the
 * sweep is classified FAILURE and backs off on its OWN degraded cadence; the
 * durable PENDING rows replay next scan (re-read-and-recheck keeps it a no-op
 * if another actor promoted meanwhile).
 */
export function makePendingHoursSideEffects(
  prisma: PrismaClient,
  bounds: PromoteTxBounds,
): (side: PendingHoursSide, budget: PhaseBBudget) => Promise<PhaseBOutcome> {
  return (side, budget) =>
    runBudgetedRows(side.ids, budget, (id) => promoteOnePendingHours(prisma, id, side.dbNow, bounds))
}

/** Build the pending-hours BoundedSweepSpec from the validated maintenance config (A4). */
export function buildPendingHoursSweep(
  prisma: PrismaClient,
  cfg: MaintenanceConfig & { mode: 'enabled' },
): BoundedSweepSpec<PendingHoursSide> {
  return {
    name: PENDING_HOURS_SWEEP_NAME,
    lockKey: PENDING_HOURS_SWEEP_LOCK_KEY,
    statementTimeoutMs: cfg.statementTimeoutMs,
    txTimeoutMs: cfg.txTimeoutMs,
    phaseBMaxItems: cfg.phaseBMaxItems,
    phaseBBudgetMs: cfg.phaseBBudgetMs,
    dbPhase: pendingHoursDbPhase,
    runSideEffects: makePendingHoursSideEffects(prisma, {
      statementTimeoutMs: cfg.statementTimeoutMs,
      txTimeoutMs: cfg.txTimeoutMs,
    }),
  }
}
