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
import { performance } from 'node:perf_hooks'
import type { Worker } from 'bullmq'
import type IORedis from 'ioredis'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { validateRequiredEnv, resolveMaintenanceConfig } from './api/shared/env'
import { closeQueues, makeQueueConnection } from './api/queues'
import {
  startMaintenanceScheduler,
  makeSweepRuntime,
  type MaintenanceScheduler,
} from './api/queues/maintenanceScheduler'
import { createAlertSink, type AlertSink } from './api/queues/maintenanceMetrics'
import { startEmailWorker } from './api/queues/processors/email'
import { startReconcileWorker, buildOutboxSweep } from './api/queues/processors/outboxReconciler'
import { buildClaimStaleSweep } from './api/queues/processors/claimStaleSweep'
import { buildPendingHoursSweep } from './api/queues/processors/promotePendingHours'
import { startModerationWorker } from './api/queues/processors/moderation'
import { runWorkerShutdown } from './workerShutdown'

// Neon CU-burn PR-A: maintenance-scheduler candidate values. The MECHANISM is
// locked by the frozen spec; these NUMBERS remain benchmark/owner-gated
// (spec §15) and are revisited at the staging-activation gate.
const MAINTENANCE_EMPTY_SCANS_TO_IDLE = 2
const MAINTENANCE_DEGRADED_BASE_MS = 60_000
const MAINTENANCE_DEGRADED_MAX_MS = 3_600_000
const MAINTENANCE_ALERT_AFTER_FAILURES = 3
const MAINTENANCE_STOP_DRAIN_MS = 10_000
const MAINTENANCE_FORCE_JOIN_MS = 5_000
/** Bounds the BullMQ worker-close + connection-quit phase of shutdown so a stuck
 *  in-flight job can never stall SIGTERM indefinitely (spec §4.6: shutdown never
 *  waits indefinitely). On expiry the owned sockets are force-disconnected. */
const WORKER_CLOSE_TIMEOUT_MS = 10_000
/** Bounds prisma.$disconnect so a hanging pool teardown cannot prevent the
 *  scheduler forceJoin or the final process.exit. */
const PRISMA_DISCONNECT_TIMEOUT_MS = 5_000

