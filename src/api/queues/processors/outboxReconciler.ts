// src/api/queues/processors/outboxReconciler.ts
//
// The outbox SAFETY NET. notify() commits a QUEUED CommunicationLog row then
// enqueues the delivery job AFTER the transaction — if that enqueue is lost
// (Redis blip, or the process dies between commit and enqueue) the row is
// QUEUED with no job: a silently undelivered message.
//
// Neon CU-burn PR-A Task A3: the sweep no longer runs as a 60-second BullMQ
// repeatable (the repeatable — the leading identified Neon CU-burn mechanism —
// is DELETED, not flag-restored). It now runs on the process-local maintenance
// scheduler as a bounded advisory-locked sweep, split into the two phases the
// spec locks (§4.2):
//
//   Phase A (locked, DB-only, on `tx` with the DB clock):
//     1. EXPIRE rows older than MAX_AGE — one bulk `updateMany` flips them
//        QUEUED→FAILED and NULLs `payload` (the 24h terminal policy, preserved
//        exactly: a reset link / branch PIN can never sit in QUEUED forever).
//     2. SELECT the ids of stale-but-deliverable rows (sentAt ∈ [maxAge, grace))
//        as the Phase-B side-effect payload. jobId = id ⇒ dedup-safe.
//
//   Phase B (unlocked, idempotent, cooperatively budgeted): re-enqueue each id
//     via enqueue(EMAIL_QUEUE, …, { jobId: id }). BullMQ dedups by jobId, so a
//     row that still has a live job is a no-op; a row whose enqueue was lost
//     gets a fresh job. Item cap + monotonic time budget + the terminal
//     isStopping() shutdown predicate are checked BETWEEN rows; a per-row
//     failure never stops the rest. Anything unprocessed stays QUEUED and is
//     re-selected next scan (durable rescheduling).
//
// The MAINTENANCE_QUEUE Worker below still serves the WP4 stale-claim sweep,
// the per-record pending-hours NUDGE only (Neon CU-burn PR-B moved the
// stale-claim + pending-hours sweeps onto the process-local maintenance floor,
// same as the outbox sweep in PR-A).

import { Worker, type Job, type ConnectionOptions } from 'bullmq'
import type IORedis from 'ioredis'
import { Prisma } from '../../../../generated/prisma/client'
import type { PrismaClient } from '../../../../generated/prisma/client'
import { EMAIL_QUEUE, MAINTENANCE_QUEUE, BULLMQ_PREFIX, enqueue } from '../index'
import { makeQueueConnection } from '../connection'
import { shouldLog } from '../logThrottle'
import {
  runBudgetedRows,
  type BoundedSweepSpec,
  type PhaseBBudget,
  type PhaseBOutcome,
} from '../maintenanceSweep'
import type { MaintenanceConfig } from '../../shared/env'
import { PROMOTE_PENDING_HOURS_JOB, promoteOnePendingHours } from './promotePendingHours'

/** Only RE-ENQUEUE rows older than this — ≥ the worker's max retry-backoff window. */
export const RECONCILE_GRACE_MS = 120_000 // 2 min
/**
 * Hard ceiling on how long a row may sit QUEUED. A row still QUEUED past this is
 * EXPIRED — force-FAILED + its `payload` NULLED — so (a) delivery-sensitive
 * content (a reset link / branch PIN, which unlike a reset token never expires)
 * can never sit in the outbox indefinitely, and (b) a row that never reaches a
 * terminal state stops being re-enqueued forever. Chosen to sit at Resend's
 * idempotency-key retention horizon so every in-window re-enqueue stays a
 * provider-side no-op.
 */
export const RECONCILE_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 h
/** Bound per Phase-A scan so a backlog can't thundering-herd the queue. */
export const RECONCILE_BATCH = 200

/** The outbox sweep's advisory-lock identity — distinct per sweep (spec §4.1). */
export const OUTBOX_SWEEP_LOCK_KEY = 731_001n
export const OUTBOX_SWEEP_NAME = 'outbox-reconcile'

export interface OutboxPhaseAResult {
  full: boolean
  sideEffects: string[]
}

/**
 * Phase A (locked, light, DB-only) — runs on `tx`, the connection holding the
 * advisory lock, with the DB-authoritative clock. Two tiers, both keyed off
 * `sentAt` (the queued-at anchor); expiry runs FIRST so expired rows are
 * excluded from the re-enqueue scan.
 */
