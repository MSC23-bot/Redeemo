// Insights PR-A Task A4: the shared aggregation service (spec 4.1/4.2/5.x/15).
//
// The SINGLE place the canonical "eligible logged activity" rule (eligibility.ts)
// is composed into real queries, so every Insights figure reconciles to one
// source (spec 5.6). Every function:
//   - queries the eligible dataset via Prisma tagged-template `$queryRaw`
//     (true parameterisation for client-influenced values: the merchant id, the
//     branch-id list, the date window, the voucher-type set). NEVER
//     `$queryRawUnsafe`. Table/column identifiers + the daypart/dow bucketing
//     expressions are compile-time constants embedded via the eligibility helper
//     or literal SQL.
//   - joins VoucherRedemption r -> Branch b -> Merchant m -> User u so the
//     eligibility WHERE can reference all four (the redemption has no merchantId).
//   - buckets by `redeemedAt` (NOT validatedAt) in Europe/London (spec 4.3).
//   - discriminates Confirmed strictly by `isValidated = true` (spec 4.3).
//   - coerces Prisma Decimal -> Number() in the mapper.
//
// COUNTING MODEL (spec 4.2): logged = COUNT(eligible); confirmed = the subset
// with isValidated=true; awaiting = logged - confirmed. Invariant
// `confirmed + awaiting === logged` for every cut. Savings mirror the same split
// over SUM(estimatedSaving).
//
// PRIVACY: getBusyTimes is privacy-mode-aware (spec 1.7/2.7). The DEFAULT payload
// is `mode:'intensity'`: ordinal bands only, NO raw count and NO raw peak value.
// `busiest` is a location only (day+daypart, never a count) and is null when the
// peak could be near-empty (conservative). Exact counts are reserved for an
// approved PR-0a D6 policy and are OUT OF SCOPE here.

import { Prisma, type PrismaClient } from '../../../../generated/prisma/client'
import type { MerchantContext } from '../shared'
import {
  buildEligibilityWhereSql,
  ELIGIBILITY_ALIASES,
  type InsightsBranchScope,
} from './eligibility'
import { insightsScope } from './scope'
import { demoIncludeMerchantId } from './demo'
import { behaviouralGateOpen, busyPeakMinCount, repeatRateMinCohort } from './gate'
import {
  periodWindow,
  resolveComparisonWindow,
  DAYPARTS,
  DAYPART_LABELS,
  type PeriodPreset,
  type CustomRange,
} from './london'

// --- Filters ----------------------------------------------------------------

/**
 * The seven merchant-facing voucher types. `DISCOUNT` collapses the two DB
 * discount enum values; every other label maps 1:1 to a DB `VoucherType`.
 */
export type MerchantVoucherType =
  | 'BOGO'
  | 'SPEND_AND_SAVE'
  | 'DISCOUNT'
  | 'FREEBIE'
  | 'PACKAGE_DEAL'
  | 'TIME_LIMITED'
  | 'REUSABLE'

/**
 * The DB `VoucherType` enum values. The service maps a merchant-facing
 * `voucherType` filter to one-or-more of these for the WHERE clause, and maps
 * a DB value back to a 7-type label for the by-type share.
 */
const TYPE7_TO_DB: Record<MerchantVoucherType, string[]> = {
  BOGO: ['BOGO'],
  SPEND_AND_SAVE: ['SPEND_AND_SAVE'],
  DISCOUNT: ['DISCOUNT_FIXED', 'DISCOUNT_PERCENT'],
  FREEBIE: ['FREEBIE'],
  PACKAGE_DEAL: ['PACKAGE_DEAL'],
  TIME_LIMITED: ['TIME_LIMITED'],
  REUSABLE: ['REUSABLE'],
}

/** Map a DB VoucherType value to its 7-type merchant-facing label. */
export function dbTypeToType7(dbType: string): MerchantVoucherType {
  if (dbType === 'DISCOUNT_FIXED' || dbType === 'DISCOUNT_PERCENT') return 'DISCOUNT'
  return dbType as MerchantVoucherType
}

export type InsightsFilters = {
  period: PeriodPreset
  custom?: CustomRange
  /** A single client-supplied branchId, intersected with the ctx scope below. */
  branchId?: string
  /** A 7-type merchant-facing voucher filter. DISCOUNT -> the two DB values. */
  voucherType?: MerchantVoucherType
  /** Injected for deterministic windows (no internal Date.now()). */
  now?: Date
}

// --- Internal: resolve the effective branch scope + the window SQL -----------

/**
 * Intersect the ctx branch scope (null = all merchant branches, [] = none,
 * [ids] = those) with an optional client-supplied `branchId`. A cross-tenant or
 * out-of-scope branchId resolves to an empty set (no rows) rather than leaking
 * a sibling branch - mirrors the redemptions where-builder intersection.
 */
function effectiveScope(ctx: MerchantContext, branchId?: string): InsightsBranchScope {
  const ctxScope = insightsScope(ctx)
  if (!branchId) return ctxScope
  if (ctxScope === null) return [branchId] // owner / all-branches: honour the single filter
  return ctxScope.includes(branchId) ? [branchId] : []
}

/**
 * The half-open `redeemedAt` window SQL for a given [startUtc, endUtc) pair under
 * the redemption alias. `startUtc === null` ('all') omits the lower bound. Dates
 * are PARAMETERS (client-influenced).
 */
function windowSql(
  startUtc: Date | null,
  endUtc: Date,
  redemptionAlias: string = ELIGIBILITY_ALIASES.redemption,
): Prisma.Sql {
  const col = Prisma.raw(`${redemptionAlias}."redeemedAt"`)
  if (startUtc === null) return Prisma.sql`${col} < ${endUtc}`
  return Prisma.sql`${col} >= ${startUtc} AND ${col} < ${endUtc}`
}

/**
 * The voucher-type filter SQL (joined voucher row carries the DB type). A 7-type
 * label expands to its DB value set as PARAMETERS. No filter -> Prisma.empty.
 * The DB type column lives on the joined Voucher; the service joins Voucher as
 * `v` when this filter (or the by-type aggregation) is needed.
 */
function voucherTypeSql(voucherType: MerchantVoucherType | undefined): Prisma.Sql {
  if (!voucherType) return Prisma.empty
  const dbTypes = TYPE7_TO_DB[voucherType]
  return Prisma.sql`AND v."type" IN (${Prisma.join(dbTypes)})`
}

