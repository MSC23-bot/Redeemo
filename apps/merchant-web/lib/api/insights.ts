/**
 * PR-B Task B1: the merchant-web Insights API client + strict zod schemas.
 *
 * Mirrors the PR-A wire contract EXACTLY (src/api/merchant/insights/{routes,format,
 * service}.ts) - this is the SINGLE place the merchant-web side declares the shapes
 * the Insights surface consumes, so any drift from the backend contract is a parse
 * failure here rather than a silent render bug downstream.
 *
 * Contract decisions locked into these schemas (do NOT change without changing PR-A):
 *   - Numeric fields can serialise as STRINGS (Prisma Decimal -> JSON string), so
 *     every numeric field uses z.coerce.number(), NOT z.number() (same class of bug
 *     as branch latitude/longitude + the redemptions estimatedSaving).
 *   - The comparison object is `{ cur, prev, pct, label } | null` with NO `kind`
 *     field. The plan section 2.7 sketch listed an optional `kind`; the AS-BUILT
 *     service (format.ts decision (a)) omits it. We mirror the AS-BUILT shape.
 *   - completionRate stays a FRACTION in [0,1] (format.ts decision (b)); the client
 *     formats the percentage for display, the schema never multiplies by 100.
 *   - busy-times is privacy-mode-aware: the SERVER owns the mode. The AS-BUILT
 *     service emits `{ mode:'intensity', grid, busiest }` (ordinal bands only, NO
 *     raw count, NO raw peak) or `{ available:false }`. The client renders bands and
 *     NEVER thresholds on a raw count (it is sent none). The intensity grid cell is
 *     PASSTHROUGH so a future additive field is forward-compatible; it does NOT
 *     require a `logged`/count field, and a stray field never breaks the parse.
 *   - The gated behavioural blocks (repeatRate, /customers, /export.csv) each return
 *     their real shape OR `{ available:false }` when the runtime gate is closed.
 *
 * Direct browser->backend authed reads (Bearer access token via apiFetch auth:true),
 * mirroring lib/api/redemptions.ts. No BFF route is needed (no token issuance).
 */
import { z } from 'zod'
import { apiFetch, apiFetchRaw } from './client'

// --- shared enums (mirror src/api/merchant/insights/routes.ts + service.ts) ---

/** The six period presets (routes.ts filterSchema period enum). */
export const periodPresetSchema = z.enum([
  'this_month',
  'last_month',
  'last_3m',
  'last_6m',
  'all',
  'custom',
])
export type PeriodPreset = z.infer<typeof periodPresetSchema>

/** The seven merchant-facing voucher types (routes.ts VOUCHER_TYPE_VALUES). */
export const voucherType7Schema = z.enum([
  'BOGO',
  'SPEND_AND_SAVE',
  'DISCOUNT',
  'FREEBIE',
  'PACKAGE_DEAL',
  'TIME_LIMITED',
  'REUSABLE',
])
export type VoucherType7 = z.infer<typeof voucherType7Schema>

// --- comparison (service.ts Comparison) -------------------------------------

/**
 * The per-KPI comparison object: `{ cur, prev, pct, label } | null`. NO `kind`
 * field (format.ts decision (a)). `pct` is null when prev === 0; the whole object
 * is null for an incomplete period. cur/prev coerce from a Decimal string.
 */
export const comparisonSchema = z
  .object({
    cur: z.coerce.number(),
    prev: z.coerce.number(),
    pct: z.coerce.number().nullable(),
    label: periodPresetSchema,
  })
  .nullable()
export type Comparison = z.infer<typeof comparisonSchema>

// --- overview (service.ts OverviewResult + format.toOverviewResponse) --------

/** repeatRate: the gated behavioural block - its real shape OR { available:false }. */
const repeatRateBlockSchema = z.union([
  z.object({
    value: z.coerce.number().nullable(),
    insufficient: z.boolean(),
    comparison: comparisonSchema,
  }),
  z.object({ available: z.literal(false) }),
])

