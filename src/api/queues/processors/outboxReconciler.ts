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
import { Prisma } from '../../../../generated/prisma/client'
import type { PrismaClient } from '../../../../generated/prisma/client'
import { EMAIL_QUEUE, MAINTENANCE_QUEUE, BULLMQ_PREFIX, enqueue, makeQueue } from '../index'
import { makeQueueConnection } from '../connection'
import { shouldLog } from '../logThrottle'
import { CLAIM_STALE_JOB, sweepStaleClaims } from './claimStaleSweep'

/** Only RE-ENQUEUE rows older than this — ≥ the worker's max retry-backoff window. */
export const RECONCILE_GRACE_MS = 120_000 // 2 min
/**
 * Hard ceiling on how long a row may sit QUEUED. A row still QUEUED past this is
 * EXPIRED — force-FAILED + its `payload` NULLED — so (a) delivery-sensitive
 * content (a reset link / branch PIN, which unlike a reset token never expires)
 * can never sit in the outbox indefinitely, and (b) a row that never reaches a
 * terminal state stops being re-enqueued forever. By this age the message is
 * undeliverable-stale anyway (a reset token's Redis record has long expired), so
 * giving up is correct. Chosen to sit at Resend's idempotency-key retention
 * horizon so every in-window re-enqueue stays a provider-side no-op.
 */
export const RECONCILE_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 h
/** Bound per run so a backlog can't thundering-herd the queue. */
export const RECONCILE_BATCH = 200
/** Repeatable sweep cadence + its stable job name. */
export const RECONCILE_JOB = 'reconcile-outbox'
export const RECONCILE_EVERY_MS = 60_000 // every 60 s

export interface ReconcileResult {
  /** rows re-enqueued for delivery (stale but still within the deliverable window). */
  reEnqueued: number
  /** rows force-FAILED + payload-cleared because they exceeded MAX_AGE. */
  expired: number
}

/**
 * The outbox janitor. Two tiers, both keyed off `sentAt` (the queued-at anchor):
 *
 *  1. EXPIRE rows older than MAX_AGE — one bulk `updateMany` flips them QUEUED→
 *     FAILED and NULLs `payload`. This is the hard backstop that makes the
 *     §4.1 retry BOUNDED: a row that never terminalised stops being re-enqueued,
 *     and a reset link / branch PIN can never sit in QUEUED forever.
 *  2. RE-ENQUEUE rows that are stale (lost enqueue) but still within the
 *     deliverable window [MAX_AGE, GRACE). jobId = id ⇒ dedup-safe, so running
 *     twice (or against rows that still have live jobs) never double-sends.
 *
 * Idempotent. `now` is injectable for tests. Returns both counts.
 */
export async function reconcileOutbox(prisma: PrismaClient, now: Date = new Date()): Promise<ReconcileResult> {
  const graceCutoff = new Date(now.getTime() - RECONCILE_GRACE_MS)
  const maxAgeCutoff = new Date(now.getTime() - RECONCILE_MAX_AGE_MS)

  // (1) Expire the too-old rows FIRST (so they are excluded from re-enqueue below).
  const expiredRes = await prisma.communicationLog.updateMany({
    where: { status: 'QUEUED', sentAt: { lt: maxAgeCutoff } },
    data: { status: 'FAILED', payload: Prisma.DbNull },
  })
  if (expiredRes.count > 0) {
    console.warn(
      `[reconcile] expired ${expiredRes.count} QUEUED row(s) older than ${RECONCILE_MAX_AGE_MS}ms ` +
        `→ FAILED + payload cleared (undeliverable-stale; secrets removed)`,
    )
  }

  // (2) Re-enqueue rows that are stale but still deliverable: sentAt in [maxAge, grace).
  const stale = await prisma.communicationLog.findMany({
    where: { status: 'QUEUED', sentAt: { gte: maxAgeCutoff, lt: graceCutoff } },
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
  return { reEnqueued, expired: expiredRes.count }
}

/**
 * Start the MAINTENANCE_QUEUE Worker on its OWN Redis connection. One Worker
 * serves the whole queue, dispatching by job name: the outbox reconciler
 * (RECONCILE_JOB) and the WP4 stale-claim sweep (CLAIM_STALE_JOB). A single
 * worker is deliberate, since two Workers on one queue round-robin jobs, so a
 * reconcile tick could land on a claim-stale-only worker and be silently
 * no-op'd. Wired from src/worker.ts alongside the email worker.
 */
export function startReconcileWorker(prisma: PrismaClient, connection?: IORedis): Worker {
  const worker = new Worker(
    MAINTENANCE_QUEUE,
    async (job: Job) => {
      if (job.name === RECONCILE_JOB) await reconcileOutbox(prisma)
      else if (job.name === CLAIM_STALE_JOB) await sweepStaleClaims(prisma)
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
