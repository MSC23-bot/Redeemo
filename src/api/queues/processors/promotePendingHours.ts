// src/api/queues/processors/promotePendingHours.ts
//
// Branches PR-4 (umbrella D4): the opening-hours 2-hour cool-off promotion.
//
// A merchant hours edit STAGES a durable BranchOpeningHoursPending row
// (proposedHours + effectiveAt = stage time + 2h) instead of writing the live
// BranchOpeningHours immediately (see src/api/merchant/branch/service.ts
// setOpeningHours). The pending row is promoted into the live single-window
// BranchOpeningHours at effectiveAt by TWO layers, both on MAINTENANCE_QUEUE:
//
//   1. a per-record DELAYED nudge enqueued at stage time
//      (enqueue(MAINTENANCE_QUEUE, { pendingId }, { jobId, delay: 2h })) — the
//      prompt-latency layer; and
//   2. a repeatable durable SWEEP (PROMOTE_PENDING_HOURS_JOB, ~60s, modelled on
//      claimStaleSweep.sweepStaleClaims) — the correctness guarantee, since a
//      delayed Redis job can be lost on a restart/eviction.
//
// Both read the durable row as the source of truth; the handler never trusts
// job.data and skips any non-PENDING / cancelled record.
//
// THIS DISPATCH defines ONLY the stable job-name constant so setOpeningHours can
// reference it and the next dispatch can wire the handler against a single source
// of truth. The pure promotePendingHours(prisma, now) handler, the worker
// dispatch branch (outboxReconciler.startReconcileWorker), and the repeatable
// schedulePromotePendingHours() registration (src/worker.ts) LAND IN THE
// PROMOTION DISPATCH (PR-4 §4c).

import type { Prisma, PrismaClient } from '../../../../generated/prisma/client'
import { MAINTENANCE_QUEUE, makeQueue } from '../index'

/**
 * Stable job name for the opening-hours promotion sweep + the per-record delayed
 * nudge's dispatch key. Aligns with the RECONCILE_JOB / CLAIM_STALE_JOB naming
 * pattern on MAINTENANCE_QUEUE.
 *
 * Two layers use this name to distinguish their jobs (mirroring how
 * RECONCILE_JOB / CLAIM_STALE_JOB are distinguished by `job.name`):
 *   - the repeatable durable SWEEP is registered with this name AS its `job.name`
 *     (`makeQueue(MAINTENANCE_QUEUE).add(PROMOTE_PENDING_HOURS_JOB, {}, …)`), so
 *     the worker dispatches it by `job.name === PROMOTE_PENDING_HOURS_JOB` and runs
 *     the full `promotePendingHours(prisma)` sweep; and
 *   - the per-record delayed NUDGE (enqueued by setOpeningHours via
 *     `enqueue(MAINTENANCE_QUEUE, { job: PROMOTE_PENDING_HOURS_JOB, pendingId }, …)`)
 *     arrives with `job.name === MAINTENANCE_QUEUE` (because the shared `enqueue`
 *     helper sets the job name to the queue name), so the worker distinguishes it
 *     by `job.data.job === PROMOTE_PENDING_HOURS_JOB` and runs
 *     `promoteOnePendingHours(prisma, job.data.pendingId)` for that one record.
 */
export const PROMOTE_PENDING_HOURS_JOB = 'promote-pending-hours'

/**
 * Repeatable durable-sweep cadence. ~60s (aligned with the outbox reconciler,
 * tighter than the hourly claim-stale sweep) so the 2-hour promotion target is
 * not overshot when the sweep is the only thing that fires.
 */
export const PROMOTE_PENDING_HOURS_EVERY_MS = 60_000 // every 60 s

/** Bound per run so a backlog of due rows can't thundering-herd the promotions. */
export const PROMOTE_PENDING_HOURS_BATCH = 200

/** A `tx` (inside $transaction) or a top-level PrismaClient — both expose the model delegates we use. */
type PrismaLike = PrismaClient | Prisma.TransactionClient

/** One day of the staged single-window weekly schedule (the validated proposedHours payload). */
interface ProposedDay {
  dayOfWeek: number
  openTime?: string | null
  closeTime?: string | null
  isClosed: boolean
}

export interface PromoteSweepResult {
  /** rows that were promoted (live BranchOpeningHours upserted + row marked PROMOTED) this run. */
  promoted: number
  /** due-candidate rows scanned (PENDING with effectiveAt <= now). */
  scanned: number
}

/**
 * Promote ONE staged opening-hours change atomically + idempotently. Shared by
 * BOTH the durable sweep AND the per-record delayed-job handler so promotion has
 * a single source of truth (PR-4 §4c).
 *
 * Everything runs inside ONE `prisma.$transaction` so a crash mid-promotion can
 * never half-apply (status flipped without the live upsert, or vice versa):
 *   1. RE-READ the pending row by id (NEVER trust job.data beyond the id).
 *   2. Promote ONLY if it is still `status='PENDING'` AND `effectiveAt <= now` —
 *      so a cancel that landed first wins (non-PENDING ⇒ no-op) and a not-yet-due
 *      delayed misfire is a no-op. Idempotent: a second run sees PROMOTED ⇒ no-op.
 *   3. UPSERT each day of `proposedHours` into the LIVE BranchOpeningHours (the
 *      exact per-day `branchOpeningHours.upsert` keyed on `branchId_dayOfWeek` that
 *      setOpeningHours did BEFORE PR-4) — the live hours change ONLY here.
 *   4. Flip the pending row to `status='PROMOTED'`, `promotedAt=now`.
 *
 * Returns true if this call promoted the row, false if it was a no-op (already
 * promoted / cancelled / not due / missing).
 */
