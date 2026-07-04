import { z } from 'zod'
import { apiFetch } from './client'
import { getAccessToken } from '@/lib/auth/tokenStore'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

// M3 F1: the merchant Redemptions API client. Calls the REAL merged backend
// (src/api/merchant/redemptions/*). Direct browser->backend authed calls (Bearer
// access token). No BFF route is needed (no token issuance).
//
// Backend contracts (read the real code, do not guess):
//   GET  /api/v1/merchant/redemptions          -> { items, total, limit, offset }
//        filters: branchId / status (awaiting|validated) / from / to (ISO) /
//        voucherType / code / limit / offset. merchantId is taken from the
//        session, never a client param. isTestData rows excluded by default.
//   GET  /api/v1/merchant/redemptions/lookup?code=  -> one merchant-safe row
//        (read-only preview; cross-tenant masked as REDEMPTION_NOT_FOUND).
//   POST /api/v1/redemption/verify  body { code, method: 'MANUAL' }
//        -> validates the code (merchant-admin JWT path).
//   GET  /api/v1/merchant/redemptions/export.csv?<same filters>  -> text/csv.
//
// Privacy invariant (test-pinned): customerName is ALWAYS first name + last
// initial, formatted server-side. The row NEVER carries email/phone/PIN.

// The merchant-safe row shape. .passthrough() so a future backend field cannot
// break this client; the explicit keys are what we render.
export const redemptionRowSchema = z
  .object({
    id: z.string(),
    redemptionCode: z.string(),
    voucher: z.object({ id: z.string(), title: z.string(), type: z.string() }),
    branch: z.object({ id: z.string(), name: z.string() }),
    customerName: z.string(),
    redeemedAt: z.string(),
    status: z.enum(['AWAITING_VALIDATION', 'VALIDATED']),
    validatedAt: z.string().nullable(),
    validationMethod: z.enum(['MANUAL', 'QR_SCAN']).nullable(),
    validatedByLabel: z.string().nullable(),
    // estimatedSaving is a Prisma Decimal => JSON STRING on the wire; coerce so a
    // real saving value (e.g. "5.00") parses instead of throwing (same class of bug
    // as branch latitude/longitude).
    estimatedSaving: z.coerce.number(),
  })
  .passthrough()

export type RedemptionRow = z.infer<typeof redemptionRowSchema>

const redemptionListSchema = z.object({
  items: z.array(redemptionRowSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
})

export type RedemptionList = z.infer<typeof redemptionListSchema>

export interface RedemptionFilters {
  branchId?: string
  status?: 'awaiting' | 'validated'
  from?: string
  to?: string
  voucherType?: string
  // The per-voucher deep-link filter (B-2): the Voucher Detail "View redemptions"
  // link routes to /redemptions?voucherId=<id>. The PR-A backend filter is
  // IDOR-safe (the voucher must belong to the session merchant). The generic qs()
  // builder already serialises this key once it is on the typed filter shape.
  voucherId?: string
  code?: string
  // Redemptions fidelity: 'recent' (default) or 'saving'; applied to CSV too.
  sort?: 'recent' | 'saving'
  limit?: number
  offset?: number
}

// Builds a querystring, skipping undefined/null/empty values. Returns '' (no
// '?') when nothing is set so the bare path is preserved.
function qs(f: Record<string, unknown>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined && v !== '' && v !== null) p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

// Narrowing helper so the typed RedemptionFilters can be passed to qs without a
// brittle cast at each call site.
function filtersToRecord(f: RedemptionFilters): Record<string, unknown> {
  return f as Record<string, unknown>
}

export async function listRedemptions(f: RedemptionFilters = {}): Promise<RedemptionList> {
  const data = await apiFetch(`/api/v1/merchant/redemptions${qs(filtersToRecord(f))}`, {
    method: 'GET',
    auth: true,
  })
  return redemptionListSchema.parse(data)
}

export async function lookupRedemptionByCode(code: string): Promise<RedemptionRow> {
  return redemptionRowSchema.parse(
    await apiFetch(`/api/v1/merchant/redemptions/lookup${qs({ code })}`, {
      method: 'GET',
      auth: true,
    }),
  )
}

// The web validate flow is always manual entry (QR is the future staff app), so
// the method is hard-coded to MANUAL.
export async function validateRedemptionCode(code: string): Promise<unknown> {
  return apiFetch('/api/v1/redemption/verify', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ code, method: 'MANUAL' }),
  })
}

// The export URL (used for a direct download); pagination params are stripped
// because the CSV export reuses the B1 filters without pagination.
export function exportRedemptionsCsvPath(f: RedemptionFilters = {}): string {
  const { limit: _limit, offset: _offset, ...rest } = f
  return `/api/v1/merchant/redemptions/export.csv${qs(filtersToRecord(rest))}`
}

// Downloads the filtered CSV. The export endpoint is authed (Bearer token) and
// returns text/csv, so a plain <a href> cannot carry the token; we fetch it as a
// blob with the access token and trigger a client-side download. Pagination is
// stripped by exportRedemptionsCsvPath.
export async function downloadRedemptionsCsv(f: RedemptionFilters = {}): Promise<void> {
  const path = exportRedemptionsCsvPath(f)
  const token = getAccessToken()
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`Export failed (${res.status})`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'redemptions.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
