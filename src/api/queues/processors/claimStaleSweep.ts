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
// Neon CU-burn PR-B: the hourly BullMQ repeatable is GONE — the sweep runs on
// the process-local maintenance scheduler as an independent, advisory-locked,
// bounded sweep (spec §4.2), split into:
//   Phase A (locked, light, DB-only, DB clock): the bounded ELIGIBLE scan
//     (@@index([status, claimedAt]); LIMIT 200) — eligibility (lastStaleAlertAt
//     vs claimedAt, a cross-column comparison Prisma cannot express in one
//     `where`) is pushed into a parameterized raw query so ineligible rows can
//     neither fake a backlog (false full=true → F_active hot loop) nor starve
//     eligible claims beyond the cap. The FULL ownership snapshot (claimedById,
//     claimedAt, lastStaleAlertAt) is carried into Phase B for the CAS below.
//   Phase B (unlocked, idempotent, cooperatively budgeted): per row, ONE short
//     bounded ATOMIC transaction (mirrors promoteOnePendingHours — spec §4.6
//     "an atomic single-tx row is one awaited op, not broken mid-tx"):
//     (1) a conditional compare-and-set stamps lastStaleAlertAt ONLY if the row
//         still EXACTLY matches the Phase-A snapshot (exists, still PENDING,
//         same claimant, same claimedAt, same lastStaleAlertAt — which also
//         re-proves the dedup condition); a CAS loss (released / reassigned /
//         actioned / resubmitted / hard-deleted / already-alerted meanwhile) is
//         a SAFE SKIP: no bell, not a failure.
//     (2) only the single CAS winner creates the in-app bell, INSIDE the same
//         transaction — so the notification and the stamp commit or roll back
//         together. A create failure rolls the stamp back and the row stays
//         eligible for a clean retry (no lost alert, no duplicate).
//     The cooperative stop predicate is honoured BEFORE each row (runBudgetedRows);
//     once the transaction starts it runs to commit/rollback as one awaited op.
//     Guarantee honesty: the CAS revalidates ownership under database
//     transaction ordering at COMMIT time — it does not (and cannot) prevent a
//     committed bell from referring to an approval that changes AFTER commit.

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

/** One ELIGIBLE stale claim, carrying the FULL ownership snapshot the Phase-B
 *  CAS compares against (claimedById + claimedAt + lastStaleAlertAt). */
export interface StaleClaimRow {
  id: string
  claimedById: string
  claimedAt: Date
  lastStaleAlertAt: Date | null
  referenceId: string
  referenceType: string
}

/** The Phase-A → Phase-B payload: the eligible rows PLUS the DB-authoritative
 *  clock (the lastStaleAlertAt stamp uses the same dbNow the scan ran against). */
export interface ClaimStaleSide {
  rows: StaleClaimRow[]
  dbNow: Date
}

/** Per-row transaction bounds (spec §4.2: every Phase-B per-row transaction is
 *  itself statement-timeout-bounded). Mirrors PromoteTxBounds. */
