// src/api/queues/processors/moderation.ts
//
// Phase 0 PR-0.6: the MODERATION_QUEUE scan worker. It loads a BranchPhoto's URL,
// runs the provider-agnostic scanImage() hook, and transitions ONLY a PENDING
// photo: CLEAN ⇒ APPROVED, FLAGGED ⇒ FLAGGED, UNAVAILABLE ⇒ leave PENDING (admin
// review, no DB write). A non-PENDING photo is skipped so a stale re-scan can
// never override an admin / earlier decision.
//
// The ENQUEUE CALL SITE lands in Phase 2 (with the upload route). Phase 0 ships
// the processor + the enqueue helper + a unit test that drives the processor
// directly — no live upload path is exposed here.

import { Worker, type Job, type ConnectionOptions } from 'bullmq'
import type IORedis from 'ioredis'
import type { PrismaClient } from '../../../../generated/prisma/client'
import { MODERATION_QUEUE, BULLMQ_PREFIX, enqueue } from '../index'
import { makeQueueConnection } from '../connection'
import { shouldLog } from '../logThrottle'
import { scanImage } from '../../shared/moderation'

export interface ModerationJobData {
  branchPhotoId: string
}

export type ModerationOutcome =
  | 'approved'
  | 'flagged'
  | 'unavailable' // scanner couldn't decide → left PENDING (admin review)
  | 'skipped-missing' // photo row gone → ack
  | 'skipped-terminal' // already resolved (APPROVED/FLAGGED) → never re-decide

/**
 * Enqueue a moderation scan for a branch photo. jobId = photo id ⇒ dedup-safe.
 * The Phase-2 upload route calls this right after creating the BranchPhoto row.
 */
export function enqueuePhotoModeration(branchPhotoId: string): Promise<Job> {
  return enqueue(MODERATION_QUEUE, { branchPhotoId }, { jobId: branchPhotoId })
}

/**
 * The pure job handler — exported (no BullMQ) so the worker is fully unit-testable
 * by driving it with a mocked scanImage().
 */
export async function processModerationJob(
  prisma: PrismaClient,
  data: ModerationJobData,
): Promise<ModerationOutcome> {
  const photo = await prisma.branchPhoto.findUnique({
    where: { id: data.branchPhotoId },
    select: { id: true, url: true, moderationStatus: true },
  })
  if (!photo) return 'skipped-missing'
  if (photo.moderationStatus !== 'PENDING') return 'skipped-terminal' // never override a resolved/admin decision

  const verdict = await scanImage(photo.url)
  if (verdict === 'UNAVAILABLE') return 'unavailable' // leave PENDING → admin review (no DB write)

  const status = verdict === 'CLEAN' ? 'APPROVED' : 'FLAGGED'
  const res = await prisma.branchPhoto.updateMany({
    where: { id: photo.id, moderationStatus: 'PENDING' }, // race-safe: only flip a still-PENDING row
    data: {
      moderationStatus: status,
      moderationCheckedAt: new Date(),
      moderationDetail: verdict === 'FLAGGED' ? 'flagged by automated scan' : null,
    },
  })
  // 0 rows ⇒ an admin / earlier decision flipped the row off PENDING between our
  // read and write. We correctly did NOT override it — report the truth (the scan
  // outcome did not apply) rather than the stale verdict.
  if (res.count === 0) return 'skipped-terminal'
  return status === 'APPROVED' ? 'approved' : 'flagged'
}

/**
 * Start the MODERATION_QUEUE Worker on its OWN Redis connection. Wired from
 * src/worker.ts alongside the email + reconcile workers.
 */
export function startModerationWorker(prisma: PrismaClient, connection?: IORedis): Worker<ModerationJobData> {
  const worker = new Worker<ModerationJobData>(
    MODERATION_QUEUE,
    (job) => processModerationJob(prisma, job.data),
    {
      connection: (connection ?? makeQueueConnection()) as unknown as ConnectionOptions,
      prefix: BULLMQ_PREFIX,
      concurrency: Number(process.env.WORKER_CONCURRENCY) || 5,
    },
  )
  worker.on('error', (err) => {
    if (shouldLog('moderation-worker-error')) {
      console.error('[worker:moderation] worker error:', err instanceof Error ? err.message : String(err))
    }
  })
  return worker
}
