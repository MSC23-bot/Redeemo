// Per-voucher analytics (Slice E). A READ-ONLY aggregation over VoucherRedemption
// scoped to a single voucher, surfaced on the existing custom voucher detail page.
// NO schema change: every figure is a scoped aggregation over columns that already
// exist (voucherId, branchId, userId, redeemedAt, isValidated, estimatedSaving).
//
// This deliberately reuses the Insights machinery so the merchant sees ONE coherent,
// clean, privacy-disciplined set of numbers wherever they look:
//   - buildEligibilityWhereSql: the SINGLE canonical "eligible logged activity" rule
//     (isTestData on redemption + branch + merchant, DELETED users, QA emails, the
//     branch-scope intersection, the demo carve-out). We NEVER hand-roll cleanliness.
//   - londonTs / daypartCaseSql: Europe/London bucketing via the same session-TZ-
//     independent double conversion + the same daypart source of truth (DAYPARTS).
//   - intensityBand + busyPeakMinCount: the when-used slots are ORDINAL intensity
//     bands relative to the peak, and the "busiest" location surfaces ONLY above the
//     server-owned D6 threshold. This is the EXACT busy-times re-identification cut,
//     never a looser per-slot percentage, so a quiet slot can never be traced to a
//     single customer.
//
// CROSS-MERCHANT ISOLATION: resolveMerchantContext resolves the merchant from the
// SESSION (never a client value + hard-blocks SUSPENDED); the voucher is then verified
// to belong to that merchant (VOUCHER_NOT_FOUND otherwise), and every aggregate carries
// the tenant boundary (branch.merchantId = ctx.merchantId) inside buildEligibilityWhereSql.
// A scoped BRANCH_MANAGER additionally only ever sees their own branches' activity
// (insightsScope + the fail-closed branch-scope clause), same as Insights.

