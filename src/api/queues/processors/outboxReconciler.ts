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
//     1. EXPIRE rows older than MAX_AGE — ONE atomic `UPDATE … RETURNING "type"`
//        CTE flips them QUEUED→FAILED, NULLs `payload` (the 24h terminal policy,
//        preserved exactly: a reset link / branch PIN can never sit in QUEUED
//        forever) and aggregates the per-type counts FROM THE SAME ROWS the
//        update transitioned (PR-C load-bearing atomicity: never a separate
//        pre-update groupBy that another actor could race).
//     2. SELECT the ids of stale-but-deliverable rows (sentAt ∈ [maxAge, grace))
//        as the Phase-B side-effect payload. jobId = id ⇒ dedup-safe.
//     The expiry breakdown rides in the side-effects and is emitted through the
//     AlertSink at the TOP of Phase B — i.e. only AFTER the transaction
//     committed. A rollback/timeout means no Phase B and therefore no alert.
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
import type { Prisma, PrismaClient } from '../../../../generated/prisma/client'
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

/** Per-CommunicationLog-type count of rows the expiry UPDATE transitioned. */
export interface ExpiredTypeCount {
  type: string
  count: number
}

/** The outbox sweep's Phase-B payload: re-enqueue ids + the committed expiry breakdown. */
export interface OutboxSide {
  ids: string[]
  expired: ExpiredTypeCount[]
}

export interface OutboxPhaseAResult {
  full: boolean
  sideEffects: OutboxSide
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
  // ONE atomic UPDATE … RETURNING CTE: the per-type breakdown is aggregated from
  // the EXACT rows this statement transitioned — never a separate pre-update
  // groupBy that a concurrent insert/worker could race (PR-C load-bearing
  // atomicity requirement). Parameterized cutoff; no interpolated values.
  const expired = await tx.$queryRaw<ExpiredTypeCount[]>`
    WITH expired AS (
      UPDATE "CommunicationLog"
      SET "status" = 'FAILED', "payload" = NULL
      WHERE "status" = 'QUEUED' AND "sentAt" < ${maxAgeCutoff}
      RETURNING "type"
    )
    SELECT "type", COUNT(*)::int AS count FROM expired GROUP BY "type"
  `

  // (2) Select the stale-but-deliverable ids: sentAt in [maxAge, grace), oldest first.
  const stale = await tx.communicationLog.findMany({
    where: { status: 'QUEUED', sentAt: { gte: maxAgeCutoff, lt: graceCutoff } },
    orderBy: { sentAt: 'asc' },
    take: RECONCILE_BATCH,
    select: { id: true },
  })

  // A full batch ⇒ needsRescan: the sweep stays on F_active until the backlog drains.
  return {
    full: stale.length >= RECONCILE_BATCH,
    sideEffects: { ids: stale.map((r) => r.id), expired },
  }
}

/** The one AlertSink capability this processor needs (type-only, no runtime import). */
type ExpiryAlertSink = Pick<import('../maintenanceMetrics').AlertSink, 'expiredCommunications'>

/**
 * Phase B (unlocked, idempotent, cooperatively budgeted). FIRST — before any
 * row work, so a budget/cooperative stop between rows cannot drop it — the
 * committed expiry is recorded SYNCHRONOUSLY (counts + internal type labels
 * only, never payload/recipient data), then the asynchronous admin-alert
 * launch is attempted through the AlertSink. Phase B only runs after the
 * Phase-A transaction COMMITTED (runBoundedSweep contract), so a rolled-back
 * expiry can never alert. TERMINAL-STOP RACE (PR-C correction round): the
 * scheduler's between-phases isStopping() check and this function are not
 * atomic — stop can land in between — so the launch is guarded by
 * budget.isStopping() IMMEDIATELY adjacent to the sink call, with no await
 * between the check and the call. When stopping, only the synchronous
 * redacted record happens; no new asynchronous DB/alert operation begins.
 *
 * Then: re-enqueue each id with jobId = id. Runs WITHOUT the lock — safe
 * because BullMQ dedups by jobId and the email worker skips terminal rows
 * (CAS), so a duplicate is a no-op. A failed enqueue (e.g. Redis down) is
 * reported via failedRows → the sweep is classified FAILURE and backs off on
 * its OWN degraded cadence; the row stays QUEUED and replays by the same jobId
 * after recovery (no duplicate delivery).
 */
export function outboxSideEffects(
  side: OutboxSide,
  budget: PhaseBBudget,
  alertSink?: ExpiryAlertSink,
): Promise<PhaseBOutcome> {
  if (side.expired.length > 0) {
    const total = side.expired.reduce((sum, t) => sum + t.count, 0)
    // Launch the async admin alert ONLY while not stopping — the isStopping()
    // check sits immediately adjacent to the launch seam (no await between).
    // The sink's own terminal flag cannot close this window: AlertSink.stop()
    // runs only after the scheduler drain, so this guard is load-bearing.
    if (alertSink && !budget.isStopping()) {
      // Sync entry, fire-and-forget internally, never throws (AlertSink contract).
      alertSink.expiredCommunications({ sweep: OUTBOX_SWEEP_NAME, total, byType: side.expired })
    } else {
      // No sink wired (tests) OR terminal stop active: the committed expiry is
      // still recorded synchronously — counts + internal type labels only,
      // never payload/recipient data. No asynchronous operation starts.
      console.warn(
        `[reconcile] expired ${total} QUEUED row(s) older than ${RECONCILE_MAX_AGE_MS}ms ` +
          `→ FAILED + payload cleared (${side.expired.map((t) => `${t.type} x${t.count}`).join(', ')})`,
      )
    }
  }
  return runBudgetedRows(side.ids, budget, (id) =>
    enqueue(EMAIL_QUEUE, { communicationLogId: id }, { jobId: id }),
  )
}

/** Build the outbox BoundedSweepSpec from the validated maintenance config (A4).
 *  `alertSink` (PR-C) receives the post-commit expiry emission; optional so the
 *  spec stays constructible without the alerting layer. */
export function buildOutboxSweep(
  cfg: MaintenanceConfig & { mode: 'enabled' },
  alertSink?: ExpiryAlertSink,
): BoundedSweepSpec<OutboxSide> {
  return {
    name: OUTBOX_SWEEP_NAME,
    lockKey: OUTBOX_SWEEP_LOCK_KEY,
    // Phase B here is REDIS work (BullMQ re-enqueue) — Phase A committed, the
    // database is reachable, so a Phase-B failure alerts normally (never
    // misclassified as a database outage).
    sideEffectDomain: 'REDIS',
    statementTimeoutMs: cfg.statementTimeoutMs,
    txTimeoutMs: cfg.txTimeoutMs,
    phaseBMaxItems: cfg.phaseBMaxItems,
    phaseBBudgetMs: cfg.phaseBBudgetMs,
    dbPhase: outboxDbPhase,
    runSideEffects: (side, budget) => outboxSideEffects(side, budget, alertSink),
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