/**
 * Compose the FROM/JOIN + WHERE for the eligible dataset, plus the window + the
 * optional voucher-type filter. Returns the SQL fragment that starts at `FROM`
 * so callers prepend their SELECT and append GROUP BY/ORDER BY as needed.
 *
 * The Voucher join (`v`) is ALWAYS present so every query can filter/aggregate
 * on voucher type uniformly. The eligibility WHERE references r/b/m/u; the window
 * + type clauses reference r and v.
 *
 * `includeTestDataForMerchantId` is the server-owned demo carve-out (Task A10):
 * resolved by demoIncludeMerchantId(ctx.merchantId) at each entry point and threaded
 * through here so the dedicated demo merchant surfaces its isTestData=true demo
 * dataset. It is undefined in production and on every non-staging deploy
 * (demoIncludeMerchantId's hard staging-identity gate: REDEEMO_DEPLOY_ENV must equal
 * 'staging' exactly; NODE_ENV is NOT consulted because Railway staging runs
 * NODE_ENV=production), and undefined for every non-allowlisted merchant, so the
 * cleanliness rule is unchanged on every real read path.
 */
function eligibleFrom(
  merchantId: string,
  scope: InsightsBranchScope,
  startUtc: Date | null,
  endUtc: Date,
  voucherType: MerchantVoucherType | undefined,
  includeTestDataForMerchantId?: string,
): Prisma.Sql {
  const eligibility = buildEligibilityWhereSql({ merchantId, branchScope: scope, includeTestDataForMerchantId })
  return Prisma.sql`
    FROM "VoucherRedemption" r
    JOIN "Branch"   b ON r."branchId"  = b.id
    JOIN "Merchant" m ON b."merchantId" = m.id
    JOIN "User"     u ON r."userId"    = u.id
    JOIN "Voucher"  v ON r."voucherId" = v.id
    WHERE ${eligibility}
      AND ${windowSql(startUtc, endUtc)}
      ${voucherTypeSql(voucherType)}
  `
}

// --- Shared row coercion -----------------------------------------------------

// Exported so the per-voucher analytics service (voucher/analytics.ts) coerces
// bigint/Decimal/number identically, sharing ONE coercion rule (no drift).
export function num(v: unknown): number {
  // bigint (COUNT), Prisma.Decimal (SUM), or number: coerce uniformly.
  return v == null ? 0 : Number(v)
}

// The `redeemedAt` column is `timestamp WITHOUT time zone` and Prisma persists JS
// Dates into it as their UTC wall-clock value. So the stored value is a NAIVE
// timestamp that means UTC. To bucket in Europe/London we must FIRST reinterpret
// it as UTC (`AT TIME ZONE 'UTC'` -> a timestamptz instant), THEN convert that
// instant to London wall-clock (`AT TIME ZONE 'Europe/London'` -> a naive
// timestamp in London local time). A single `AT TIME ZONE 'Europe/London'` would
// (a) wrongly treat the stored value AS London time and (b) depend on the session
// timezone. This double conversion is session-TZ-independent and DST-correct.
//
// `redemptionAlias` is a SQL identifier (not user input), embedded via Prisma.raw.
// Exported so per-voucher analytics buckets `redeemedAt` in Europe/London through
// the SAME session-TZ-independent double conversion (no drift from Insights).
export function londonTs(redemptionAlias: string = ELIGIBILITY_ALIASES.redemption): Prisma.Sql {
  const col = Prisma.raw(`${redemptionAlias}."redeemedAt"`)
  return Prisma.sql`(${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/London'`
}

// --- Comparison ---------------------------------------------------------------

export type Comparison = {
  cur: number
  prev: number
  /** Percentage change cur vs prev (rounded to 1dp); null when prev === 0. */
  pct: number | null
  label: PeriodPreset
} | null

function buildComparison(cur: number, prev: number, label: PeriodPreset): Comparison {
  const pct = prev === 0 ? null : Math.round(((cur - prev) / prev) * 1000) / 10
  return { cur, prev, pct, label }
}

// --- Overview ----------------------------------------------------------------

export type OverviewResult = {
  redemptionActivity: { logged: number; confirmed: number; awaiting: number; comparison: Comparison }
  distinctCustomers: { logged: number; comparison: Comparison }
  savings: {
    estimatedLogged: number
    estimatedConfirmed: number
    awaiting: number
    comparison: Comparison
  }
  meta: {
    scopeLabel: string
    earliestDate: string | null
    filtersEcho: {
      period: PeriodPreset
      branchId: string | null
      voucherType: MerchantVoucherType | null
      from: string | null
      to: string | null
    }
  }
}

/**
 * The OPERATIONAL overview block (plan 2.7). repeatRate is BEHAVIOURAL and is NOT
 * computed here (A5/gated). Each operational KPI carries its OWN comparison over
 * the completed-period comparison window; comparison is null when the period is
 * incomplete (resolveComparisonWindow returns null).
 */
