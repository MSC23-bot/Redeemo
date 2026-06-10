// src/worker.ts — the background-job WORKER process entrypoint.
//
// Phase 0 PR-0.1 stood this up as a heartbeat; PR-0.4 fills it in with real
// processors. It is the second process (alongside the Fastify API in
// src/index.ts): `npm run worker` (dev) / `npm run start:worker` (prod). It boots
// the same fail-closed env validation, constructs ONE Prisma client (the
// processors write CommunicationLog), then registers the BullMQ workers:
//   - email-delivery (EMAIL_QUEUE)        → sends QUEUED outbox rows
//   - outbox-reconciler (MAINTENANCE_QUEUE, repeatable 60 s) → re-enqueues stale QUEUED rows
//   - photo-moderation (MODERATION_QUEUE) → scans a BranchPhoto, gates it APPROVED/FLAGGED
//
// Each Worker gets its OWN Redis connection (makeQueueConnection) for its
// blocking reads — the PR-0.1 single "heartbeat" connection is gone now that the
// Workers themselves keep the process alive.

import 'dotenv/config'
import type { Worker } from 'bullmq'
import type IORedis from 'ioredis'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { validateRequiredEnv } from './api/shared/env'
import { closeQueues, makeQueueConnection } from './api/queues'
import { startEmailWorker } from './api/queues/processors/email'
import { startReconcileWorker, scheduleReconcile } from './api/queues/processors/outboxReconciler'
import { startModerationWorker } from './api/queues/processors/moderation'

async function main(): Promise<void> {
  // Fail-closed: same aggregated env check the API runs (REDIS_URL is required).
  validateRequiredEnv()

  // ONE Prisma client for every processor (mirrors the API's prisma plugin).
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })
  await prisma.$connect()

  // Each Worker gets its OWN Redis connection for its blocking reads — created +
  // OWNED here so shutdown can quit them. (Passing an ioredis INSTANCE makes
  // BullMQ treat the base connection as `shared`, so worker.close() will NOT
  // quit it; we own the lifecycle explicitly to avoid leaking the socket.)
  const workerConnections: IORedis[] = [makeQueueConnection(), makeQueueConnection(), makeQueueConnection()]
  const emailWorker = startEmailWorker(prisma, workerConnections[0])
  const reconcileWorker = startReconcileWorker(prisma, workerConnections[1])
  const moderationWorker = startModerationWorker(prisma, workerConnections[2])
  // Idempotent: the stable jobId means exactly one repeatable sweep exists.
  await scheduleReconcile()
  const workers: Worker[] = [emailWorker, reconcileWorker, moderationWorker]
  console.info(`[worker] started — ${workers.length} processor(s) registered (email + outbox-reconciler + photo-moderation)`)

  let shuttingDown = false
  const shutdown = async (signal: string, exitCode: number): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    console.info(`[worker] ${signal} received — shutting down`)
    try {
      // Stop accepting/finishing jobs first; then quit the OWNED worker
      // connections, close the producer queues (the reconcile scheduler), and
      // disconnect the DB.
      await Promise.all(workers.map((w) => w.close()))
      await Promise.all(workerConnections.map((c) => c.quit().catch(() => undefined)))
      await closeQueues()
      await prisma.$disconnect()
    } catch (err) {
      console.error('[worker] shutdown error:', err instanceof Error ? err.message : String(err))
    } finally {
      process.exit(exitCode)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM', 0))
  process.on('SIGINT', () => void shutdown('SIGINT', 0))

  // Crash policy (carry-over): a worker must not die silently on an unhandled
  // async error, nor limp on after a truly unexpected one.
  //   - unhandledRejection: LOG and keep running. A processor's own failures are
  //     already handled (BullMQ retries → FAILED row); a stray rejection
  //     elsewhere should be visible but must not take the whole worker down.
  //   - uncaughtException: LOG and exit NON-ZERO (1) so the supervisor restarts a
  //     process left in an unknown state (fail-fast over corrupt-state).
  process.on('unhandledRejection', (reason) => {
    console.error('[worker] unhandledRejection:', reason instanceof Error ? reason.message : String(reason))
  })
  process.on('uncaughtException', (err) => {
    console.error('[worker] uncaughtException — exiting for restart:', err instanceof Error ? err.message : String(err))
    void shutdown('uncaughtException', 1)
  })
}

main().catch((err: unknown) => {
  console.error('[worker] failed to start:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
