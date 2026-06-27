// Insights PR-A Task A7: response shaping (the wire contract, plan section 2.7).
//
// These mappers are the SINGLE place the service result types (OverviewResult,
// TrendResult, ...) are projected into the exact JSON the merchant-web client
// (PR-B) + the printable report (B7) consume. Keeping the projection here (not
// inline in the route) means:
//   - the wire shape is asserted in ONE place (route tests pin these mappers);
//   - PR-B's Zod schemas have one authoritative source to mirror;
//   - the operational/behavioural split (gated repeatRate, gated /customers) is
//     expressed declaratively, not duplicated per route.
//
// ALIGNMENT DECISIONS (locked here so PR-B/B1 match the AS-BUILT shape, not the
// plan's sketch):
//
//   (a) COMPARISON SHAPE: the plan section 2.7 sketch lists an OPTIONAL `kind`
//       field on the comparison object. The Core-1 service (service.ts) emits
//       `{ cur, prev, pct, label }` with NO `kind`. We pass the service
//       comparison object through VERBATIM and DO NOT synthesise a `kind`. So the
//       wire comparison shape is exactly `{ cur, prev, pct, label } | null`. This
//       omission is intentional and is pinned by a route test so B1's Zod schema
//       matches. (If a `kind` is ever needed it is added in the service once, for
//       every endpoint, never per-endpoint here.)
//
//   (b) completionRate UNITS: the service emits completionRate as a FRACTION in
//       [0, 1] (confirmed / logged). We keep it 0..1 on the wire and DO NOT
//       convert to 0..100; the client formats the percentage. Documented + pinned
//       by a route test.
//
// No mapper invents data: every field below is copied from the service result
// (Decimal already coerced to Number in the service). The only logic here is the
// gate-driven shaping of the two behavioural blocks.

import type {
  OverviewResult,
  TrendResult,
  VouchersResult,
  BranchesResult,
  BusyTimesResult,
  ValidationResult,
  RepeatRateResult,
  NewVsReturningResult,
  InsightsExportRow,
} from './service'
import { INSIGHTS_EXPORT_CAP } from './service'

// --- Overview ---------------------------------------------------------------

/**
 * The overview wire payload MERGES the operational OverviewResult with the
 * BEHAVIOURAL repeatRate block (computed/gated separately in the service):
 *   - gate CLOSED -> getRepeatRate returns `{ available:false }`; we pass that
 *     through, so repeatRate is `{ available:false }` and its comparison is gone
 *     with it (the value AND its comparison are gated together, plan section 2.7).
 *   - gate OPEN   -> repeatRate is `{ value|null, insufficient, comparison }`.
 * The operational KPIs (redemptionActivity / distinctCustomers / savings), each
 * with its OWN comparison (null on an incomplete period), ALWAYS return.
 */
export function toOverviewResponse(operational: OverviewResult, repeatRate: RepeatRateResult) {
  return {
    redemptionActivity: operational.redemptionActivity,
    distinctCustomers: operational.distinctCustomers,
    // Behavioural: passed through verbatim (already `{ available:false }` when gated).
    repeatRate,
    savings: operational.savings,
    meta: operational.meta,
  }
}

// --- Operational pass-through mappers ---------------------------------------
//
// Trend / vouchers / branches / validation are operational; the service result
// already matches the section 2.7 contract one-to-one, so these are thin,
// explicit pass-throughs (NOT a blind spread) so the wire surface is auditable
// and any future field is an intentional addition here.

export function toTrendResponse(r: TrendResult) {
  return { months: r.months }
}

export function toVouchersResponse(r: VouchersResult) {
  return { top: r.top, byType: r.byType }
}

export function toBranchesResponse(r: BranchesResult) {
  return { rows: r.rows }
}

/**
 * Busy-times pass-through. The service ALREADY owns the privacy mode: it returns
 * either the `{ mode:'intensity', grid, busiest }` intensity payload (the default,
 * with NO raw count + NO raw peak), or `{ available:false }`. The route NEVER
 * upgrades the mode and NEVER adds a raw count: it serialises exactly what the
 * service produced. (A privacy-negative route test pins that no `logged` / raw
 * peak field ever appears.)
 */