export async function getOverview(
  prisma: PrismaClient,
  ctx: MerchantContext,
  filters: InsightsFilters,
): Promise<OverviewResult> {
  const now = filters.now ?? new Date()
  const win = periodWindow(filters.period, now, filters.custom)
  const scope = effectiveScope(ctx, filters.branchId)
  // Server-owned demo carve-out (undefined in production + for non-allowlisted merchants).
  const demoId = demoIncludeMerchantId(ctx.merchantId)

  const mainRows = await prisma.$queryRaw<
    Array<{ logged: bigint; confirmed: bigint; distinct: bigint; est_logged: Prisma.Decimal | null; est_confirmed: Prisma.Decimal | null }>
  >(Prisma.sql`
    SELECT
      COUNT(*)::bigint AS logged,
      COUNT(*) FILTER (WHERE r."isValidated" = true)::bigint AS confirmed,
      COUNT(DISTINCT r."userId")::bigint AS distinct,
      COALESCE(SUM(r."estimatedSaving"), 0) AS est_logged,
      COALESCE(SUM(r."estimatedSaving") FILTER (WHERE r."isValidated" = true), 0) AS est_confirmed
    ${eligibleFrom(ctx.merchantId, scope, win.startUtc, win.endUtc, filters.voucherType, demoId)}
  `)

  const main = mainRows[0] ?? { logged: 0n, confirmed: 0n, distinct: 0n, est_logged: null, est_confirmed: null }
  const logged = num(main.logged)
  const confirmed = num(main.confirmed)
  const distinct = num(main.distinct)
  const estLogged = num(main.est_logged)
  const estConfirmed = num(main.est_confirmed)

  // Per-KPI comparison over the completed-period comparison window (null when incomplete).
  const cmpWin = resolveComparisonWindow(filters.period, now, filters.custom)
  let activityCmp: Comparison = null
  let distinctCmp: Comparison = null
  let savingsCmp: Comparison = null
  if (cmpWin) {
    const prevRows = await prisma.$queryRaw<
      Array<{ logged: bigint; distinct: bigint; est_logged: Prisma.Decimal | null }>
    >(Prisma.sql`
      SELECT
        COUNT(*)::bigint AS logged,
        COUNT(DISTINCT r."userId")::bigint AS distinct,
        COALESCE(SUM(r."estimatedSaving"), 0) AS est_logged
      ${eligibleFrom(ctx.merchantId, scope, cmpWin.startUtc, cmpWin.endUtc, filters.voucherType, demoId)}
    `)
    const prev = prevRows[0] ?? { logged: 0n, distinct: 0n, est_logged: null }
    activityCmp = buildComparison(logged, num(prev.logged), filters.period)
    distinctCmp = buildComparison(distinct, num(prev.distinct), filters.period)
    savingsCmp = buildComparison(estLogged, num(prev.est_logged), filters.period)
  }

  // Earliest eligible redemption (over the full scope + the active voucher-type
  // filter, but IGNORING the period window): drives the All-time disclosure (spec
  // 1.10). Open-ended all-history: NO period window so the earliest is over ALL
  // history, additionally narrowed by the selected voucher type + scope +
  // cleanliness so it reconciles with the rest of the overview block (it is the
  // earliest of the SAME dataset the figures count, not a wider one). The Voucher
  // join (v) + voucherTypeSql mirror eligibleFrom; the QA/DELETED/test exclusions
  // + the branch-scope intersection come from buildEligibilityWhereSql.
  const earliestRows = await prisma.$queryRaw<Array<{ earliest: Date | null }>>(Prisma.sql`
    SELECT MIN(r."redeemedAt") AS earliest
    FROM "VoucherRedemption" r
    JOIN "Branch"   b ON r."branchId"  = b.id
    JOIN "Merchant" m ON b."merchantId" = m.id
    JOIN "User"     u ON r."userId"    = u.id
    JOIN "Voucher"  v ON r."voucherId" = v.id
    WHERE ${buildEligibilityWhereSql({ merchantId: ctx.merchantId, branchScope: scope, includeTestDataForMerchantId: demoId })}
      ${voucherTypeSql(filters.voucherType)}
  `)
  const earliest = earliestRows[0]?.earliest ?? null

  return {
    redemptionActivity: { logged, confirmed, awaiting: logged - confirmed, comparison: activityCmp },
    distinctCustomers: { logged: distinct, comparison: distinctCmp },
    savings: {
      estimatedLogged: estLogged,
      estimatedConfirmed: estConfirmed,
      awaiting: Math.round((estLogged - estConfirmed) * 100) / 100,
      comparison: savingsCmp,
    },
    meta: {
      scopeLabel: scopeLabel(ctx, filters.branchId),
      earliestDate: earliest ? earliest.toISOString() : null,
      filtersEcho: {
        period: filters.period,
        branchId: filters.branchId ?? null,
        voucherType: filters.voucherType ?? null,
        from: filters.custom?.from ?? null,
        to: filters.custom?.to ?? null,
      },
    },
  }
}

/**
 * A coarse, NON-leaking, ROLE-AWARE scope label (spec 1.9 / 7; plan 2.4). Never
 * enumerates sibling branch names here; the route layer resolves a human branch
 * name when a single branch is in view. This default is the machine-friendly
 * fallback.
 *
 * The label keys on `ctx.role`, NOT the scope SHAPE, so the owner-only
 * "All branches" label is never shown to a BRANCH_MANAGER (an all-branches
 * manager legitimately sees every branch but keeps the manager "All my branches"
 * label - spec §2.4 + line 276/285). The data scope is unchanged; this is a UI
 * label distinction only.
 *
 * Resolution:
 *   - a selected `branchId` (a single in-scope branch in view) -> "Viewing: selected branch"
 *   - a scoped BM with EXACTLY ONE allowed branch (and no explicit branchId) -> the same single-branch label
 *   - OWNER over all branches -> "All branches"
 *   - BRANCH_MANAGER over all/multiple branches -> "All my branches"
 */
export function scopeLabel(ctx: MerchantContext, branchId?: string): string {
  // A single branch is in view (explicit filter, or a scoped BM whose entire
  // authorised set is exactly one branch).
  if (branchId) return 'Viewing: selected branch'
  const scope = insightsScope(ctx)
  if (scope && scope.length === 1) return 'Viewing: selected branch'

  // Multiple / all branches: the label is decided by ROLE, never the scope shape.
  // Only an OWNER ever sees the merchant-wide "All branches" label; a
  // BRANCH_MANAGER (even all-branches) keeps "All my branches".
  return ctx.role === 'OWNER' ? 'All branches' : 'All my branches'
}

// --- Trend -------------------------------------------------------------------

export type TrendResult = {
  months: Array<{ monthStartLondon: string; logged: number; confirmed: number }>
}

/**
 * Monthly series bucketed by `redeemedAt` in Europe/London (spec 15.2). Both
 * logged + confirmed bucket by redeemedAt; confirmed = that month's rows with
 * isValidated=true. `awaiting` is derived client-side. `monthStartLondon` is the
 * London month-start label as `YYYY-MM-01`.
 */
export async function getTrend(
  prisma: PrismaClient,
  ctx: MerchantContext,
  filters: InsightsFilters,
): Promise<TrendResult> {
  const now = filters.now ?? new Date()
  const win = periodWindow(filters.period, now, filters.custom)
  const scope = effectiveScope(ctx, filters.branchId)
  const demoId = demoIncludeMerchantId(ctx.merchantId)

  const rows = await prisma.$queryRaw<
    Array<{ bucket: Date; logged: bigint; confirmed: bigint }>
  >(Prisma.sql`
    SELECT
      DATE_TRUNC('month', ${londonTs()}) AS bucket,
      COUNT(*)::bigint AS logged,
      COUNT(*) FILTER (WHERE r."isValidated" = true)::bigint AS confirmed
    ${eligibleFrom(ctx.merchantId, scope, win.startUtc, win.endUtc, filters.voucherType, demoId)}
    GROUP BY bucket
    ORDER BY bucket ASC
  `)

  return {
    months: rows.map((row) => ({
      // bucket is a timestamp-without-tz at 00:00 of the London month start.
      monthStartLondon: monthLabel(row.bucket),
      logged: num(row.logged),
      confirmed: num(row.confirmed),
    })),
  }
}