export const overviewSchema = z.object({
  redemptionActivity: z.object({
    logged: z.coerce.number(),
    confirmed: z.coerce.number(),
    awaiting: z.coerce.number(),
    comparison: comparisonSchema,
  }),
  distinctCustomers: z.object({
    logged: z.coerce.number(),
    comparison: comparisonSchema,
  }),
  repeatRate: repeatRateBlockSchema,
  savings: z.object({
    estimatedLogged: z.coerce.number(),
    estimatedConfirmed: z.coerce.number(),
    awaiting: z.coerce.number(),
    comparison: comparisonSchema,
  }),
  meta: z.object({
    scopeLabel: z.string(),
    earliestDate: z.string().nullable(),
    filtersEcho: z.object({
      period: periodPresetSchema,
      branchId: z.string().nullable(),
      voucherType: voucherType7Schema.nullable(),
      from: z.string().nullable(),
      to: z.string().nullable(),
    }),
  }),
})
export type InsightsOverview = z.infer<typeof overviewSchema>

// --- trend (service.ts TrendResult) -----------------------------------------

export const trendSchema = z.object({
  months: z.array(
    z.object({
      monthStartLondon: z.string(),
      logged: z.coerce.number(),
      confirmed: z.coerce.number(),
    }),
  ),
})
export type InsightsTrend = z.infer<typeof trendSchema>

// --- vouchers (service.ts VouchersResult) -----------------------------------

export const vouchersSchema = z.object({
  top: z.array(
    z.object({
      voucherId: z.string(),
      title: z.string(),
      type7: voucherType7Schema,
      logged: z.coerce.number(),
      confirmed: z.coerce.number(),
      estimatedLogged: z.coerce.number(),
      estimatedConfirmed: z.coerce.number(),
    }),
  ),
  byType: z.array(
    z.object({
      type7: voucherType7Schema,
      logged: z.coerce.number(),
      sharePct: z.coerce.number(),
    }),
  ),
})
export type InsightsVouchers = z.infer<typeof vouchersSchema>

// --- branches (service.ts BranchesResult) -----------------------------------

export const branchesSchema = z.object({
  rows: z.array(
    z.object({
      branchId: z.string(),
      name: z.string(),
      logged: z.coerce.number(),
      confirmed: z.coerce.number(),
      estimatedLogged: z.coerce.number(),
      estimatedConfirmed: z.coerce.number(),
    }),
  ),
})
export type InsightsBranches = z.infer<typeof branchesSchema>

// --- validation (service.ts ValidationResult) -------------------------------

export const validationSchema = z.object({
  logged: z.coerce.number(),
  confirmed: z.coerce.number(),
  awaiting: z.coerce.number(),
  // completionRate stays a FRACTION in [0,1] (format.ts decision (b)). The client
  // formats the percentage; the schema NEVER multiplies by 100. Bounded to [0,1]
  // so an out-of-range value (a percentage leaking through, or a contract drift)
  // fails the parse here rather than rendering a nonsensical >100% completion.
  completionRate: z.coerce.number().min(0).max(1),
  // methods may be empty (adaptive: emptied when <=1 method has data).
  methods: z.array(
    z.object({
      method: z.string(),
      count: z.coerce.number(),
    }),
  ),
})
export type InsightsValidation = z.infer<typeof validationSchema>

// --- busy-times (service.ts BusyTimesResult; privacy-mode-aware) -------------

/**
 * The intensity-mode grid cell. STRICT (plan B1, the privacy contract): the
 * AS-BUILT intensity payload carries ONLY day/daypart/intensity - there is NO
 * `logged`/raw-count field, and the client never thresholds on a raw count (it is
 * sent none). `.strict()` makes an unexpected `logged`/exact-count field FAIL the
 * parse so a privacy-regressing contract drift surfaces here rather than leaking
 * downstream. Bounds: day Mon=0..Sun=6, daypart 0..5 (the six dayparts),
 * intensity ordinal band 0..3.
 */
const busyTimesIntensityCellSchema = z
  .object({
    day: z.coerce.number().int().min(0).max(6), // Mon=0..Sun=6 (grid row order)
    daypart: z.coerce.number().int().min(0).max(5), // 0..5 (Overnight..Late)
    intensity: z.coerce.number().int().min(0).max(3), // ordinal band 0..3
  })
  .strict()