export interface ClaimStaleTxBounds {
  statementTimeoutMs: number
  txTimeoutMs: number
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
  // claimed more than 24 h ago, AND not yet alerted for THIS claim. The
  // snapshot columns (claimedAt, lastStaleAlertAt) ride along for the CAS.
  const rows = await tx.$queryRaw<StaleClaimRow[]>`
    SELECT "id", "claimedById", "claimedAt", "lastStaleAlertAt", "referenceId", "referenceType"
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
 * Alert ONE stale claim atomically (the Phase-B row unit). One short bounded
 * interactive transaction (mirrors promoteOnePendingHours):
 *
 *   (1) CAS: conditionally stamp lastStaleAlertAt = dbNow WHERE the row still
 *       EXACTLY matches the Phase-A snapshot — exists, status PENDING, same
 *       claimedById, same claimedAt, same lastStaleAlertAt. Any interleaved
 *       release / reclaim / approve / reject / request-changes / resubmit /
 *       hard-delete / sibling-sweep stamp makes the CAS match 0 rows. The
 *       conditional UPDATE serializes concurrent attempts on the row lock:
 *       exactly ONE transaction wins; every loser returns false WITHOUT
 *       writing a bell (safe skip, not a failure).
 *   (2) Only the CAS winner creates the in-app bell — inside the SAME
 *       transaction, so notification + stamp commit or roll back together. A
 *       create failure rolls the stamp back; the row stays eligible and a
 *       clean retry produces exactly one bell.
 *
 * The transaction is one awaited atomic operation: the cooperative stop signal
 * is honoured BEFORE the row starts (runBudgetedRows); once started it commits
 * or rolls back, never split mid-transaction. Both bounds come from the
 * validated maintenance config: a parameterized server-side statement_timeout
 * plus the explicit Prisma interactive-tx timeout.
 *
 * Guarantee honesty: the CAS revalidates the row under database transaction
 * ordering at commit time; it does not prevent the approval changing AFTER the
 * commit (a bell can still reference an approval actioned moments later).
 *
 * Returns true if this call alerted + stamped the row, false on CAS loss.
 */
export async function alertOneStaleClaim(
  prisma: PrismaClient,
  row: StaleClaimRow,
  dbNow: Date,
  bounds: ClaimStaleTxBounds,
): Promise<boolean> {
  return prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      // Bound each statement server-side, PARAMETERIZED (spec §4.2 — bound
      // value, never interpolation).
      await tx.$queryRaw`SELECT set_config('statement_timeout', ${String(bounds.statementTimeoutMs)}, true)`

      // (1) CAS against the EXACT Phase-A snapshot. `lastStaleAlertAt` equality
      // (null ⇒ IS NULL) re-proves the dedup condition; `claimedAt` equality
      // pins the exact claim generation; `claimedById` + status pin ownership.
      const won = await tx.adminApproval.updateMany({
        where: {
          id: row.id,
          status: 'PENDING',
          claimedById: row.claimedById,
          claimedAt: row.claimedAt,
          lastStaleAlertAt: row.lastStaleAlertAt,
        },
        data: { lastStaleAlertAt: dbNow },
      })
      if (won.count === 0) return false // ownership/state moved on — safe skip, no bell

      // (2) The single winner writes the bell in the SAME transaction: a
      // failure here rolls the stamp back too (row stays eligible, clean retry).
      await adminNotify(tx, {
        adminUserId: row.claimedById,
        type: 'ADMIN_CLAIM_STALE',
        title: 'A claimed review is going stale',
        body: 'You claimed a merchant review over 24 hours ago. Open the queue to finish it, or release it so another admin can pick it up.',
        referenceId: row.referenceId,
        referenceType: row.referenceType,
      })
      return true
    },
    { timeout: bounds.txTimeoutMs, maxWait: bounds.txTimeoutMs },
  )
}

/**
 * Phase B (unlocked, idempotent, cooperatively budgeted): each eligible row is
 * ONE atomic alertOneStaleClaim transaction. runBudgetedRows checks the
 * cooperative stop predicate BEFORE each row; a started row commits or rolls
 * back as one awaited op. A per-row transaction FAILURE is reported via
 * failedRows → the sweep is classified FAILURE and backs off on its OWN
 * degraded cadence; the un-stamped row stays eligible and replays after
 * recovery with no duplicate bell (the stamp and bell are atomic). A CAS loss
 * is a clean skip — neither a bell nor a failure.
 */
export function makeClaimStaleSideEffects(
  prisma: PrismaClient,
  bounds: ClaimStaleTxBounds,
): (side: ClaimStaleSide, budget: PhaseBBudget) => Promise<PhaseBOutcome> {
  return (side, budget) =>
    runBudgetedRows(side.rows, budget, (row) => alertOneStaleClaim(prisma, row, side.dbNow, bounds))
}

/** Build the stale-claim BoundedSweepSpec from the validated maintenance config (A4). */
export function buildClaimStaleSweep(
  prisma: PrismaClient,
  cfg: MaintenanceConfig & { mode: 'enabled' },
): BoundedSweepSpec<ClaimStaleSide> {
  return {
    name: CLAIM_STALE_SWEEP_NAME,
    lockKey: CLAIM_STALE_SWEEP_LOCK_KEY,
    // Phase B here is DATABASE work (the atomic CAS + bell transaction), so N
    // failed rows classify as a database-domain failure and the alert layer
    // stays log-only (writing a Notification would hit the down DB).
    sideEffectDomain: 'DATABASE',
    statementTimeoutMs: cfg.statementTimeoutMs,
    txTimeoutMs: cfg.txTimeoutMs,
    phaseBMaxItems: cfg.phaseBMaxItems,
    phaseBBudgetMs: cfg.phaseBBudgetMs,
    dbPhase: claimStaleDbPhase,
    runSideEffects: makeClaimStaleSideEffects(prisma, {
      statementTimeoutMs: cfg.statementTimeoutMs,
      txTimeoutMs: cfg.txTimeoutMs,
    }),
  }
}
