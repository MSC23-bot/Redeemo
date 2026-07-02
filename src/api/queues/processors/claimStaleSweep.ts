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
//   Phase A (locked, light, DB-only, DB clock): the bounded ELIGIBLE scan
//     (@@index([status, claimedAt]); LIMIT 200) — eligibility (lastStaleAlertAt
//     vs claimedAt, a cross-column comparison Prisma cannot express in one
//     `where`) is pushed into a parameterized raw query so ineligible rows can
//     neither fake a backlog (false full=true → F_active hot loop) nor starve
//     eligible claims beyond the cap.
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
 * clock (spec §8.3): select ONLY genuinely ELIGIBLE stale claims at the
 * DATABASE level. Eligibility = never alerted, OR a LATER claim than the last
 * alert (release + reclaim stamps a newer claimedAt, which re-arms the nudge).
 *
 * The cross-column comparison (`lastStaleAlertAt < claimedAt`) is inexpressible
 * in a single Prisma `where`, so this is a PARAMETERIZED raw query (tagged
 * template — bound values, never interpolation) on the SAME locked `tx`.
 * Pushing eligibility into SQL is load-bearing for the CU-burn goal: with a
 * JS-side filter, 200 stale-but-already-alerted candidates would (a) produce a
 * FALSE full=true every scan — pinning the sweep to the F_active cadence with
 * zero eligible work (re-creating the compute-wake pattern this programme
 * removes) — and (b) STARVE eligible claims sitting beyond the 200-candidate
 * cap. `full` derives from the ELIGIBLE count only; ordering is deterministic
 * (claimedAt, then id) so the oldest eligible claims always drain first.
 */
export async function claimStaleDbPhase(
  tx: Prisma.TransactionClient,
  dbNow: Date,
): Promise<{ full: boolean; sideEffects: ClaimStaleSide }> {
  const cutoff = new Date(dbNow.getTime() - CLAIM_STALE_AGE_MS)

  // Eligible scan (index-backed on [status, claimedAt]): PENDING, claimed,
  // claimed more than 24 h ago, AND not yet alerted for THIS claim.
  const rows = await tx.$queryRaw<StaleClaimRow[]>`
    SELECT "id", "claimedById", "referenceId", "referenceType"
    FROM "AdminApproval"
    WHERE "status" = 'PENDING'
      AND "claimedById" IS NOT NULL
      AND "claimedAt" < ${cutoff}
      AND ("lastStaleAlertAt" IS NULL OR "lastStaleAlertAt" < "claimedAt")
    ORDER BY "claimedAt" ASC, "id" ASC
    LIMIT ${CLAIM_STALE_BATCH}
  `

  // A full ELIGIBLE batch ⇒ needsRescan: more eligible claims may sit past the
  // cap. Ineligible rows can never produce backlog.
  return { full: rows.length >= CLAIM_STALE_BATCH, sideEffects: { rows, dbNow } }
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
