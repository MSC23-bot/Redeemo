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

/**
 * Stable job name for the opening-hours promotion sweep + the per-record delayed
 * nudge's dispatch key. Aligns with the RECONCILE_JOB / CLAIM_STALE_JOB naming
 * pattern on MAINTENANCE_QUEUE. The handler that consumes this name is added in
 * the promotion dispatch.
 */
export const PROMOTE_PENDING_HOURS_JOB = 'promote-pending-hours'

/**
 * Repeatable durable-sweep cadence. ~60s (aligned with the outbox reconciler,
 * tighter than the hourly claim-stale sweep) so the 2-hour promotion target is
 * not overshot when the sweep is the only thing that fires. The repeatable
 * registration that uses this lands in the promotion dispatch.
 */
export const PROMOTE_PENDING_HOURS_EVERY_MS = 60_000 // every 60 s
