// src/api/queues/processors/leadAnonymiseSweep.ts
//
// MerchantLead packet slice 3 (owner OD1, UK-GDPR): the 6-month contact-PII
// anonymisation sweep. OD1 reading (Fable-adjudicated review round 2): Lost AND
// stale-untouched leads anonymise 6 months AFTER their last activity. Every
// service mutation bumps lastActivityAt (including the move to LOST), so a
// SINGLE clock predicate (lastActivityAt < dbNow - 6 months) covers both cases:
// a LOST lead anonymises 6 months after it was marked lost, which preserves the
// LOST-to-lane revival affordance for that whole window (a rep can revive a
// recently-lost lead before its PII goes). A qualifying lead that was never
// converted has its three contact fields (contactName / contactEmail /
// contactPhone) plus nextAction (free text, a PII vector) NULLED and
// anonymisedAt stamped. businessName / categoryGuess / locationHint / outcome
// (lostReason) are RETAINED (recruitment analytics + the Lost outcome survive
// without the PII). A CONVERTED lead (convertedMerchantId set) is EXEMPT: its
// owner detail lives on the merchant, not the lead. anonymise, never delete;
// idempotent; auditable.
//
// Mirrors the claim-stale sweep's structure faithfully (spec §4.2), split into:
//   Phase A (locked, light, DB-only, DB clock): the bounded ELIGIBLE scan
//     (@@index([anonymisedAt, lastActivityAt]); LIMIT 200) over rows WHERE
//     anonymisedAt IS NULL AND convertedMerchantId IS NULL AND lastActivityAt <
//     dbNow - 6 months. The FULL row snapshot (id, stage, lastActivityAt,
//     convertedMerchantId, anonymisedAt) rides into Phase B for the CAS below;
//     stage still rides along so the audit can classify the trigger (LOST vs
//     STALE). The 6-month cutoff is computed from the DB-authoritative dbNow and
//     BOUND as a parameter (never interpolated), so worker clock skew cannot
//     move the retention boundary.
//   Phase B (unlocked, idempotent, cooperatively budgeted): per row, ONE short
//     bounded ATOMIC transaction:
//     (1) a conditional compare-and-set updateMany null-guards on the EXACT
//         Phase-A snapshot (id, anonymisedAt still null, convertedMerchantId
//         still null, lastActivityAt unchanged, stage unchanged). A TOUCHED lead
//         re-arms its 6-month clock (lastActivityAt moved) and a CONVERTED lead
//         becomes exempt (convertedMerchantId set): both make the CAS match 0
//         rows and SAFELY SKIP (no write, not a failure). It nulls the three
//         contact fields and stamps anonymisedAt = dbNow.
//     (2) the single CAS winner writes a LEAD_ANONYMISED AuditLog row in the
//         SAME transaction (actorType SYSTEM), carrying trigger 'LOST' | 'STALE'
//         and NO PII values anywhere (the nulled values are never snapshotted):
//         so the stamp and the audit row commit or roll back together.
//     The cooperative stop predicate is honoured BEFORE each row; a started
//     transaction runs to commit/rollback as one awaited op.

import type { Prisma, PrismaClient } from '../../../../generated/prisma/client'
import { writeAuditLogTx } from '../../shared/audit'
import {
  runBudgetedRows,
  type BoundedSweepSpec,
  type PhaseBBudget,
  type PhaseBOutcome,
} from '../maintenanceSweep'
import type { MaintenanceConfig } from '../../shared/env'

/** OD1 / UK-GDPR retention window: a non-converted lead's contact PII is
 *  anonymised once its lastActivityAt is this many months old (Lost leads too:
 *  the move to LOST bumps lastActivityAt, so their clock starts at the loss). */
export const LEAD_ANONYMISE_STALE_MONTHS = 6
/** Bound per Phase-A scan so a backlog can't thundering-herd the CAS writes. */
export const LEAD_ANONYMISE_BATCH = 200

/** The lead-anonymise sweep's advisory-lock identity: distinct per sweep
 *  (convention: 731_001 outbox, 731_002 pending-hours, 731_003 claim-stale,
 *  731_004 lead-anonymise). */
export const LEAD_ANONYMISE_SWEEP_LOCK_KEY = 731_004n
export const LEAD_ANONYMISE_SWEEP_NAME = 'lead-anonymise'

/** The DB-authoritative 6-month cutoff: a lead untouched since BEFORE this
 *  instant is stale. Calendar-accurate (whole months from dbNow), so it is
 *  bound as a parameter, never interpolated. */
