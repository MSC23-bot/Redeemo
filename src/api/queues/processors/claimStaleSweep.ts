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
//   status = PENDING  AND  claimedById != null  AND  claimedAt < dbNow − 24h.
//
// Dedup + re-arm via AdminApproval.lastStaleAlertAt: alert once per distinct
// claim; re-arm only after release + reclaim (a newer claimedAt).
//
// Neon CU-burn PR-B: the hourly BullMQ repeatable is GONE — the sweep now runs
// on the process-local maintenance scheduler as an independent, advisory-locked,
// bounded sweep (spec §4.2), split into:
//   Phase A (locked, light, DB-only, DB clock): the bounded candidate scan
//     (@@index([status, claimedAt]); LIMIT 200) + the JS eligibility/dedup
//     filter over that bounded set (lastStaleAlertAt vs claimedAt is a
//     two-column comparison Prisma cannot express in one `where`).
//   Phase B (unlocked, idempotent, cooperatively budgeted): per row —
//     adminNotify, then a SEPARATE isStopping() check, then the
//     lastStaleAlertAt stamp. The between-ops check means no stamp update ever
//     STARTS after the stop signal. HONEST EDGE (spec §4.6): if stop lands
//     while adminNotify is already in flight, the bell may complete while the
//     stamp is skipped — the row stays eligible, so ONE benign duplicate bell
//     can follow after restart. We do NOT claim the in-flight notification is
//     cancelled.

import type { Prisma, PrismaClient } from '../../../../generated/prisma/client'
import { adminNotify } from '../../shared/adminNotify'
import {
  runBudgetedRows,
  type BoundedSweepSpec,
  type PhaseBBudget,
  type PhaseBOutcome,
} from '../maintenanceSweep'
import type { MaintenanceConfig } from '../../shared/env'

/** A claim older than this (and still unfinished) is "stale" and earns one nudge. */
export const CLAIM_STALE_AGE_MS = 24 * 60 * 60 * 1000 // 24 h
/** Bound per Phase-A scan so a backlog can't thundering-herd the bell writes. */
export const CLAIM_STALE_BATCH = 200

/** The stale-claim sweep's advisory-lock identity — distinct per sweep (spec §4.1). */
export const CLAIM_STALE_SWEEP_LOCK_KEY = 731_003n
export const CLAIM_STALE_SWEEP_NAME = 'claim-stale'

/** One ELIGIBLE stale claim (already deduped/re-arm-filtered in Phase A). */
export interface StaleClaimRow {
  id: string
  claimedById: string
  referenceId: string
  referenceType: string
}

/** The Phase-A → Phase-B payload: the eligible rows PLUS the DB-authoritative
 *  clock (the lastStaleAlertAt stamp uses the same dbNow the scan ran against). */
export interface ClaimStaleSide {
  rows: StaleClaimRow[]
  dbNow: Date
}

/**
 * Phase A (locked, light, DB-only) — runs on `tx` with the DB-authoritative
 * clock (spec §8.3): the bounded candidate scan, then the eligibility filter
 * (never alerted, OR a LATER claim than the last alert — release + reclaim
 * stamps a newer claimedAt, which re-arms the nudge). Light JS over a bounded
 * set; no per-row DB work happens here.
 */
export async function claimStaleDbPhase(
  tx: Prisma.TransactionClient,
  dbNow: Date,
): Promise<{ full: boolean; sideEffects: ClaimStaleSide }> {
  const cutoff = new Date(dbNow.getTime() - CLAIM_STALE_AGE_MS)

  // Candidate scan (index-backed on [status, claimedAt]): PENDING, claimed, and
  // claimed more than 24 h ago.
  const candidates = await tx.adminApproval.findMany({
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

  const rows: StaleClaimRow[] = []
  for (const a of candidates) {
    // Eligible if never alerted, OR a LATER claim than the last alert.
    const eligible =
      a.lastStaleAlertAt === null || (a.claimedAt !== null && a.lastStaleAlertAt < a.claimedAt)
    if (!eligible) continue
    if (!a.claimedById) continue // defensive: the where already excludes null
    rows.push({
      id: a.id,
      claimedById: a.claimedById,
      referenceId: a.referenceId,
      referenceType: a.referenceType,
    })
  }

  // A full CANDIDATE batch ⇒ needsRescan: more stale claims may sit past the cap.
  return { full: candidates.length >= CLAIM_STALE_BATCH, sideEffects: { rows, dbNow } }
}

/**
 * Phase B (unlocked, idempotent, cooperatively budgeted): per eligible row,
 * bell the claimer then stamp lastStaleAlertAt with dbNow. TWO separately
 * awaited ops per row, so the cooperative stop predicate is checked BETWEEN
 * them (spec §4.6): once stop is requested, no stamp update starts. A per-row
 * failure (notify OR stamp) is reported via failedRows → the sweep is
 * classified FAILURE and backs off on its OWN degraded cadence; the un-stamped
 * row stays eligible and replays after recovery (lastStaleAlertAt dedup keeps
 * repeat runs to at most one duplicate bell per interruption — benign).
 */
export function makeClaimStaleSideEffects(
  prisma: PrismaClient,
): (side: ClaimStaleSide, budget: PhaseBBudget) => Promise<PhaseBOutcome> {
  return (side, budget) =>
    runBudgetedRows(side.rows, budget, async (row) => {
      await adminNotify(prisma, {
        adminUserId: row.claimedById,
        type: 'ADMIN_CLAIM_STALE',
        title: 'A claimed review is going stale',
        body: 'You claimed a merchant review over 24 hours ago. Open the queue to finish it, or release it so another admin can pick it up.',
        referenceId: row.referenceId,
        referenceType: row.referenceType,
      })
      // BETWEEN-OPS cooperative stop (spec §4.6): the bell already went out; if
      // the terminal stop signal landed while it was in flight, do NOT start the
      // stamp update. Honest edge: the row stays eligible, so one benign
      // duplicate bell may follow after restart — we never claim the in-flight
      // adminNotify was cancelled.
      if (budget.isStopping()) return
      await prisma.adminApproval.update({
        where: { id: row.id },
        data: { lastStaleAlertAt: side.dbNow },
      })
    })
}

/** Build the stale-claim BoundedSweepSpec from the validated maintenance config (A4). */
export function buildClaimStaleSweep(
  prisma: PrismaClient,
  cfg: MaintenanceConfig & { mode: 'enabled' },
): BoundedSweepSpec<ClaimStaleSide> {
  return {
    name: CLAIM_STALE_SWEEP_NAME,
    lockKey: CLAIM_STALE_SWEEP_LOCK_KEY,
    statementTimeoutMs: cfg.statementTimeoutMs,
    txTimeoutMs: cfg.txTimeoutMs,
    phaseBMaxItems: cfg.phaseBMaxItems,
    phaseBBudgetMs: cfg.phaseBBudgetMs,
    dbPhase: claimStaleDbPhase,
    runSideEffects: makeClaimStaleSideEffects(prisma),
  }
}
