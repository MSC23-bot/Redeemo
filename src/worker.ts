// src/worker.ts — the background-job WORKER process entrypoint.
//
// Phase 0 PR-0.1: the FOUNDATION. This is the second process (alongside the
// Fastify API in src/index.ts): `npm run worker` (dev) / `npm run start:worker`
// (prod). It boots the same fail-closed env validation, then registers BullMQ
// workers via registerProcessors().
//
// registerProcessors() is intentionally EMPTY for now — the email-delivery +
// outbox-reconciler workers land in PR-0.4 and the photo-moderation worker in
// PR-0.6. Until then the process stays alive on its Redis connection, ready to
// host processors, and shuts down cleanly on SIGTERM/SIGINT.
//
// NOTE: the worker does NOT construct a Prisma client yet — nothing here uses
// the DB until a processor lands (PR-0.4 writes CommunicationLog; PR-0.6 writes
// BranchPhoto). Adding an unused client now would be dead code; it arrives with
// the first processor that needs it.

import 'dotenv/config'
import type { Worker } from 'bullmq'
import { validateRequiredEnv } from './api/shared/env'
import { makeQueueConnection, closeQueues } from './api/queues'

/**
 * Register the BullMQ workers this process should run, returning their handles
 * for graceful shutdown. EMPTY in PR-0.1 — each worker gets its OWN connection
 * (makeQueueConnection) when added:
 *   - email-delivery + reconcile-outbox → PR-0.4
 *   - photo-moderation                  → PR-0.6
 */
async function registerProcessors(): Promise<Worker[]> {
  return []
}

async function main(): Promise<void> {
  // Fail-closed: same aggregated env check the API runs (REDIS_URL is required).
  validateRequiredEnv()

  // An open Redis connection keeps the process alive + ready to host processors.
  // (When real workers land they each get their own connection; this one is the
  // foundation's heartbeat until then.)
  const connection = makeQueueConnection()
  connection.on('error', (err) => {
    console.error('[worker] redis connection error:', err instanceof Error ? err.message : String(err))
  })

  const workers = await registerProcessors()
  console.info(
    `[worker] started — ${workers.length} processor(s) registered` +
      (workers.length === 0 ? ' (email/moderation processors land in PR-0.4 / PR-0.6)' : ''),
  )

  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    console.info(`[worker] ${signal} received — shutting down`)
    try {
      await Promise.all(workers.map((w) => w.close()))
      await closeQueues()
      await connection.quit()
    } catch (err) {
      console.error('[worker] shutdown error:', err instanceof Error ? err.message : String(err))
    } finally {
      process.exit(0)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err: unknown) => {
  console.error('[worker] failed to start:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