export function leadStaleCutoff(dbNow: Date): Date {
  const cutoff = new Date(dbNow)
  cutoff.setMonth(cutoff.getMonth() - LEAD_ANONYMISE_STALE_MONTHS)
  return cutoff
}

/** Audit trigger classification for a qualifying lead: every eligible row cleared
 *  the same 6-month clock, but the audit records WHY it was in the pipeline at
 *  anonymise time: a LOST lead is 'LOST', any live-lane lead is 'STALE'. */
export function leadAnonymiseTrigger(row: Pick<AnonymiseLeadRow, 'stage'>): 'LOST' | 'STALE' {
  return row.stage === 'LOST' ? 'LOST' : 'STALE'
}

/** One ELIGIBLE lead, carrying the FULL snapshot the Phase-B CAS compares
 *  against (anonymisedAt + convertedMerchantId + lastActivityAt + stage). */
export interface AnonymiseLeadRow {
  id: string
  stage: string
  lastActivityAt: Date
  convertedMerchantId: string | null
  anonymisedAt: Date | null
}

/** The Phase-A -> Phase-B payload: the eligible rows PLUS the DB-authoritative
 *  clock (the anonymisedAt stamp uses the same dbNow the scan ran against). */
export interface LeadAnonymiseSide {
  rows: AnonymiseLeadRow[]
  dbNow: Date
}

/** Per-row transaction bounds (spec §4.2). Mirrors ClaimStaleTxBounds. */
export interface LeadAnonymiseTxBounds {
  statementTimeoutMs: number
  txTimeoutMs: number
}

/**
 * Phase A (locked, light, DB-only): runs on `tx` with the DB-authoritative
 * clock: select ONLY genuinely ELIGIBLE leads at the DATABASE level. Eligibility
 * = not yet anonymised, never converted, AND untouched for 6 months
 * (lastActivityAt < dbNow - 6 months): a SINGLE clock predicate that covers
 * Lost leads too (the move to LOST bumped lastActivityAt, so a Lost lead's clock
 * runs from its loss, preserving the revival window; OD1 review round 2). A
 * PARAMETERIZED raw query (tagged template: bound values, never interpolation)
 * on the SAME locked `tx`; the 6-month cutoff and the batch cap are bound. The
 * FULL snapshot (stage, lastActivityAt, convertedMerchantId, anonymisedAt) rides
 * along for the CAS and the trigger classification. Deterministic ordering
 * (lastActivityAt, then id) drains the oldest eligible leads first; `full`
 * derives from the ELIGIBLE count only.
 */
export async function leadAnonymiseDbPhase(
  tx: Prisma.TransactionClient,
  dbNow: Date,
): Promise<{ full: boolean; sideEffects: LeadAnonymiseSide }> {
  const cutoff = leadStaleCutoff(dbNow)

  const rows = await tx.$queryRaw<AnonymiseLeadRow[]>`
    SELECT "id", "stage", "lastActivityAt", "convertedMerchantId", "anonymisedAt"
    FROM "MerchantLead"
    WHERE "anonymisedAt" IS NULL
      AND "convertedMerchantId" IS NULL
      AND "lastActivityAt" < ${cutoff}
    ORDER BY "lastActivityAt" ASC, "id" ASC
    LIMIT ${LEAD_ANONYMISE_BATCH}
  `

  // A full ELIGIBLE batch ⇒ needsRescan: more eligible leads may sit past the cap.
  return { full: rows.length >= LEAD_ANONYMISE_BATCH, sideEffects: { rows, dbNow } }
}

/**
 * Anonymise ONE lead atomically (the Phase-B row unit). One short bounded
 * interactive transaction:
 *
 *   (1) CAS: conditionally null the three contact fields + nextAction + stamp
 *       anonymisedAt = dbNow WHERE the row still EXACTLY matches the Phase-A
 *       snapshot: id,
 *       anonymisedAt still null, convertedMerchantId still null, lastActivityAt
 *       unchanged, stage unchanged. Any interleaved touch (re-arms the clock),
 *       convert (becomes exempt), or a sibling anonymise makes the CAS match 0
 *       rows: a SAFE SKIP (no write, not a failure).
 *   (2) Only the CAS winner writes the LEAD_ANONYMISED audit row: inside the
 *       SAME transaction, so audit + stamp commit or roll back together. The
 *       metadata carries ONLY the trigger classification; the nulled contact
 *       VALUES are never snapshotted (audit rows must stay PII-free).
 *
 * Returns true if this call anonymised the row, false on CAS loss.
 */