import { Prisma, type PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { resolveMerchantContext } from '../shared'
import {
  buildEligibilityWhereSql,
  ELIGIBILITY_ALIASES,
  type InsightsBranchScope,
} from '../insights/eligibility'
import { insightsScope } from '../insights/scope'
import { demoIncludeMerchantId } from '../insights/demo'
import { busyPeakMinCount } from '../insights/gate'
import {
  num,
  londonTs,
  daypartCaseSql,
  intensityBand,
  monthLabel,
} from '../insights/service'
import { DAYPART_LABELS } from '../insights/london'

// 7 London days Mon=0..Sun=6 (the busy-times grid row order); 6 dayparts (Overnight..Late).
const DOW_COUNT = 7
const DAYPART_COUNT = DAYPART_LABELS.length // 6

// --- Response shape ----------------------------------------------------------

export type VoucherWhenSlot = { index: number; intensity: number }

export type VoucherAnalyticsResult = {
  voucherId: string
  totals: {
    /** Logged redemptions (every eligible VoucherRedemption for this voucher). */
    logged: number
    /** The isValidated=true subset (confirmed in person by staff). */
    confirmed: number
    /** confirmed / logged as a percentage 0..100, 0-safe, 1dp. */
    confirmedInPersonPct: number
    /** Distinct customers (COUNT DISTINCT userId). */
    distinctCustomers: number
    /** SUM(estimatedSaving) over logged / confirmed. Decimal coerced to Number. */
    estimatedSavingLogged: number
    estimatedSavingConfirmed: number
  }
  lifecycle: {
    /** ISO instant the voucher went live (approvedAt) or was submitted (publishedAt); null for a never-live draft. */
    liveSince: string | null
    /** Which column liveSince came from, surfaced honestly (see the days-live note below). */
    liveSinceSource: 'approvedAt' | 'publishedAt' | null
    /** Whole days from liveSince to now; null when liveSince is null. */
    daysLive: number | null
  }
  /** Monthly series bucketed by redeemedAt in Europe/London, ascending. */
  trend: { months: Array<{ monthStartLondon: string; logged: number; confirmed: number }> }
  /**
   * When it is used. Ordinal intensity bands (0..3) ONLY, mirroring busy-times: raw
   * per-slot counts NEVER leave the service. `busiestDay` / `busiestDaypart` are peak
   * LOCATIONS surfaced only when the peak count clears the server-owned D6 threshold
   * (null otherwise, the pre-D6 safe fallback).
   */
  whenUsed: {
    days: VoucherWhenSlot[] // length 7, Mon=0..Sun=6
    dayparts: VoucherWhenSlot[] // length 6, Overnight..Late
    busiestDay: number | null
    busiestDaypart: number | null
  }
  /**
   * Where it is used. Per-branch logged count + share. Raw branch counts are
   * consistent with the Insights per-branch ranking (getBranches), which already
   * surfaces raw per-branch logged totals; these are NOT time-resolved so they do
   * not carry the busy-times re-identification risk. Scoped: a BRANCH_MANAGER only
   * ever sees their own branches.
   */
  whereUsed: {
    branches: Array<{ branchId: string; name: string; logged: number; sharePct: number }>
  }
}

// --- Internal: eligible FROM for a single voucher (no period window) ----------

/**
 * The FROM/JOIN + eligible WHERE for THIS voucher's redemptions, all-time (no period
 * window; per-voucher analytics is lifetime, matching the prototype tiles). The
 * voucherId is a PARAMETER. Composes the canonical eligibility fragment so cleanliness
 * + tenant boundary + branch scope + demo carve-out are all applied identically to
 * Insights.
 */
function eligibleVoucherFrom(
  merchantId: string,
  scope: InsightsBranchScope,
  voucherId: string,
  includeTestDataForMerchantId?: string,
): Prisma.Sql {
  const eligibility = buildEligibilityWhereSql({ merchantId, branchScope: scope, includeTestDataForMerchantId })
  const r = ELIGIBILITY_ALIASES.redemption
  return Prisma.sql`
    FROM "VoucherRedemption" r
    JOIN "Branch"   b ON r."branchId"  = b.id
    JOIN "Merchant" m ON b."merchantId" = m.id
    JOIN "User"     u ON r."userId"    = u.id
    WHERE ${eligibility}
      AND ${Prisma.raw(`${r}."voucherId"`)} = ${voucherId}
  `
}

// --- Pure shapers (unit-tested; no DB) ---------------------------------------

/**
 * Map a dense array of raw slot counts to ordinal intensity bands (0..3) relative to
 * the peak, plus the peak location gated by the server-owned D6 minimum. This is the
 * SAME cut as getBusyTimes: bands via intensityBand (raw counts never surfaced), and
 * the peak index is returned ONLY when the peak count clears busyPeakMinCount() (null
 * when no D6 threshold is recorded, the pre-D6 safe fallback).
 */
export function bandSlots(counts: number[]): { slots: VoucherWhenSlot[]; busiestIndex: number | null } {
  let peakCount = 0
  let peakIndex: number | null = null
  for (let i = 0; i < counts.length; i++) {
    const c = counts[i]
    if (c > peakCount) {
      peakCount = c
      peakIndex = i
    }
  }
  const slots = counts.map((c, index) => ({ index, intensity: intensityBand(c, peakCount) }))
  const minPeak = busyPeakMinCount()
  const busiestIndex = minPeak !== null && peakIndex !== null && peakCount >= minPeak ? peakIndex : null
  return { slots, busiestIndex }
}

/** Whole days from an ISO instant to `now`, clamped at >= 0. Pure + testable. */
export function computeDaysLive(liveSince: Date | null, now: Date): number | null {
  if (!liveSince) return null
  const ms = now.getTime() - liveSince.getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

/**
 * Resolve the "went live" instant + its source. `approvedAt` (the moment the admin
 * approved -> the voucher can go ACTIVE/live to customers) is the truest live marker;
 * `publishedAt` (set at submit) is the fallback; a never-submitted DRAFT has neither.
 *
 * AMBIGUITY FLAGGED FOR REVIEW: there is no single dedicated "went live" timestamp on
 * Voucher. approvedAt is the closest honest marker; if it is null we fall back to
 * publishedAt (submitted-for-review, not strictly "live"), and to null for a pure
 * draft (daysLive null -> the UI shows "Not live yet" rather than an invented number).
 * We deliberately do NOT use createdAt (a draft's creation is not a live date).
 */
export function resolveLiveSince(voucher: {
  approvedAt: Date | null
  publishedAt: Date | null
}): { liveSince: Date | null; source: 'approvedAt' | 'publishedAt' | null } {
  if (voucher.approvedAt) return { liveSince: voucher.approvedAt, source: 'approvedAt' }
  if (voucher.publishedAt) return { liveSince: voucher.publishedAt, source: 'publishedAt' }
  return { liveSince: null, source: null }
}

// --- Entry point -------------------------------------------------------------

export async function getVoucherAnalytics(
  prisma: PrismaClient,
  adminId: string,
  voucherId: string,
  opts: { now?: Date } = {},
): Promise<VoucherAnalyticsResult> {
  const now = opts.now ?? new Date()

  // 1. Resolve the caller's merchant from the SESSION (blocks SUSPENDED). Any active
  //    member may read a voucher (MEMBER-READ, mirrors getVoucher); a scoped
  //    BRANCH_MANAGER's analytics are limited to their branches by insightsScope below.
  const ctx = await resolveMerchantContext(prisma, adminId)

  // 2. Cross-merchant isolation: the voucher MUST belong to this merchant. A missing /
  //    cross-tenant voucher is VOUCHER_NOT_FOUND (never a cross-merchant read, never an
  //    existence oracle for a sibling merchant's voucher).
  const voucher = await prisma.voucher.findFirst({
    where: { id: voucherId, merchantId: ctx.merchantId },
    select: { id: true, approvedAt: true, publishedAt: true },
  })
  if (!voucher) throw new AppError('VOUCHER_NOT_FOUND')

  const scope = insightsScope(ctx)
  const demoId = demoIncludeMerchantId(ctx.merchantId)
  const from = eligibleVoucherFrom(ctx.merchantId, scope, voucherId, demoId)

  // 3. Totals: logged / confirmed / distinct customers / saving. One scan.
  const totalsRows = await prisma.$queryRaw<
    Array<{ logged: bigint; confirmed: bigint; distinct: bigint; est_logged: Prisma.Decimal | null; est_confirmed: Prisma.Decimal | null }>
  >(Prisma.sql`
    SELECT
      COUNT(*)::bigint AS logged,
      COUNT(*) FILTER (WHERE r."isValidated" = true)::bigint AS confirmed,
      COUNT(DISTINCT r."userId")::bigint AS distinct,
      COALESCE(SUM(r."estimatedSaving"), 0) AS est_logged,
      COALESCE(SUM(r."estimatedSaving") FILTER (WHERE r."isValidated" = true), 0) AS est_confirmed
    ${from}
  `)
  const t = totalsRows[0] ?? { logged: 0n, confirmed: 0n, distinct: 0n, est_logged: null, est_confirmed: null }
  const logged = num(t.logged)
  const confirmed = num(t.confirmed)

  // 4. Trend: monthly logged + confirmed bucketed by redeemedAt in Europe/London.
  const trendRows = await prisma.$queryRaw<Array<{ bucket: Date; logged: bigint; confirmed: bigint }>>(Prisma.sql`
    SELECT
      DATE_TRUNC('month', ${londonTs()}) AS bucket,
      COUNT(*)::bigint AS logged,
      COUNT(*) FILTER (WHERE r."isValidated" = true)::bigint AS confirmed
    ${from}
    GROUP BY bucket
    ORDER BY bucket ASC
  `)

  // 5. When-used: raw counts per London day-of-week + per daypart (raw stays INTERNAL).
  const dayRows = await prisma.$queryRaw<Array<{ day: number; cnt: bigint }>>(Prisma.sql`
    SELECT (EXTRACT(ISODOW FROM ${londonTs()})::int - 1) AS day, COUNT(*)::bigint AS cnt
    ${from}
    GROUP BY day
  `)
  const daypartRows = await prisma.$queryRaw<Array<{ daypart: number; cnt: bigint }>>(Prisma.sql`
    SELECT ${daypartCaseSql(Prisma.sql`EXTRACT(HOUR FROM ${londonTs()})::int`)} AS daypart, COUNT(*)::bigint AS cnt
    ${from}
    GROUP BY daypart
  `)

  // 6. Where-used: per-branch logged count + name (raw counts, mirrors getBranches).
  const branchRows = await prisma.$queryRaw<Array<{ branch_id: string; name: string; logged: bigint }>>(Prisma.sql`
    SELECT b.id AS branch_id, b.name AS name, COUNT(*)::bigint AS logged
    ${from}
    GROUP BY b.id, b.name
    ORDER BY logged DESC, b.id ASC
  `)

  // --- Shape (raw counts -> bands here; nothing raw/time-resolved leaves) ------

  const dayCounts = new Array<number>(DOW_COUNT).fill(0)
  for (const row of dayRows) {
    const d = Number(row.day)
    if (d >= 0 && d < DOW_COUNT) dayCounts[d] = num(row.cnt)
  }
  const daypartCounts = new Array<number>(DAYPART_COUNT).fill(0)
  for (const row of daypartRows) {
    const p = Number(row.daypart)
    if (p >= 0 && p < DAYPART_COUNT) daypartCounts[p] = num(row.cnt)
  }
  const days = bandSlots(dayCounts)
  const dayparts = bandSlots(daypartCounts)

  const totalBranchLogged = branchRows.reduce((s, r) => s + num(r.logged), 0)
  const branches = branchRows.map((row) => {
    const n = num(row.logged)
    return {
      branchId: row.branch_id,
      name: row.name,
      logged: n,
      sharePct: totalBranchLogged === 0 ? 0 : Math.round((n / totalBranchLogged) * 1000) / 10,
    }
  })

  const { liveSince, source } = resolveLiveSince(voucher)

  return {
    voucherId: voucher.id,
    totals: {
      logged,
      confirmed,
      confirmedInPersonPct: logged === 0 ? 0 : Math.round((confirmed / logged) * 1000) / 10,
      distinctCustomers: num(t.distinct),
      estimatedSavingLogged: num(t.est_logged),
      estimatedSavingConfirmed: num(t.est_confirmed),
    },
    lifecycle: {
      liveSince: liveSince ? liveSince.toISOString() : null,
      liveSinceSource: source,
      daysLive: computeDaysLive(liveSince, now),
    },
    trend: {
      months: trendRows.map((row) => ({
        monthStartLondon: monthLabel(row.bucket),
        logged: num(row.logged),
        confirmed: num(row.confirmed),
      })),
    },
    whenUsed: {
      days: days.slots,
      dayparts: dayparts.slots,
      busiestDay: days.busiestIndex,
      busiestDaypart: dayparts.busiestIndex,
    },
    whereUsed: { branches },
  }
}