export async function promoteOnePendingHours(
  prisma: PrismaClient,
  pendingId: string,
  now: Date = new Date(),
): Promise<boolean> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // (1) RE-READ from the DB — the durable row is the source of truth, never job.data.
    const pending = await tx.branchOpeningHoursPending.findUnique({ where: { id: pendingId } })
    if (!pending) return false

    // (2) Promote only if still PENDING and due. A cancel that landed first wins;
    // a not-yet-due delayed misfire is a clean no-op; a re-run on a PROMOTED row
    // is a no-op (idempotent).
    if (pending.status !== 'PENDING') return false
    if (pending.effectiveAt.getTime() > now.getTime()) return false

    // (3) UPSERT each day into the LIVE BranchOpeningHours — the SAME per-day upsert
    // shape setOpeningHours used before PR-4 (create/update keyed on
    // branchId_dayOfWeek). proposedHours was validated by validateOpeningHours at
    // stage time, so it is a well-formed single-window weekly schedule.
    const proposed = (pending.proposedHours ?? []) as unknown as ProposedDay[]
    for (const { dayOfWeek, openTime, closeTime, isClosed } of proposed) {
      await tx.branchOpeningHours.upsert({
        where: { branchId_dayOfWeek: { branchId: pending.branchId, dayOfWeek } },
        create: { branchId: pending.branchId, dayOfWeek, openTime, closeTime, isClosed },
        update: { openTime, closeTime, isClosed },
      })
    }

    // (4) Flip the durable row PROMOTED in the SAME transaction as the live upsert.
    await tx.branchOpeningHoursPending.update({
      where: { id: pendingId },
      data: { status: 'PROMOTED', promotedAt: now },
    })
    return true
  })
}

/**
 * The opening-hours promotion SWEEP — the durable correctness guarantee (PR-4
 * §4c). Modelled VERBATIM on claimStaleSweep.sweepStaleClaims: an index-backed
 * (`[status, effectiveAt]`) bounded `findMany` of due rows, then a per-row promote
 * with per-row try/catch so one bad row can't abort the batch. `now` is injectable
 * for tests.
 *
 * Why the sweep exists alongside the delayed nudge (D4 "no delayed-job-only"): the
 * shared Redis is MVP-mode `noeviction` precisely because a dropped key = a lost
 * job — a delayed promotion job can be lost on a Redis restart/blip, an eviction
 * misconfig, or simply never fire if the worker was down at the 2h mark. The
 * durable BranchOpeningHoursPending row + this periodic sweep GUARANTEE promotion
 * regardless; the delayed job is only the prompt nudge.
 */
export async function promotePendingHours(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<PromoteSweepResult> {
  // Candidate scan (index-backed on [status, effectiveAt]): PENDING and due.
  const due = await prisma.branchOpeningHoursPending.findMany({
    where: { status: 'PENDING', effectiveAt: { lte: now } },
    take: PROMOTE_PENDING_HOURS_BATCH,
    orderBy: { effectiveAt: 'asc' },
    select: { id: true },
  })

  let promoted = 0
  for (const row of due) {
    try {
      // promoteOnePendingHours RE-READS inside its own transaction and re-checks
      // PENDING + due, so a row cancelled between this scan and the promote is a
      // clean no-op (the in-transaction re-check, not this stale scan, is the gate).
      if (await promoteOnePendingHours(prisma, row.id, now)) promoted++
    } catch (err) {
      // Best-effort: one failed row must not abort the rest of the batch.
      console.warn(
        `[promote-hours] best-effort promotion for pending ${row.id} failed, sweep continues: ` +
          (err instanceof Error ? err.message : String(err)),
      )
    }
  }
  return { promoted, scanned: due.length }
}

/**
 * Register the repeatable opening-hours promotion sweep on MAINTENANCE_QUEUE
 * (idempotent: the stable jobId means exactly ONE repeatable exists, even across
 * restarts). The MAINTENANCE_QUEUE worker (outboxReconciler.startReconcileWorker)
 * dispatches PROMOTE_PENDING_HOURS_JOB to promotePendingHours. Call once at boot
 * from src/worker.ts (mirrors scheduleClaimStaleSweep / scheduleReconcile).
 */
export async function schedulePromotePendingHours(): Promise<void> {
  await makeQueue(MAINTENANCE_QUEUE).add(
    PROMOTE_PENDING_HOURS_JOB,
    {},
    {
      repeat: { every: PROMOTE_PENDING_HOURS_EVERY_MS },
      jobId: PROMOTE_PENDING_HOURS_JOB,
      removeOnComplete: true,
      removeOnFail: 100,
    },
  )
}