export function toBusyTimesResponse(r: BusyTimesResult) {
  return r
}

export function toValidationResponse(r: ValidationResult) {
  return {
    logged: r.logged,
    confirmed: r.confirmed,
    awaiting: r.awaiting,
    // completionRate is a FRACTION in [0,1] (decision (b) above) - kept as-is.
    completionRate: r.completionRate,
    methods: r.methods,
  }
}

// --- Customers (behavioural; gated) -----------------------------------------

/**
 * The /customers wire payload. Both blocks are behavioural + gated: each is
 * either its real shape or `{ available:false }`. When the gate is closed BOTH
 * are `{ available:false }` (the service short-circuits each before any query),
 * so the route never reads real customer history with the gate closed.
 */
export function toCustomersResponse(newVsReturning: NewVsReturningResult, repeatRate: RepeatRateResult) {
  return { newVsReturning, repeatRate }
}

// --- Export (event-level; gated) --------------------------------------------

/**
 * The typed "not available" payload for the event-level CSV export when the
 * behavioural gate is closed (the only reachable path until Task A8 wires the
 * open path). JSON, not CSV: the client treats `{ available:false }` as "export
 * is not available in this build" (mirrors /customers + repeatRate not-available
 * shaping). Task A8 replaces the OPEN path with `getInsightsExport` +
 * `insightsRowsToCsv` and a `text/csv` response.
 */
export function exportNotAvailableResponse() {
  return { available: false as const }
}

// --- Event-level CSV (gate-OPEN path; Task A8) ------------------------------
//
// The event-level Redemption-activity CSV (spec 10.1). DELIBERATELY a SEPARATE,
// STRICTER artefact from the operational redemptions/export.csv: there is NO
// Customer column and no direct identifier (no name / email / phone / userId /
// postcode / demographics) - only redeemed date + time (London-rendered), voucher
// title, branch name, the 7-type label, the estimated value, the status
// (Confirmed/Awaiting), and the validation method WHERE Confirmed.
//
// This formatter is reached ONLY on the gate-OPEN path (getInsightsExport returns
// rows only when behaviouralGateOpen()); the route serves a JSON `{ available:false }`
// otherwise. The rows it receives are already eligible-filtered, scoped, and capped.

// OWASP CSV-injection mitigation (identical to the redemptions export): a cell value
// beginning with = + - @ tab or CR can execute as a spreadsheet formula in
// Excel/Sheets. Prepend a single apostrophe to neutralise it BEFORE the quote-escaping
// so the value renders as literal text (e.g. `=SUM(A1:A2)` -> cell `"'=SUM(A1:A2)"`).
function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v)
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) s = "'" + s
  return '"' + s.replace(/"/g, '""') + '"'
}

/**
 * Project event-level export rows into the no-direct-identifier CSV (spec 10.1).
 * Columns: Redeemed date, Redeemed time, Voucher, Branch, Type, Estimated value (GBP),
 * Status, Method. When `truncated`, a SINGLE truncation-notice row is appended (no
 * silent truncation, spec 1.10) referencing the production cap.
 */
export function insightsRowsToCsv(rows: InsightsExportRow[], truncated: boolean): string {
  const header = [
    'Redeemed date',
    'Redeemed time',
    'Voucher',
    'Branch',
    'Type',
    'Estimated value (GBP)',
    'Status',
    'Method',
  ]
  const lines = [header.map(csvCell).join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.redeemedDate,
        r.redeemedTime,
        r.voucherTitle,
        r.branchName,
        r.type7,
        r.estimatedSaving.toFixed(2),
        r.status,
        r.validationMethod ?? '',
      ]
        .map(csvCell)
        .join(','),
    )
  }
  if (truncated) {
    lines.push(
      csvCell(
        'Export truncated at ' +
          INSIGHTS_EXPORT_CAP +
          ' rows. Narrow the filters for a complete export.',
      ),
    )
  }
  return lines.join('\r\n')
}
