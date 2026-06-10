// src/worker.ts — the background-job WORKER process entrypoint.
//
// Phase 0 PR-0.1 stood this up as a heartbeat; PR-0.4 fills it in with real
// processors. It is the second process (alongside the Fastify API in
// src/index.ts): `npm run worker` (dev) / `npm run start:worker` (prod). It boots
// the same fail-closed env validation, constructs ONE Prisma client (the
// processors write CommunicationLog), then registers the BullMQ workers:
//   - email-delivery (EMAIL_QUEUE)        → sends QUEUED outbox rows
//   - outbox-reconciler (MAINTENANCE_QUEUE, repeatable 60 s) → re-enqueues stale QUEUED rows
//   - photo-moderation (MODERATION_QUEUE) → PR-0.6
//
// Each Worker gets its OWN Redis connection (makeQueueConnection) for its
// blocking reads — the PR-0.1 single "heartbeat" connection is gone now that the
// Workers themselves keep the process alive.

import 'dotenv/config'
import type { Worker } from 'bullmq'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { validateRequiredEnv } from './api/shared/env'
import { closeQueues } from './api/queues'
import { startEmailWorker } from './api/queues/processors/email'
import { startReconcileWorker, scheduleReconcile } from './api/queues/processors/outboxReconciler'

/**
 * Register the BullMQ workers this process runs, returning their handles for
 * graceful shutdown. Each Worker opens its own connection inside its factory.
 */
async function registerProcessors(prisma: PrismaClient): Promise<Worker[]> {
  const emailWorker = startEmailWorker(prisma)
  const reconcileWorker = startReconcileWorker(prisma)
  // Idempotent: the stable jobId means exactly one repeatable sweep exists.
  await scheduleReconcile()
  // (photo-moderation worker → PR-0.6)
  return [emailWorker, reconcileWorker]
}

async function main(): Promise<void> {
  // Fail-closed: same aggregated env check the API runs (REDIS_URL is required).
  validateRequiredEnv()

  // ONE Prisma client for every processor (mirrors the API's prisma plugin).
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })
  await prisma.$connect()

  const workers = await registerProcessors(prisma)
  console.info(`[worker] started — ${workers.length} processor(s) registered (email + outbox-reconciler)`)

  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    console.info(`[worker] ${signal} received — shutting down`)
    try {
      // Stop accepting/finishing jobs first, then close the producer queues
      // (the reconcile scheduler) and the DB.
      await Promise.all(workers.map((w) => w.close()))
      await closeQueues()
      await prisma.$disconnect()
    } catch (err) {
      console.error('[worker] shutdown error:', err instanceof Error ? err.message : String(err))
    } finally {
      process.exit(0)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  // Crash policy (carry-over): a worker must not die silently on an unhandled
  // async error, nor limp on after a truly unexpected one.
  //   - unhandledRejection: LOG and keep running. A processor's own failures are
  //     already handled (BullMQ retries → FAILED row); a stray rejection
  //     elsewhere should be visible but must not take the whole worker down.
  //   - uncaughtException: LOG and exit non-zero so the supervisor restarts a
  //     process left in an unknown state (fail-fast over corrupt-state).
  process.on('unhandledRejection', (reason) => {
    console.error('[worker] unhandledRejection:', reason instanceof Error ? reason.message : String(reason))
  })
  process.on('uncaughtException', (err) => {
    console.error('[worker] uncaughtException — exiting for restart:', err instanceof Error ? err.message : String(err))
    void shutdown('uncaughtException')
  })
}

main().catch((err: unknown) => {
  console.error('[worker] failed to start:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
