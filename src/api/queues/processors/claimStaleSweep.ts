// src/api/queues/processors/claimStaleSweep.ts
//
// WP4: the stale-claim nudge. When an admin claims a merchant review
// (AdminApproval.claimedById set, claimedAt stamped) but does not finish it
// (approve / reject / request-changes, each of which RELEASES the claim) within
// 24 hours, this sweep pushes ONE in-app ADMIN_CLAIM_STALE bell notification to
// the claimer so the work does not silently stall. Bell only: it calls
// adminNotify (the in-app-only writer) and never touches email.
//
// Because every actioner path nulls claimedById on completion, a row with a
// non-null claimedById is always PENDING, so the target is precisely:
//   status = PENDING  AND  claimedById != null  AND  claimedAt < now − 24h.
//
// Dedup + re-arm via AdminApproval.lastStaleAlertAt: alert once per distinct
// claim; re-arm only after release + reclaim (a newer claimedAt). The
// @@index([status, claimedAt]) keeps the candidate scan cheap; the LIMIT bounds
// each run; per-row try/catch keeps one failed alert from aborting the batch.
//
// Scheduling + worker dispatch live alongside the outbox reconciler on
// MAINTENANCE_QUEUE (src/worker.ts + outboxReconciler.startReconcileWorker). This
// module is the pure sweep, exported so it is unit-testable without BullMQ.

import type { PrismaClient } from '../../../../generated/prisma/client'
import { MAINTENANCE_QUEUE, makeQueue } from '../index'
import { adminNotify } from '../../shared/adminNotify'

/** A claim older than this (and still unfinished) is "stale" and earns one nudge. */
export const CLAIM_STALE_AGE_MS = 24 * 60 * 60 * 1000 // 24 h
/** Bound per run so a backlog can't thundering-herd the bell writes. */
export const CLAIM_STALE_BATCH = 200
/** Repeatable sweep cadence + its stable job name. A 24 h window needs no tighter cadence. */
export const CLAIM_STALE_JOB = 'sweep-stale-claims'
export const CLAIM_STALE_EVERY_MS = 60 * 60 * 1000 // hourly

export interface ClaimStaleResult {
  /** rows that earned a fresh ADMIN_CLAIM_STALE alert this run. */
  alerted: number
  /** candidate rows scanned (after the SQL window/status/claimed filter). */
  scanned: number
}

/**
 * Pure sweep. `now` is injectable for tests. For each eligible stale claim it
 * sends the claimer one ADMIN_CLAIM_STALE bell notification, then stamps
 * lastStaleAlertAt so the same claim never re-fires. Idempotent across runs.
 */
export async function sweepStaleClaims(prisma: PrismaClient, now: Date = new Date()): Promise<ClaimStaleResult> {
  const cutoff = new Date(now.getTime() - CLAIM_STALE_AGE_MS)

  // Candidate scan (index-backed on [status, claimedAt]): PENDING, claimed, and
  // claimed more than 24 h ago. The dedup/re-arm test below is a two-column
  // comparison (lastStaleAlertAt vs claimedAt) which Prisma cannot express in a
  // single `where`, so it runs in JS over this bounded candidate set.
  const candidates = await prisma.adminApproval.findMany({
    where: {
      status: 'PENDING',
      claimedById: { not: null },
      claimedAt: { lt: cutoff },
    },
    take: CLAIM_STALE_BATCH,
    select: {
      id: true,
      claimedById: true,
      claimedAt: true,
      referenceId: true,
      referenceType: true,
      lastStaleAlertAt: true,
    },
  })

  let alerted = 0
  for (const a of candidates) {
    // Eligible if never alerted, OR a LATER claim than the last alert (release +
    // reclaim stamps a newer claimedAt, which re-arms the nudge for the new claim).
    const eligible =
      a.lastStaleAlertAt === null || (a.claimedAt !== null && a.lastStaleAlertAt < a.claimedAt)
    if (!eligible) continue
    if (!a.claimedById) continue // defensive: the where already excludes null

    try {
      await adminNotify(prisma, {
        adminUserId: a.claimedById,
        type: 'ADMIN_CLAIM_STALE',
        title: 'A claimed review is going stale',
        body: 'You claimed a merchant review over 24 hours ago. Open the queue to finish it, or release it so another admin can pick it up.',
        referenceId: a.referenceId,
        referenceType: a.referenceType,
      })
      await prisma.adminApproval.update({ where: { id: a.id }, data: { lastStaleAlertAt: now } })
      alerted++
    } catch (err) {
      // Best-effort: one failed alert must not abort the rest of the batch.
      console.warn(
        `[claim-stale] best-effort alert for approval ${a.id} failed, sweep continues: ` +
          (err instanceof Error ? err.message : String(err)),
      )
    }
  }
  return { alerted, scanned: candidates.length }
}

/**
 * Register the repeatable claim-stale sweep on MAINTENANCE_QUEUE (idempotent: the
 * stable jobId means exactly ONE repeatable exists, even across restarts). The
 * MAINTENANCE_QUEUE worker (outboxReconciler.startReconcileWorker) dispatches the
 * CLAIM_STALE_JOB to sweepStaleClaims. Call once at boot from src/worker.ts.
 */
export async function scheduleClaimStaleSweep(): Promise<void> {
  // makeQueue is async since PR-A Task A5 (explicit connect-before-Queue).
  await (await makeQueue(MAINTENANCE_QUEUE)).add(
    CLAIM_STALE_JOB,
    {},
    {
      repeat: { every: CLAIM_STALE_EVERY_MS },
      jobId: CLAIM_STALE_JOB,
      removeOnComplete: true,
      removeOnFail: 100,
    },
  )
}