export async function anonymiseOneLead(
  prisma: PrismaClient,
  row: AnonymiseLeadRow,
  dbNow: Date,
  bounds: LeadAnonymiseTxBounds,
): Promise<boolean> {
  return prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      // Bound each statement server-side, PARAMETERIZED (bound value, never
      // interpolation).
      await tx.$queryRaw`SELECT set_config('statement_timeout', ${String(bounds.statementTimeoutMs)}, true)`

      // (1) CAS against the EXACT Phase-A snapshot: a touched lead (lastActivityAt
      // moved) or a converted lead (convertedMerchantId set) matches 0 rows.
      const won = await tx.merchantLead.updateMany({
        where: {
          id: row.id,
          anonymisedAt: null,
          convertedMerchantId: null,
          lastActivityAt: row.lastActivityAt,
          stage: row.stage as Prisma.MerchantLeadWhereInput['stage'],
        },
        // Null the three contact fields AND nextAction (free text, a PII vector
        // that is useless post-anonymisation). lostReason is DELIBERATELY RETAINED
        // (OD1 keeps the Lost outcome for recruitment analytics); operator guidance
        // to keep personal data out of Lost reasons is an owner-queue item, not a
        // code control here.
        data: { contactName: null, contactEmail: null, contactPhone: null, nextAction: null, anonymisedAt: dbNow },
      })
      if (won.count === 0) return false // touched / converted / already anonymised: safe skip

      // (2) The winner writes the PII-FREE audit row in the SAME transaction. No
      // contact value is recorded: only the trigger. actorType SYSTEM (the
      // scheduled job has no admin actor); actorId 'system'.
      await writeAuditLogTx(tx, {
        entityId: row.id,
        entityType: 'lead',
        event: 'LEAD_ANONYMISED',
        actorId: 'system',
        actorType: 'SYSTEM',
        metadata: { trigger: leadAnonymiseTrigger(row) },
        ipAddress: '',
        userAgent: '',
      })
      return true
    },
    { timeout: bounds.txTimeoutMs, maxWait: bounds.txTimeoutMs },
  )
}

/**
 * Phase B (unlocked, idempotent, cooperatively budgeted): each eligible lead is
 * ONE atomic anonymiseOneLead transaction. runBudgetedRows checks the
 * cooperative stop predicate BEFORE each row; a started row commits or rolls
 * back as one awaited op. A per-row transaction FAILURE is reported via
 * failedRows -> the sweep is classified FAILURE and backs off on its OWN
 * degraded cadence; the un-anonymised row stays eligible and replays after
 * recovery with no double-write (the stamp and audit are atomic). A CAS loss is
 * a clean skip: neither a write nor a failure.
 */
export function makeLeadAnonymiseSideEffects(
  prisma: PrismaClient,
  bounds: LeadAnonymiseTxBounds,
): (side: LeadAnonymiseSide, budget: PhaseBBudget) => Promise<PhaseBOutcome> {
  return (side, budget) =>
    runBudgetedRows(side.rows, budget, (row) => anonymiseOneLead(prisma, row, side.dbNow, bounds))
}

/** Build the lead-anonymise BoundedSweepSpec from the validated maintenance config. */
export function buildLeadAnonymiseSweep(
  prisma: PrismaClient,
  cfg: MaintenanceConfig & { mode: 'enabled' },
): BoundedSweepSpec<LeadAnonymiseSide> {
  return {
    name: LEAD_ANONYMISE_SWEEP_NAME,
    lockKey: LEAD_ANONYMISE_SWEEP_LOCK_KEY,
    // Phase B here is DATABASE work (the atomic CAS + audit transaction), so N
    // failed rows classify as a database-domain failure and the alert layer
    // stays log-only (writing a Notification would hit the down DB).
    sideEffectDomain: 'DATABASE',
    statementTimeoutMs: cfg.statementTimeoutMs,
    txTimeoutMs: cfg.txTimeoutMs,
    phaseBMaxItems: cfg.phaseBMaxItems,
    phaseBBudgetMs: cfg.phaseBBudgetMs,
    dbPhase: leadAnonymiseDbPhase,
    runSideEffects: makeLeadAnonymiseSideEffects(prisma, {
      statementTimeoutMs: cfg.statementTimeoutMs,
      txTimeoutMs: cfg.txTimeoutMs,
    }),
  }
}