export async function outboxDbPhase(
  tx: Prisma.TransactionClient,
  dbNow: Date,
): Promise<OutboxPhaseAResult> {
  const graceCutoff = new Date(dbNow.getTime() - RECONCILE_GRACE_MS)
  const maxAgeCutoff = new Date(dbNow.getTime() - RECONCILE_MAX_AGE_MS)

  // (1) Expire the too-old rows FIRST (24h terminal policy — preserved exactly).
  const expiredRes = await tx.communicationLog.updateMany({
    where: { status: 'QUEUED', sentAt: { lt: maxAgeCutoff } },
    data: { status: 'FAILED', payload: Prisma.DbNull },
  })
  if (expiredRes.count > 0) {
    // PR-C replaces this bare warn with the AlertSink (structured log +
    // getAlertableAdmins/adminNotify fan-out), emitted AFTER the sweep settles.
    // This interim log fires INSIDE the locked transaction, so it is worded as
    // in-progress: if the tx later times out and rolls back, no row actually
    // expired. Counts + labels only, never payload.
    console.warn(
      `[reconcile] expiring ${expiredRes.count} QUEUED row(s) older than ${RECONCILE_MAX_AGE_MS}ms ` +
        `→ FAILED + payload cleared (commits with this sweep's transaction; undeliverable-stale; secrets removed)`,
    )
  }

  // (2) Select the stale-but-deliverable ids: sentAt in [maxAge, grace), oldest first.
  const stale = await tx.communicationLog.findMany({
    where: { status: 'QUEUED', sentAt: { gte: maxAgeCutoff, lt: graceCutoff } },
    orderBy: { sentAt: 'asc' },
    take: RECONCILE_BATCH,
    select: { id: true },
  })

  // A full batch ⇒ needsRescan: the sweep stays on F_active until the backlog drains.
  return { full: stale.length >= RECONCILE_BATCH, sideEffects: stale.map((r) => r.id) }
}

/**
 * Phase B (unlocked, idempotent, cooperatively budgeted): re-enqueue each id
 * with jobId = id. Runs WITHOUT the lock — safe because BullMQ dedups by jobId
 * and the email worker skips terminal rows (CAS), so a duplicate is a no-op.
 * A failed enqueue (e.g. Redis down) is reported via failedRows → the sweep is
 * classified FAILURE and backs off on its OWN degraded cadence; the row stays
 * QUEUED and replays by the same jobId after recovery (no duplicate delivery).
 */
export function outboxSideEffects(ids: string[], budget: PhaseBBudget): Promise<PhaseBOutcome> {
  return runBudgetedRows(ids, budget, (id) =>
    enqueue(EMAIL_QUEUE, { communicationLogId: id }, { jobId: id }),
  )
}

/** Build the outbox BoundedSweepSpec from the validated maintenance config (A4). */
export function buildOutboxSweep(cfg: MaintenanceConfig & { mode: 'enabled' }): BoundedSweepSpec<string[]> {
  return {
    name: OUTBOX_SWEEP_NAME,
    lockKey: OUTBOX_SWEEP_LOCK_KEY,
    statementTimeoutMs: cfg.statementTimeoutMs,
    txTimeoutMs: cfg.txTimeoutMs,
    phaseBMaxItems: cfg.phaseBMaxItems,
    phaseBBudgetMs: cfg.phaseBBudgetMs,
    dbPhase: outboxDbPhase,
    runSideEffects: outboxSideEffects,
  }
}

/**
 * Start the MAINTENANCE_QUEUE Worker on its OWN Redis connection. Since Neon
 * CU-burn PR-B it serves ONLY the per-record pending-hours delayed NUDGE (the
 * unchanged accelerator). Every recurring sweep — outbox reconcile (PR-A),
 * stale-claim + pending-hours promotion (PR-B) — runs on the process-local
 * maintenance scheduler; their repeatable jobs are deleted, not flag-restored.
 * A stale repeatable still registered in Redis from a pre-PR image simply
 * no-ops through this handler (no matching branch).
 */
export function startReconcileWorker(prisma: PrismaClient, connection?: IORedis): Worker {
  const worker = new Worker(
    MAINTENANCE_QUEUE,
    async (job: Job) => {
      // PR-4 §4c: the per-record delayed NUDGE is enqueued through the shared
      // `enqueue` helper, which sets job.name to the QUEUE name (MAINTENANCE_QUEUE),
      // so it is distinguished by job.data.job and promotes that one record by id.
      // The handler re-reads the durable row (never trusts job.data beyond the id)
      // and skips a withdrawn / already-promoted / not-yet-due record.
      if (
        job.name === MAINTENANCE_QUEUE &&
        (job.data as { job?: string } | undefined)?.job === PROMOTE_PENDING_HOURS_JOB
      ) {
        const pendingId = (job.data as { pendingId?: string }).pendingId
        if (pendingId) await promoteOnePendingHours(prisma, pendingId)
      }
    },
    {
      connection: (connection ?? makeQueueConnection()) as unknown as ConnectionOptions,
      prefix: BULLMQ_PREFIX,
    },
  )
  worker.on('error', (err) => {
    if (shouldLog('reconcile-worker-error')) {
      console.error('[worker:reconcile] worker error:', err instanceof Error ? err.message : String(err))
    }
  })
  return worker
}