/** Format a DATE_TRUNC month bucket as `YYYY-MM-01`. Exported for per-voucher analytics reuse. */
export function monthLabel(bucket: Date): string {
  // The bucket comes back as a Date; read its UTC year/month (DATE_TRUNC at
  // TIME ZONE yields a wall-clock timestamp the driver surfaces as a Date).
  const y = bucket.getUTCFullYear()
  const mo = String(bucket.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${mo}-01`
}

// --- Vouchers ----------------------------------------------------------------

export type VouchersResult = {
  top: Array<{
    voucherId: string
    title: string
    type7: MerchantVoucherType
    logged: number
    confirmed: number
    estimatedLogged: number
    estimatedConfirmed: number
  }>
  byType: Array<{ type7: MerchantVoucherType; logged: number; sharePct: number }>
}

const VOUCHERS_TOP_TAKE = 20

/**
 * Per-voucher ranking (by logged COUNT) + the 7-type share (logged denominator).
 * DISCOUNT_FIXED/PERCENT collapse to 'DISCOUNT'. Share percentages use the total
 * logged across ALL eligible rows in the window as the denominator (spec 1.16).
 */
export async function getVouchers(
  prisma: PrismaClient,
  ctx: MerchantContext,
  filters: InsightsFilters,
): Promise<VouchersResult> {
  const now = filters.now ?? new Date()
  const win = periodWindow(filters.period, now, filters.custom)
  const scope = effectiveScope(ctx, filters.branchId)
  const demoId = demoIncludeMerchantId(ctx.merchantId)

  const topRows = await prisma.$queryRaw<
    Array<{ voucher_id: string; title: string; db_type: string; logged: bigint; confirmed: bigint; est_logged: Prisma.Decimal | null; est_confirmed: Prisma.Decimal | null }>
  >(Prisma.sql`
    SELECT
      v.id AS voucher_id,
      v.title AS title,
      v."type" AS db_type,
      COUNT(*)::bigint AS logged,
      COUNT(*) FILTER (WHERE r."isValidated" = true)::bigint AS confirmed,
      COALESCE(SUM(r."estimatedSaving"), 0) AS est_logged,
      COALESCE(SUM(r."estimatedSaving") FILTER (WHERE r."isValidated" = true), 0) AS est_confirmed
    ${eligibleFrom(ctx.merchantId, scope, win.startUtc, win.endUtc, filters.voucherType, demoId)}
    GROUP BY v.id, v.title, v."type"
    ORDER BY logged DESC, v.id ASC
    LIMIT ${VOUCHERS_TOP_TAKE}
  `)

  const top = topRows.map((row) => ({
    voucherId: row.voucher_id,
    title: row.title,
    type7: dbTypeToType7(row.db_type),
    logged: num(row.logged),
    confirmed: num(row.confirmed),
    estimatedLogged: num(row.est_logged),
    estimatedConfirmed: num(row.est_confirmed),
  }))

  // By-type share: group the DB type, collapse to type7, share over total logged.
  const typeRows = await prisma.$queryRaw<Array<{ db_type: string; logged: bigint }>>(Prisma.sql`
    SELECT v."type" AS db_type, COUNT(*)::bigint AS logged
    ${eligibleFrom(ctx.merchantId, scope, win.startUtc, win.endUtc, filters.voucherType, demoId)}
    GROUP BY v."type"
  `)

  const byTypeMap = new Map<MerchantVoucherType, number>()
  let totalLogged = 0
  for (const row of typeRows) {
    const t7 = dbTypeToType7(row.db_type)
    const n = num(row.logged)
    byTypeMap.set(t7, (byTypeMap.get(t7) ?? 0) + n)
    totalLogged += n
  }
  const byType = Array.from(byTypeMap.entries())
    .map(([type7, logged]) => ({
      type7,
      logged,
      sharePct: totalLogged === 0 ? 0 : Math.round((logged / totalLogged) * 1000) / 10,
    }))
    .sort((a, b) => b.logged - a.logged || a.type7.localeCompare(b.type7))

  return { top, byType }
}

// --- Branches ----------------------------------------------------------------

export type BranchesResult = {
  rows: Array<{
    branchId: string
    name: string
    logged: number
    confirmed: number
    estimatedLogged: number
    estimatedConfirmed: number
  }>
}

/**
 * Per-branch ranking, SCOPED. A scoped BM never sees sibling branches outside
 * their allowed set (the eligibility branch-scope clause gates the JOIN), and an
 * empty scope yields an empty `rows` (fail-closed). Branches with zero eligible
 * rows in the window do not appear (the inner join filters them).
 */
export async function getBranches(
  prisma: PrismaClient,
  ctx: MerchantContext,
  filters: InsightsFilters,
): Promise<BranchesResult> {
  const now = filters.now ?? new Date()
  const win = periodWindow(filters.period, now, filters.custom)
  const scope = effectiveScope(ctx, filters.branchId)
  const demoId = demoIncludeMerchantId(ctx.merchantId)

  const rows = await prisma.$queryRaw<
    Array<{ branch_id: string; name: string; logged: bigint; confirmed: bigint; est_logged: Prisma.Decimal | null; est_confirmed: Prisma.Decimal | null }>
  >(Prisma.sql`
    SELECT
      b.id AS branch_id,
      b.name AS name,
      COUNT(*)::bigint AS logged,
      COUNT(*) FILTER (WHERE r."isValidated" = true)::bigint AS confirmed,
      COALESCE(SUM(r."estimatedSaving"), 0) AS est_logged,
      COALESCE(SUM(r."estimatedSaving") FILTER (WHERE r."isValidated" = true), 0) AS est_confirmed
    ${eligibleFrom(ctx.merchantId, scope, win.startUtc, win.endUtc, filters.voucherType, demoId)}
    GROUP BY b.id, b.name
    ORDER BY logged DESC, b.id ASC
  `)

  return {
    rows: rows.map((row) => ({
      branchId: row.branch_id,
      name: row.name,
      logged: num(row.logged),
      confirmed: num(row.confirmed),
      estimatedLogged: num(row.est_logged),
      estimatedConfirmed: num(row.est_confirmed),
    })),
  }
}

// --- Busy times (privacy-mode-aware) ----------------------------------------

export type BusyTimesIntensity = {
  mode: 'intensity'
  grid: Array<{ day: number; daypart: number; intensity: number }>
  busiest: { day: number; daypart: number } | null
}

export type BusyTimesUnavailable = { available: false }

export type BusyTimesResult = BusyTimesIntensity | BusyTimesUnavailable

// The six dayparts are index-aligned to DAYPART_LABELS (london.ts). The grid is
// 7 (Mon=0..Sun=6) x 6 (daypart) = 42 cells. We build a full grid (zero band for
// empty cells) so the client renders without re-deriving structure.
const DOW_COUNT = 7
const DAYPART_COUNT = DAYPART_LABELS.length // 6

// The near-empty-peak minimum count is an UNDECIDED PR-0a D6 governance value
// (spec §1.7; plan §3 D6), read from the server-owned, fail-closed config
// `busyPeakMinCount()` (gate.ts). UNSET / non-positive => null => we NEVER name a
// peak (busiest stays null, the pre-D6 safe fallback). A recorded positive integer
// N => busiest is surfaced only when the peak count is >= N. The threshold is
// applied internally before serialisation; raw counts NEVER leave the service.

/**
 * Map a raw cell count to an ordinal intensity band 0..3 RELATIVE to the busiest
 * cell. 0 = no activity; 1..3 are low/mid/high thirds of the non-zero range. This
 * never exposes the raw count: only the band reaches the payload.
 *
 * Exported so per-voucher analytics maps its when-used slots through the EXACT SAME
 * ordinal-band privacy cut (never a looser per-slot percentage). Mirroring this one
 * function keeps the re-identification discipline single-sourced.
 */
export function intensityBand(count: number, peak: number): number {
  if (count <= 0 || peak <= 0) return 0
  const ratio = count / peak
  if (ratio > 2 / 3) return 3
  if (ratio > 1 / 3) return 2
  return 1
}

/**
 * Build the daypart-bucketing SQL CASE from DAYPARTS (london.ts) so the six
 * half-open [start, end) hour bounds have ONE source of truth and the SQL cannot
 * drift from daypartIndexForLondonHour. `hourExpr` is a London hour-of-day (0..23)
 * SQL expression. End-hour bounds + indices are compile-time numbers from DAYPARTS
 * embedded as literals (never user input). Produces, for the locked dayparts:
 * CASE WHEN h < 7 THEN 0 WHEN h < 12 THEN 1 ... WHEN h < 22 THEN 4 ELSE 5 END.
 *
 * Exported so per-voucher analytics buckets its time-of-day slots from the SAME
 * single daypart source of truth (DAYPARTS in london.ts) as Insights busy-times.
 */
export function daypartCaseSql(hourExpr: Prisma.Sql): Prisma.Sql {
  const whens = DAYPARTS.slice(0, -1).map(
    (d, i) => Prisma.sql`WHEN ${hourExpr} < ${Prisma.raw(String(d.endHour))} THEN ${Prisma.raw(String(i))}`,
  )
  return Prisma.sql`CASE ${Prisma.join(whens, ' ')} ELSE ${Prisma.raw(String(DAYPARTS.length - 1))} END`
}

/**
 * Busy-times grid (spec 1.7/2.7). Internally COUNT(*) per (London day-of-week,
 * daypart) cell on `redeemedAt`, then map each cell to an ordinal intensity band
 * and surface ONLY the band (no raw count, no raw peak). `busiest` is the peak
 * cell LOCATION (never a count) and is null when no PR-0a D6 threshold is recorded
 * or the peak is below it.
 *
 * `day` is Mon=0..Sun=6 (the busy-times grid row order, spec 1.7): computed in
 * SQL as `(EXTRACT(ISODOW ...) - 1)` (ISODOW: Mon=1..Sun=7 -> 0..6). `daypart` is
 * 0..5 derived from the London hour-of-day via the six half-open daypart bounds.
 *
 * The happy flow ALWAYS returns the `mode:'intensity'` payload (an all-zero grid is
 * a valid intensity payload). It does NOT swallow unexpected query errors into
 * `{available:false}` - an unexpected failure propagates to the framework error
 * handler (Codex finding #7). The `BusyTimesUnavailable` arm stays in the wire
 * contract (spec §2.7) for forward-compat but is not produced here.
 */
export async function getBusyTimes(
  prisma: PrismaClient,
  ctx: MerchantContext,
  filters: InsightsFilters,
): Promise<BusyTimesResult> {
  const now = filters.now ?? new Date()
  const win = periodWindow(filters.period, now, filters.custom)
  const scope = effectiveScope(ctx, filters.branchId)
  const demoId = demoIncludeMerchantId(ctx.merchantId)

  // London ISODOW (Mon=1..Sun=7) -> day (Mon=0..Sun=6); London hour-of-day -> daypart.
  // The daypart CASE is DERIVED from DAYPARTS (london.ts) via daypartCaseSql so the
  // six half-open [start,end) hour bounds have one source of truth and cannot drift.
  //
  // NO try/catch swallow here. There is no legitimate "a safe intensity output is
  // impossible" path in the happy flow: an all-zero grid is itself a valid intensity
  // payload (every cell maps to the zero band). An UNEXPECTED query/programming error
  // MUST stay observable - it propagates to the framework error handler (logged +
  // surfaced), never silently collapsed into { available:false } (Codex finding #7).
  const rows = await prisma.$queryRaw<Array<{ day: number; daypart: number; cnt: bigint }>>(Prisma.sql`
    SELECT
      (EXTRACT(ISODOW FROM ${londonTs()})::int - 1) AS day,
      ${daypartCaseSql(Prisma.sql`EXTRACT(HOUR FROM ${londonTs()})::int`)} AS daypart,
      COUNT(*)::bigint AS cnt
    ${eligibleFrom(ctx.merchantId, scope, win.startUtc, win.endUtc, filters.voucherType, demoId)}
    GROUP BY day, daypart
  `)

  // Build the dense count grid (raw counts stay INTERNAL).
  const counts: number[][] = Array.from({ length: DOW_COUNT }, () => new Array<number>(DAYPART_COUNT).fill(0))
  let peakCount = 0
  let peakCell: { day: number; daypart: number } | null = null
  for (const row of rows) {
    const d = Number(row.day)
    const p = Number(row.daypart)
    if (d < 0 || d >= DOW_COUNT || p < 0 || p >= DAYPART_COUNT) continue
    const c = num(row.cnt)
    counts[d][p] = c
    if (c > peakCount) {
      peakCount = c
      peakCell = { day: d, daypart: p }
    }
  }

  // Map every cell to an ordinal band relative to the peak. Raw count never
  // reaches the payload.
  const grid: BusyTimesIntensity['grid'] = []
  for (let d = 0; d < DOW_COUNT; d++) {
    for (let p = 0; p < DAYPART_COUNT; p++) {
      grid.push({ day: d, daypart: p, intensity: intensityBand(counts[d][p], peakCount) })
    }
  }

  // Busiest is the peak LOCATION only. The near-empty-peak minimum is an UNDECIDED
  // PR-0a D6 value from the server-owned, fail-closed config. With NO approved
  // threshold (minPeak === null) we NEVER name a peak (busiest null, pre-D6 safe
  // fallback). With a recorded positive integer N, busiest surfaces only when the
  // peak count is at or above N (peakCount >= minPeak).
  const minPeak = busyPeakMinCount()
  const busiest = minPeak !== null && peakCell !== null && peakCount >= minPeak ? peakCell : null

  return { mode: 'intensity', grid, busiest }
}

// --- Validation --------------------------------------------------------------

export type ValidationResult = {
  logged: number
  confirmed: number
  awaiting: number
  /** Confirmed / Logged, 0-safe, rounded to 1dp (a fraction 0..1). */
  completionRate: number
  /** Methods over the confirmed subset; omitted/empty when <=1 method has data. */
  methods: Array<{ method: string; count: number }>
}

/**
 * Validation totals (spec 4.2/1.8). logged/confirmed/awaiting reconcile; methods
 * count ONLY rows with isValidated=true AND validationMethod IS NOT NULL (the
 * confirmed subset). The methods array is emptied when <=1 distinct method has a
 * non-zero count (adaptive: a single-method breakdown is uninformative).
 */
export async function getValidation(
  prisma: PrismaClient,
  ctx: MerchantContext,
  filters: InsightsFilters,
): Promise<ValidationResult> {
  const now = filters.now ?? new Date()
  const win = periodWindow(filters.period, now, filters.custom)
  const scope = effectiveScope(ctx, filters.branchId)
  const demoId = demoIncludeMerchantId(ctx.merchantId)

  const totalsRows = await prisma.$queryRaw<Array<{ logged: bigint; confirmed: bigint }>>(Prisma.sql`
    SELECT
      COUNT(*)::bigint AS logged,
      COUNT(*) FILTER (WHERE r."isValidated" = true)::bigint AS confirmed
    ${eligibleFrom(ctx.merchantId, scope, win.startUtc, win.endUtc, filters.voucherType, demoId)}
  `)
  const totals = totalsRows[0] ?? { logged: 0n, confirmed: 0n }
  const logged = num(totals.logged)
  const confirmed = num(totals.confirmed)

  const methodRows = await prisma.$queryRaw<Array<{ method: string; count: bigint }>>(Prisma.sql`
    SELECT r."validationMethod" AS method, COUNT(*)::bigint AS count
    ${eligibleFrom(ctx.merchantId, scope, win.startUtc, win.endUtc, filters.voucherType, demoId)}
      AND r."isValidated" = true
      AND r."validationMethod" IS NOT NULL
    GROUP BY r."validationMethod"
    ORDER BY count DESC, method ASC
  `)
  const methods = methodRows.map((row) => ({ method: row.method, count: num(row.count) }))
  const nonZeroMethods = methods.filter((m) => m.count > 0)

  return {
    logged,
    confirmed,
    awaiting: logged - confirmed,
    completionRate: logged === 0 ? 0 : Math.round((confirmed / logged) * 1000) / 10 / 100,
    // Adaptive: a single-method breakdown is uninformative: emit nothing.
    methods: nonZeroMethods.length <= 1 ? [] : methods,
  }
}

// --- Event-level export (GATED) ----------------------------------------------
//
// Task A8 (spec 10.1 / 13.5 / 13.6, plan 2.7). The event-level Redemption-activity
// CSV is INSIDE the bounded privacy/legal review, so it is HARD-GATED by
// behaviouralGateOpen() exactly like the behavioural endpoints:
//   - GATE CLOSED -> return { available:false } and execute NO query (the gate is
//     checked BEFORE any $queryRaw, so a closed gate never reads event rows).
//   - GATE OPEN   -> emit the eligible event-level rows over the active filters +
//     branch scope.
//
// COLUMNS (spec 10.1): redeemed date + time (Europe/London-rendered), voucher title,
// branch name, 7-type label, estimated value, status (Confirmed/Awaiting), and the
// validation method WHERE Confirmed. There is DELIBERATELY NO direct identifier:
// no customer name / email / phone / userId / postcode / demographics, and NO
// Customer column (unlike the operational redemptions/export.csv). The QA/DELETED/
// isTestData exclusions are inherited from buildEligibilityWhereSql (the canonical
// eligible rule), composed via eligibleFrom.
//
// CAP (spec 1.10): an explicit row cap (default INSIGHTS_EXPORT_CAP=50000, mirroring
// the redemptions export). We fetch CAP+1 to DETECT truncation, then slice to CAP and
// flag `truncated`. The CSV formatter appends a SINGLE truncation-notice row when
// truncated (no silent truncation). The cap is overridable for tests so CAP+1
// detection can be exercised without seeding 50k rows.
//
// LONDON RENDERING: the date + time columns are formatted IN SQL from the
// session-TZ-independent double conversion (londonTs) via to_char, so the CSV
// carries human-readable Europe/London-rendered values regardless of the DB session
// time zone (a single AT TIME ZONE would mis-bucket under a non-UTC session TZ).

/** The explicit event-level CSV row cap (spec 1.10), mirroring the redemptions export. */
export const INSIGHTS_EXPORT_CAP = 50000

export type InsightsExportRow = {
  /** Europe/London-rendered redemption date (YYYY-MM-DD). */
  redeemedDate: string
  /** Europe/London-rendered redemption time (HH:MM:SS, 24h). */
  redeemedTime: string
  voucherTitle: string
  branchName: string
  type7: MerchantVoucherType
  /** Estimated value (Decimal coerced to Number). */
  estimatedSaving: number
  /** Confirmed (isValidated=true) or Awaiting. Every exported row is, by definition, logged. */
  status: 'Confirmed' | 'Awaiting'
  /** The validation method WHERE Confirmed; null for an awaiting row (no method recorded). */
  validationMethod: string | null
}

export type InsightsExportResult =
  | { rows: InsightsExportRow[]; truncated: boolean }
  | { available: false }

/**
 * The event-level Redemption-activity export (GATED). Returns the eligible event
 * rows over the active filters + branch scope, London-rendered, with NO direct
 * identifiers. GATE CLOSED -> { available:false } with NO query. `opts.cap` overrides
 * the default cap for tests (CAP+1 truncation detection).
 */
export async function getInsightsExport(
  prisma: PrismaClient,
  ctx: MerchantContext,
  filters: InsightsFilters,
  opts: { cap?: number } = {},
): Promise<InsightsExportResult> {
  // GATE: checked BEFORE any query. Closed -> { available:false }, no event-row read.
  if (!behaviouralGateOpen()) return { available: false }

  const cap = opts.cap ?? INSIGHTS_EXPORT_CAP
  const now = filters.now ?? new Date()
  const win = periodWindow(filters.period, now, filters.custom)
  const scope = effectiveScope(ctx, filters.branchId)
  const demoId = demoIncludeMerchantId(ctx.merchantId)

  // Fetch CAP+1 to detect truncation (mirror the redemptions export). The date +
  // time columns are formatted IN SQL from londonTs() (double conversion), so the
  // values are Europe/London-rendered + session-TZ-independent. Voucher title +
  // branch name are joined columns; the 7-type collapse happens in the mapper.
  const rows = await prisma.$queryRaw<
    Array<{
      redeemed_date: string
      redeemed_time: string
      voucher_title: string
      branch_name: string
      db_type: string
      est: Prisma.Decimal | null
      is_validated: boolean
      validation_method: string | null
    }>
  >(Prisma.sql`
    SELECT
      to_char(${londonTs()}, 'YYYY-MM-DD') AS redeemed_date,
      to_char(${londonTs()}, 'HH24:MI:SS') AS redeemed_time,
      v.title AS voucher_title,
      b.name AS branch_name,
      v."type" AS db_type,
      r."estimatedSaving" AS est,
      r."isValidated" AS is_validated,
      r."validationMethod" AS validation_method
    ${eligibleFrom(ctx.merchantId, scope, win.startUtc, win.endUtc, filters.voucherType, demoId)}
    ORDER BY r."redeemedAt" DESC, r.id ASC
    LIMIT ${cap + 1}
  `)

  const truncated = rows.length > cap
  const capped = truncated ? rows.slice(0, cap) : rows

  return {
    rows: capped.map((row) => ({
      redeemedDate: row.redeemed_date,
      redeemedTime: row.redeemed_time,
      voucherTitle: row.voucher_title,
      branchName: row.branch_name,
      type7: dbTypeToType7(row.db_type),
      estimatedSaving: num(row.est),
      status: row.is_validated ? 'Confirmed' : 'Awaiting',
      // A row that is not confirmed has no recorded method; null it defensively even
      // if a stray method value exists (only Confirmed rows surface a method, spec 10.1).
      validationMethod: row.is_validated ? row.validation_method ?? null : null,
    })),
    truncated,
  }
}

// --- Behavioural (GATED): repeat-rate + new-vs-returning ---------------------
//
// Task A5 (spec 1.3/1.5/13.5, plan 2.5/2.7). These two functions read PRIOR-PERIOD
// customer history (cross-period profiling over userId), so they are the BEHAVIOURAL
// boundary and are HARD-GATED by behaviouralGateOpen():
//   - GATE CLOSED -> return { available:false } and execute NO query (defense in
//     depth alongside the route gate; the gate is checked BEFORE any $queryRaw, so
//     a closed gate never touches real customer history).
//   - GATE OPEN   -> compute over the eligible logged dataset.
//
// COHORT (spec 1.5): the distinct customers with an eligible logged redemption in
// the period, under the active filters (period window + branchId intersection +
// voucher-type). This is the SAME voucher-type-filtered distinct cohort as
// distinctCustomers, so it is the denominator for both KPIs.
//
// RETURNING (spec 1.5): a cohort customer with >=1 PRIOR eligible logged redemption
// STRICTLY BEFORE the window start, within the SAME effective branch scope but
// ACROSS ALL voucher types (the prior-history check never applies the voucher-type
// filter, so "New to you" means new to the merchant/branch, not new to a type).
// NEW = the cohort complement (first eligible logged redemption inside the period).
//
// DELETED users + QA accounts + test data are excluded from BOTH the cohort and the
// lookback by buildEligibilityWhereSql (the canonical eligible rule), so a deleted
// customer cannot inflate total nor returningCount.
//
// 'all' period: startUtc is null (open-ended earliest), so there is no "before the
// window" - every cohort customer is necessarily New (returningCount = 0). We model
// this as priorStartUtc = null -> the lookback EXISTS clause is a constant FALSE.

/** The distinct in-period eligible cohort (the shared denominator). Internal. */
async function distinctCohortCount(
  prisma: PrismaClient,
  ctx: MerchantContext,
  scope: InsightsBranchScope,
  startUtc: Date | null,
  endUtc: Date,
  voucherType: MerchantVoucherType | undefined,
  demoId?: string,
): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
    SELECT COUNT(DISTINCT r."userId")::bigint AS total
    ${eligibleFrom(ctx.merchantId, scope, startUtc, endUtc, voucherType, demoId)}
  `)
  return num(rows[0]?.total)
}