async function main(): Promise<void> {
  // Fail-closed: same aggregated env check the API runs (REDIS_URL is required).
  validateRequiredEnv()

  // Encryption key-rotation R1 (spec §3.9 / Amendment #13 — Neon cost
  // containment). `--verify-keyring-and-exit` publishes the WORKER service's
  // keyring fingerprint row (so the migrator can read worker parity directly
  // from the table) and exits WITHOUT registering any BullMQ Worker / queue /
  // repeatable — the worker daemon (its 60s/hourly sweeps are the Neon CU burn)
  // stays offline. MUST run after validateRequiredEnv() and BEFORE any BullMQ.
  if (process.argv.includes('--verify-keyring-and-exit')) {
    // Codex review finding 5: the body is EXTRACTED into verifyKeyringAndExit so it is
    // unit-testable + guarantees prisma.$disconnect() via finally on success / false /
    // thrown. This mode IS the parity-verification step, so a failed publish exits
    // NON-ZERO (else an operator/CI relying on it gets a false green and proceeds to a
    // flip/migration with unverified worker parity). No BullMQ is registered.
    const { verifyKeyringAndExit } = await import('./api/shared/keyringVerify')
    const code = await verifyKeyringAndExit({
      makePrisma: () => {
        const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
        return new PrismaClient({ adapter })
      },
      publish: async (prisma) => {
        const { publishKeyringFingerprint } = await import('./api/shared/keyring')
        return publishKeyringFingerprint(prisma, 'worker')
      },
    })
    process.exit(code)
  }

  // Neon CU-burn PR-A Task A4 (spec §14): resolve the maintenance startup policy
  // BEFORE any worker resource (Prisma/Redis/BullMQ) is created — but AFTER the
  // --verify-keyring-and-exit early path above, which is a self-contained R1
  // operational mode that never runs maintenance. MAINTENANCE_MODE=disabled is
  // the ONLY intentional off-path; enabled/defaulted with missing or invalid
  // values THROWS here → main().catch → exit(1), supervisor-visible. A
  // validation failure never silently becomes disabled mode.
  const maintenance = resolveMaintenanceConfig(process.env)

  // ONE Prisma client for every processor (mirrors the API's prisma plugin).
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })
  await prisma.$connect()

  // Encryption key-rotation R1: a normally-running worker also publishes its
  // keyring fingerprint at boot (best-effort, never blocks). The offline
  // cost-contained path uses --verify-keyring-and-exit above instead.
  // CodeRabbit (Major, stability): wrap the dynamic IMPORT too — if the import
  // itself rejects, an un-wrapped `await import()` would crash worker boot. The
  // whole best-effort publish (import + call) is swallowed so boot never blocks.
  try {
    const { publishKeyringFingerprint } = await import('./api/shared/keyring')
    await publishKeyringFingerprint(prisma, 'worker')
  } catch (err) {
    console.error('[worker] keyring fingerprint publish skipped (best-effort)', {
      reason: err instanceof Error ? err.message : String(err),
    })
  }

  // Each Worker gets its OWN Redis connection for its blocking reads — created +
  // OWNED here so shutdown can quit them. (Passing an ioredis INSTANCE makes
  // BullMQ treat the base connection as `shared`, so worker.close() will NOT
  // quit it; we own the lifecycle explicitly to avoid leaking the socket.)
  const workerConnections: IORedis[] = [makeQueueConnection(), makeQueueConnection(), makeQueueConnection()]
  const emailWorker = startEmailWorker(prisma, workerConnections[0])
  const reconcileWorker = startReconcileWorker(prisma, workerConnections[1])
  const moderationWorker = startModerationWorker(prisma, workerConnections[2])
  // Neon CU-burn PR-B: NO recurring BullMQ repeatable is registered any more.
  // Every recurring sweep (outbox reconcile, pending-hours promotion,
  // stale-claim) lives on the process-local maintenance scheduler below; the
  // MAINTENANCE_QUEUE worker serves only the per-record pending-hours nudge.
  const workers: Worker[] = [emailWorker, reconcileWorker, moderationWorker]
  console.info(`[worker] started: ${workers.length} processor(s) registered (email + maintenance[pending-hours-nudge only] + photo-moderation)`)

  // Neon CU-burn PR-A A2/A3 + PR-B: the process-local maintenance scheduler —
  // the durable floor for ALL THREE sweeps, each an independent advisory-locked
  // unit with its own enable flag (= per-sweep rollback switch), state and
  // backoff. Redis-independent (survives a Redis outage) but NOT durable: the
  // DB rows + the immediate BOOT scan are the durable guarantee.
  let scheduler: MaintenanceScheduler | null = null
  let alertSink: AlertSink | null = null
  if (maintenance.mode === 'disabled') {
    // Loud structured log — the explicit owner-approved off-path (spec §14).
    console.warn(
      '[worker] MAINTENANCE_MODE=disabled — maintenance scheduler NOT started; the durable maintenance floor is OFF (explicit opt-out; outbox expiry/re-enqueue, pending-hours promotion and stale-claim reconciliation will not run)',
    )
  } else {
    // Neon CU-burn PR-C: the maintenance AlertSink — in-app admin alerts
    // (degraded/recovered/expired-outbox via getAlertableAdmins + adminNotify,
    // NO CommunicationLog, NO email) + in-process counters + structured logs.
    // Wired into the four PR-C scheduler seams and the outbox sweep's
    // post-commit expiry emission; stopped in ordered shutdown below.
    alertSink = createAlertSink(prisma)
    const sink = alertSink
    scheduler = startMaintenanceScheduler(
      prisma,
      {
        idleMs: maintenance.floorIdleMs,
        activeMs: maintenance.floorActiveMs,
        emptyScansToIdle: MAINTENANCE_EMPTY_SCANS_TO_IDLE,
        degradedBaseMs: MAINTENANCE_DEGRADED_BASE_MS,
        degradedMaxMs: MAINTENANCE_DEGRADED_MAX_MS,
        alertAfterFailures: MAINTENANCE_ALERT_AFTER_FAILURES,
        stopDrainMs: MAINTENANCE_STOP_DRAIN_MS,
        nowMs: () => Date.now(),
        monotonicNowMs: () => performance.now(),
        recordSweepFailure: (name, state, error) => sink.sweepFailure(name, state, error),
        alertDegraded: (name, streak) => sink.sweepDegraded(name, streak),
        sweepRecovered: (name) => sink.sweepRecovered(name),
        onSweepRun: (info) => sink.sweepRun(info),
      },
      [
        makeSweepRuntime(buildOutboxSweep(maintenance, sink), maintenance.sweepOutboxEnabled),
        makeSweepRuntime(buildPendingHoursSweep(prisma, maintenance), maintenance.sweepPendingHoursEnabled),
        makeSweepRuntime(buildClaimStaleSweep(prisma, maintenance), maintenance.sweepClaimStaleEnabled),
      ],
    )
    console.info(
      `[worker] maintenance scheduler started (outbox ${maintenance.sweepOutboxEnabled ? 'ENABLED' : 'disabled'}, pending-hours ${maintenance.sweepPendingHoursEnabled ? 'ENABLED' : 'disabled'}, claim-stale ${maintenance.sweepClaimStaleEnabled ? 'ENABLED' : 'disabled'}; F_idle=${maintenance.floorIdleMs}ms, F_active=${maintenance.floorActiveMs}ms)`,
    )
  }

  let shuttingDown = false
  const shutdown = async (signal: string, exitCode: number): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    console.info(`[worker] ${signal} received — shutting down`)
    try {
      // Neon CU-burn PR-A Task A6 — the ORDERED, END-TO-END BOUNDED shutdown
      // (spec §4.6), extracted to a testable coordinator: terminal cooperative
      // scheduler stop (bounded drain) → BullMQ workers close + owned
      // connection quit (bounded; force-disconnect on timeout) → producer
      // closeQueues (bounded + real force-close) → Prisma disconnect (bounded)
      // → scheduler forceJoin — so the process.exit below is ALWAYS reached.
      const summary = await runWorkerShutdown({
        scheduler,
        alertSink,
        workers,
        workerConnections,
        closeQueues,
        disconnectPrisma: () => prisma.$disconnect(),
        workerCloseTimeoutMs: WORKER_CLOSE_TIMEOUT_MS,
        prismaDisconnectTimeoutMs: PRISMA_DISCONNECT_TIMEOUT_MS,
        forceJoinTimeoutMs: MAINTENANCE_FORCE_JOIN_MS,
      })
      console.info('[worker] shutdown summary', summary)
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