/**
 * The exact-mode grid cell. Returned ONLY under an approved PR-0a D6 exact-count
 * policy (default off -> the AS-BUILT service NEVER emits `mode:'exact'`). It adds
 * the exact `logged` count alongside the ordinal `intensity`. STRICT + bounded for
 * the same reason as the intensity cell; `logged` is a non-negative integer.
 */
const busyTimesExactCellSchema = z
  .object({
    day: z.coerce.number().int().min(0).max(6),
    daypart: z.coerce.number().int().min(0).max(5),
    logged: z.coerce.number().int().min(0),
    intensity: z.coerce.number().int().min(0).max(3),
  })
  .strict()

/** Peak LOCATION only (day+daypart, never a count) or null, bounded to the grid. */
const busyTimesPeakSchema = z
  .object({
    day: z.coerce.number().int().min(0).max(6),
    daypart: z.coerce.number().int().min(0).max(5),
  })
  .nullable()

/**
 * The busy-times grid is a DENSE 7x6 matrix in the backend contract: one cell for
 * every (day 0-6, daypart 0-5). For EXACT mode we ENFORCE that density at parse so
 * the client never has to invent a missing cell as a measured zero (a missing cell
 * is unknown data, not zero). Each cell's day/daypart are already bounded to
 * 0-6/0-5, so 42 cells with no duplicate coordinate guarantees full, gap-free
 * coverage (a missing coordinate would force a duplicate, dropping the unique count
 * below 42).
 */
function isDenseBusyGrid(grid: ReadonlyArray<{ day: number; daypart: number }>): boolean {
  if (grid.length !== 42) return false
  const seen = new Set<string>()
  for (const c of grid) seen.add(`${c.day}-${c.daypart}`)
  return seen.size === 42
}

/**
 * busy-times is a `mode`-discriminated union of the AS-BUILT intensity payload, the
 * D6-gated exact payload, and the defensive `{ available:false }`. The AS-BUILT
 * service only ever emits `mode:'intensity'` (or `{available:false}`); the exact
 * arm is forward-compat for an approved D6 policy and is the ONLY arm that carries
 * exact `logged` counts. The client renders intensity bands and shows exact counts
 * ONLY when `mode:'exact'`; it never thresholds on a raw count.
 */
export const busyTimesSchema = z.union([
  z.object({
    mode: z.literal('intensity'),
    grid: z.array(busyTimesIntensityCellSchema),
    busiest: busyTimesPeakSchema,
  }),
  z.object({
    mode: z.literal('exact'),
    grid: z.array(busyTimesExactCellSchema).refine(isDenseBusyGrid, {
      message:
        'exact busy-times grid must be a dense 7x6 matrix (42 unique day/daypart cells; no missing or duplicate coordinate)',
    }),
    busiest: busyTimesPeakSchema,
  }),
  z.object({ available: z.literal(false) }),
])
export type InsightsBusyTimes = z.infer<typeof busyTimesSchema>

// --- customers (gated) (format.toCustomersResponse) -------------------------

const newVsReturningBlockSchema = z.union([
  z.object({
    newCount: z.coerce.number(),
    returningCount: z.coerce.number(),
    total: z.coerce.number(),
  }),
  z.object({ available: z.literal(false) }),
])

export const customersSchema = z.object({
  newVsReturning: newVsReturningBlockSchema,
  repeatRate: repeatRateBlockSchema,
})
export type InsightsCustomers = z.infer<typeof customersSchema>

// --- filters + querystring --------------------------------------------------

/**
 * The Insights filter shape (routes.ts filterSchema). `from`/`to` are YYYY-MM and
 * only consumed for period='custom'. `period` is optional here so a bare call
 * defaults server-side to 'this_month'.
 */
export interface InsightsFilters {
  period?: PeriodPreset
  from?: string
  to?: string
  branchId?: string
  voucherType?: VoucherType7
}

/**
 * Build a querystring, skipping undefined/null/empty values. Returns '' (no '?')
 * when nothing is set so the bare path is preserved (mirrors redemptions qs()).
 */
function qs(f: Record<string, unknown>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined && v !== '' && v !== null) p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

function filtersToRecord(f: InsightsFilters): Record<string, unknown> {
  return f as Record<string, unknown>
}

const PREFIX = '/api/v1/merchant/insights'