/**
 * Count the cohort customers who are RETURNING: distinct in-period (voucher-type-
 * filtered) customers who ALSO have a prior eligible logged redemption strictly
 * before `startUtc`, in the same effective branch scope, ACROSS ALL voucher types.
 *
 * Implemented as: the in-period cohort (the `cohort` subquery, voucher-type-filtered)
 * INTERSECTED with the distinct set of customers who have an eligible row strictly
 * before `startUtc` (the `prior` subquery, NO voucher-type filter, same scope). When
 * `startUtc` is null ('all'), there is no "before" - returningCount is 0 with no
 * prior query (every cohort customer is New).
 */
async function returningCohortCount(
  prisma: PrismaClient,
  ctx: MerchantContext,
  scope: InsightsBranchScope,
  startUtc: Date | null,
  endUtc: Date,
  voucherType: MerchantVoucherType | undefined,
  demoId?: string,
): Promise<number> {
  if (startUtc === null) return 0 // 'all' period: no prior window, everyone is New.

  // The in-period cohort: distinct userIds with an eligible row in [startUtc, endUtc),
  // under the voucher-type filter. The window SQL is composed by eligibleFrom.
  const cohortFrom = eligibleFrom(ctx.merchantId, scope, startUtc, endUtc, voucherType, demoId)

  // The prior set: distinct userIds with an eligible row STRICTLY BEFORE startUtc,
  // in the same effective branch scope, across ALL voucher types (voucherType
  // undefined -> no type filter). The "before" window is modelled as the half-open
  // [null, startUtc) range via eligibleFrom's open-lower-bound branch (startUtc=null
  // omits the lower bound, endUtc=startUtc is the exclusive upper bound). The demo
  // carve-out applies to the prior lookback too so a coherent demo cohort surfaces.
  const priorFrom = eligibleFrom(ctx.merchantId, scope, null, startUtc, undefined, demoId)

  const rows = await prisma.$queryRaw<Array<{ returning: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS returning
    FROM (
      SELECT DISTINCT r."userId" AS uid
      ${cohortFrom}
    ) AS cohort
    WHERE cohort.uid IN (
      SELECT DISTINCT r."userId"
      ${priorFrom}
    )
  `)
  return num(rows[0]?.returning)
}

export type NewVsReturningResult =
  | { newCount: number; returningCount: number; total: number }
  | { available: false }

/**
 * New-vs-returning split (spec 1.5). GATED. `returning` = cohort customers with a
 * prior eligible logged redemption before the window start (same branch scope, all
 * voucher types); `new` = the complement. newCount + returningCount === total ===
 * the distinct in-period cohort. DELETED / QA / test data are excluded from both the
 * cohort and the lookback by the eligible rule.
 */
export async function getNewVsReturning(
  prisma: PrismaClient,
  ctx: MerchantContext,
  filters: InsightsFilters,
): Promise<NewVsReturningResult> {
  // GATE: checked BEFORE any query. Closed -> { available:false }, no real-data read.
  if (!behaviouralGateOpen()) return { available: false }

  const now = filters.now ?? new Date()
  const win = periodWindow(filters.period, now, filters.custom)
  const scope = effectiveScope(ctx, filters.branchId)
  const demoId = demoIncludeMerchantId(ctx.merchantId)

  const total = await distinctCohortCount(prisma, ctx, scope, win.startUtc, win.endUtc, filters.voucherType, demoId)
  const returningCount = await returningCohortCount(prisma, ctx, scope, win.startUtc, win.endUtc, filters.voucherType, demoId)
  // New is the complement; clamp at 0 defensively (returning is a subset of the
  // cohort by construction, so this is never negative in practice).
  const newCount = Math.max(0, total - returningCount)

  return { newCount, returningCount, total }
}

export type RepeatRateResult =
  | { value: number | null; insufficient: boolean; comparison: Comparison }
  | { available: false }

// The minimum reliable cohort size is an UNDECIDED PR-0a D6 governance value (spec
// §1.3; plan §3 D6), read from the server-owned, fail-closed config
// `repeatRateMinCohort()` (gate.ts). UNSET / non-positive => null => NO approved
// minimum => repeat-rate is ALWAYS insufficient (value null, insufficient true) -
// fail-closed, never a one-person 0%/100%. A recorded positive integer K => the
// rate is computed only when the in-period distinct cohort is >= K; the SAME
// fail-closed treatment applies to the comparison window (a sub-threshold or
// no-approved-minimum comparison cohort yields comparison: null, never { prev:0 }).

/**
 * Repeat-customer rate (spec 1.3/1.5). GATED. The percentage = returning / total
 * over the SAME voucher-type-filtered distinct cohort as getNewVsReturning, rounded
 * to 1dp. `insufficient` is true (and `value` null) when the cohort is empty / below
 * the minimum reliable size - never a misleading 0%. The comparison is the
 * completed-period repeat-rate over the comparison window (null on an incomplete
 * period); its value AND comparison are gated together with the metric (spec 2.7).
 */
export async function getRepeatRate(
  prisma: PrismaClient,
  ctx: MerchantContext,
  filters: InsightsFilters,
): Promise<RepeatRateResult> {
  // GATE: checked BEFORE any query. Closed -> { available:false }, no real-data read.
  if (!behaviouralGateOpen()) return { available: false }

  const now = filters.now ?? new Date()
  const win = periodWindow(filters.period, now, filters.custom)
  const scope = effectiveScope(ctx, filters.branchId)
  const demoId = demoIncludeMerchantId(ctx.merchantId)

  // The minimum reliable cohort is an UNDECIDED PR-0a D6 value (server-owned,
  // fail-closed). null => NO approved minimum => repeat-rate is ALWAYS insufficient.
  const minCohort = repeatRateMinCohort()
  const total = await distinctCohortCount(prisma, ctx, scope, win.startUtc, win.endUtc, filters.voucherType, demoId)

  // No approved minimum, or empty / sub-threshold cohort -> insufficient (fail-
  // closed; never a misleading one-person 0%/100%).
  if (minCohort === null || total < minCohort) {
    return { value: null, insufficient: true, comparison: null }
  }

  const returningCount = await returningCohortCount(prisma, ctx, scope, win.startUtc, win.endUtc, filters.voucherType, demoId)
  const value = Math.round((returningCount / total) * 1000) / 10

  // Comparison: the repeat-rate over the completed-period comparison window (null
  // when the period is incomplete). The comparison value is itself a repeat-rate
  // percentage; cur = this period's value, prev = the comparison window's value.
  const cmpWin = resolveComparisonWindow(filters.period, now, filters.custom)
  let comparison: Comparison = null
  if (cmpWin) {
    const cmpTotal = await distinctCohortCount(prisma, ctx, scope, cmpWin.startUtc, cmpWin.endUtc, filters.voucherType, demoId)
    if (cmpTotal >= minCohort) {
      const cmpReturning = await returningCohortCount(prisma, ctx, scope, cmpWin.startUtc, cmpWin.endUtc, filters.voucherType, demoId)
      const prevValue = Math.round((cmpReturning / cmpTotal) * 1000) / 10
      comparison = buildComparison(value, prevValue, filters.period)
    } else {
      // The comparison window has no reliable cohort (sub-threshold). Missing
      // evidence is NEVER a measured zero: return comparison: null, NOT { prev:0 }
      // (Codex finding #6). `minCohort` is non-null on this branch (we returned
      // insufficient above when it was null), so the only reason to be here is a
      // genuinely sub-threshold comparison cohort.
      comparison = null
    }
  }

  return { value, insufficient: false, comparison }
}
