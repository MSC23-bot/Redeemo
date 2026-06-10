// src/api/queues/processors/outboxReconciler.ts
//
// Phase 0 PR-0.4 (§4.1 rule 4): the outbox SAFETY NET. notify() commits a QUEUED
// CommunicationLog row then enqueues the delivery job AFTER the transaction — if
// that enqueue is lost (Redis blip, or the process dies between commit and
// enqueue) the row is QUEUED with no job: a silently undelivered message.
//
// This sweep finds those rows — QUEUED and older than GRACE (≥ the max
// retry-backoff window, so a row that's merely mid-retry isn't disturbed) — and
// re-enqueues each by jobId = id. BullMQ dedups by jobId, so a row that still
// has a live job is a no-op; a row whose enqueue was lost gets a fresh job. The
// @@index([status, sentAt]) keeps the scan cheap and the LIMIT bounds each run.
//
// Scheduling lives in src/worker.ts (a repeatable job every 60 s). This module
// is the pure sweep, exported so it is unit-testable without BullMQ scheduling.

import { Worker, type Job, type ConnectionOptions } from 'bullmq'
import type IORedis from 'ioredis'
import type { PrismaClient } from '../../../../generated/prisma/client'
import { EMAIL_QUEUE, MAINTENANCE_QUEUE, BULLMQ_PREFIX, enqueue, makeQueue } from '../index'
import { makeQueueConnection } from '../connection'
import { shouldLog } from '../logThrottle'

/** Only reconcile rows older than this — ≥ the worker's max retry-backoff window. */
export const RECONCILE_GRACE_MS = 120_000 // 2 min
/** Bound per run so a backlog can't thundering-herd the queue. */
export const RECONCILE_BATCH = 200
/** Repeatable sweep cadence + its stable job name. */
export const RECONCILE_JOB = 'reconcile-outbox'
export const RECONCILE_EVERY_MS = 60_000 // every 60 s

/**
 * Re-enqueue stale QUEUED outbox rows. Idempotent: re-enqueue by jobId = id, so
 * running it twice (or against rows that still have live jobs) never double-sends
 * — the worker's skip-terminal guard + BullMQ jobId dedup absorb the overlap.
 * Returns the number of rows re-enqueued. `now` is injectable for tests.
 */
export async function reconcileOutbox(prisma: PrismaClient, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RECONCILE_GRACE_MS)
  const stale = await prisma.communicationLog.findMany({
    where: { status: 'QUEUED', sentAt: { lt: cutoff } },
    orderBy: { sentAt: 'asc' },
    take: RECONCILE_BATCH,
    select: { id: true },
  })

  let reEnqueued = 0
  for (const row of stale) {
    try {
      await enqueue(EMAIL_QUEUE, { communicationLogId: row.id }, { jobId: row.id })
      reEnqueued++
    } catch (err) {
      console.warn(
        `[reconcile] re-enqueue failed for CommunicationLog ${row.id}: ` +
          (err instanceof Error ? err.message : String(err)),
      )
    }
  }
  if (reEnqueued > 0) {
    console.info(`[reconcile] re-enqueued ${reEnqueued} stale QUEUED row(s) (scanned ${stale.length})`)
  }
  return reEnqueued
}

/**
 * Start the MAINTENANCE_QUEUE Worker that runs the sweep, on its OWN Redis
 * connection. Wired from src/worker.ts alongside the email worker.
 */
export function startReconcileWorker(prisma: PrismaClient, connection?: IORedis): Worker {
  const worker = new Worker(
    MAINTENANCE_QUEUE,
    async (job: Job) => {
      if (job.name === RECONCILE_JOB) await reconcileOutbox(prisma)
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

/**
 * Register the repeatable reconcile job (idempotent: the stable jobId means only
 * ONE repeatable ever exists, even across worker restarts). Call once at boot.
 */
export async function scheduleReconcile(): Promise<void> {
  await makeQueue(MAINTENANCE_QUEUE).add(
    RECONCILE_JOB,
    {},
    {
      repeat: { every: RECONCILE_EVERY_MS },
      jobId: RECONCILE_JOB,
      removeOnComplete: true,
      removeOnFail: 100,
    },
  )
}