// --- fetchers (apiFetch then schema.parse) ----------------------------------

export async function getInsightsOverview(f: InsightsFilters = {}): Promise<InsightsOverview> {
  return overviewSchema.parse(
    await apiFetch(`${PREFIX}/overview${qs(filtersToRecord(f))}`, { method: 'GET', auth: true }),
  )
}

export async function getInsightsTrend(f: InsightsFilters = {}): Promise<InsightsTrend> {
  return trendSchema.parse(
    await apiFetch(`${PREFIX}/trend${qs(filtersToRecord(f))}`, { method: 'GET', auth: true }),
  )
}

export async function getInsightsVouchers(f: InsightsFilters = {}): Promise<InsightsVouchers> {
  return vouchersSchema.parse(
    await apiFetch(`${PREFIX}/vouchers${qs(filtersToRecord(f))}`, { method: 'GET', auth: true }),
  )
}

export async function getInsightsBranches(f: InsightsFilters = {}): Promise<InsightsBranches> {
  return branchesSchema.parse(
    await apiFetch(`${PREFIX}/branches${qs(filtersToRecord(f))}`, { method: 'GET', auth: true }),
  )
}

export async function getInsightsValidation(f: InsightsFilters = {}): Promise<InsightsValidation> {
  return validationSchema.parse(
    await apiFetch(`${PREFIX}/validation${qs(filtersToRecord(f))}`, { method: 'GET', auth: true }),
  )
}

export async function getInsightsBusyTimes(f: InsightsFilters = {}): Promise<InsightsBusyTimes> {
  return busyTimesSchema.parse(
    await apiFetch(`${PREFIX}/busy-times${qs(filtersToRecord(f))}`, { method: 'GET', auth: true }),
  )
}

export async function getInsightsCustomers(f: InsightsFilters = {}): Promise<InsightsCustomers> {
  return customersSchema.parse(
    await apiFetch(`${PREFIX}/customers${qs(filtersToRecord(f))}`, { method: 'GET', auth: true }),
  )
}

// --- event-level CSV export (gated) -----------------------------------------

/**
 * The /export.csv path with the active filters (for reference / a download link).
 * The export endpoint is authed (Bearer token) so a plain <a href> cannot carry
 * the token; use downloadInsightsExport for the actual fetch.
 */
export function insightsExportUrl(f: InsightsFilters = {}): string {
  return `${PREFIX}/export.csv${qs(filtersToRecord(f))}`
}

/** A successful (gate-OPEN) CSV download result. */
export interface InsightsExportCsv {
  csv: string
  filename: string
}

/** The gate-CLOSED not-available result (JSON `{ available:false }`). */
export interface InsightsExportUnavailable {
  available: false
}

export type InsightsExportResult = InsightsExportCsv | InsightsExportUnavailable

/**
 * Download the filtered event-level CSV. The endpoint is authed (Bearer token) and
 * returns EITHER `application/json { available:false }` (gate closed) OR `text/csv`
 * (gate open). We fetch with the in-memory access token and distinguish the two by
 * the response Content-Type so the caller can render the not-available state vs
 * trigger a client-side download of the csv body. The default filename mirrors the
 * backend Content-Disposition (insights-redemptions.csv).
 */
export async function downloadInsightsExport(
  f: InsightsFilters = {},
): Promise<InsightsExportResult> {
  const path = insightsExportUrl(f)
  // Route through apiFetchRaw so the authed download shares apiFetch's full
  // lifecycle (bearer attach + refresh-once-on-401 + session-lost teardown +
  // typed ApiError) instead of a hand-rolled fetch that cannot refresh an expired
  // token. A non-ok status throws an ApiError from the helper before we inspect
  // the body, so we only reach the Content-Type branch on a 2xx response.
  const res = await apiFetchRaw(path, { method: 'GET', auth: true })
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const body = (await res.json().catch(() => null)) as { available?: unknown } | null
    if (body && body.available === false) return { available: false }
    // A JSON body that is not the not-available payload is an unexpected contract
    // drift; surface it rather than masquerading as a csv.
    throw new Error('Insights export returned an unexpected JSON payload')
  }
  const csv = await res.text()
  return { csv, filename: 'insights-redemptions.csv' }
}
