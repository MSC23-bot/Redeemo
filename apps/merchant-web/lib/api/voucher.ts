import { z } from 'zod'
import { apiFetch } from './client'

// M2 F5: the flagship-voucher API client. Calls the REAL merged backend
// (src/api/merchant/voucher/*). Direct browser->backend authed calls (Bearer token).
//
// Backend contracts (read the real code, do not guess):
//   POST /api/v1/merchant/vouchers/rmv/create-flagship  body { voucherType }
//        -> creates ONE template-linked DRAFT RMV. Ineligible type ->
//           VOUCHER_TYPE_NOT_ELIGIBLE (400). Cap 2 -> FLAGSHIP_RMV_LIMIT_REACHED (409).
//   PATCH /api/v1/merchant/vouchers/rmv/:id  body { ...allowedFields }
//        -> updateRmvVoucherCore: validates the PATCH keys against the template
//           allowedFields ([title, description, estimatedSaving, terms, imageUrl,
//           merchantFields]) then MERGES the whole body into the merchantFields JSON
//           column. The top-level columns are NOT written by this path; everything
//           the merchant types lands inside merchantFields. The guided builder reads
//           it back from merchantFields, so this is sufficient (no schema change).
//   POST /api/v1/merchant/vouchers/rmv/:id/submit  -> DRAFT -> PENDING_APPROVAL.
//   GET  /api/v1/merchant/vouchers/rmv  -> the merchant's flagship RMV rows.

// The RMV row shape we consume. .passthrough() so a future backend field cannot break
// this client. merchantFields is the JSON bag the guided builder rehydrates from.
export const rmvVoucherSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    status: z.string(),
    title: z.string().nullish(),
    description: z.string().nullish(),
    estimatedSaving: z.union([z.number(), z.string()]).nullish(),
    terms: z.string().nullish(),
    imageUrl: z.string().nullish(),
    merchantFields: z.record(z.string(), z.unknown()).nullish(),
  })
  .passthrough()

export type RmvVoucher = z.infer<typeof rmvVoucherSchema>

export async function createFlagshipRmv(voucherType: string): Promise<RmvVoucher> {
  return rmvVoucherSchema.parse(
    await apiFetch('/api/v1/merchant/vouchers/rmv/create-flagship', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ voucherType }),
    }),
  )
}

// The PATCH payload. Every key is optional so a partial save sends only filled keys.
// title/description/estimatedSaving/terms/imageUrl are top-level allowedFields keys;
// merchantFields is the nested bag of per-type structured builder fields. The backend
// merges them all into the merchantFields JSON column (see the note above).
export interface RmvUpdatePayload {
  title?: string
  description?: string
  estimatedSaving?: number
  terms?: string
  imageUrl?: string
  merchantFields?: Record<string, unknown>
}

export async function updateRmvVoucher(id: string, payload: RmvUpdatePayload): Promise<RmvVoucher> {
  return rmvVoucherSchema.parse(
    await apiFetch(`/api/v1/merchant/vouchers/rmv/${id}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(payload),
    }),
  )
}

export async function submitRmvVoucher(id: string): Promise<RmvVoucher> {
  return rmvVoucherSchema.parse(
    await apiFetch(`/api/v1/merchant/vouchers/rmv/${id}/submit`, {
      method: 'POST',
      auth: true,
    }),
  )
}

export async function listRmvVouchers(): Promise<RmvVoucher[]> {
  return z
    .array(rmvVoucherSchema)
    .parse(await apiFetch('/api/v1/merchant/vouchers/rmv', { method: 'GET', auth: true }))
}

// ─── Day-2 Vouchers B1: the custom (RCV) voucher client ──────────────────────
//
// Calls the REAL merged PR-A backend (src/api/merchant/voucher/*). Direct
// browser->backend authed calls (Bearer token). Contracts (read the real code,
// do not guess):
//   GET    /api/v1/merchant/vouchers          -> curated custom rows. The list
//          omits merchantFields/code/availabilityWindows (detail-only) but
//          carries redemptionCount, approvalComment, approvalStatus, etc.
//   GET    /api/v1/merchant/vouchers/:id       -> the FULL custom voucher INCL
//          merchantFields (carries askHelp +, on CHANGES_REQUESTED, adminProposed
//          + adminNote) + redemptionCount.
//   POST   /api/v1/merchant/vouchers           -> create DRAFT. The server sets
//          status:DRAFT / approvalStatus:PENDING / isRmv:false. The client NEVER
//          sends status/approvalStatus/isRmv/merchantId (not in the payload type).
//   PATCH  /api/v1/merchant/vouchers/:id        -> DRAFT-only partial; merchantFields MERGES server-side.
//   POST   /api/v1/merchant/vouchers/:id/submit -> DRAFT -> PENDING_APPROVAL (+ creates/reopens the VOUCHER approval).
//   DELETE /api/v1/merchant/vouchers/:id        -> DRAFT-only delete.
//   GET    /api/v1/merchant/vouchers/rmv        -> flagship rows (now incl redemptionCount).

// The 8 customer-facing voucher types (the backend VoucherTypeEnum).
export const VOUCHER_TYPES = [
  'BOGO',
  'SPEND_AND_SAVE',
  'DISCOUNT_FIXED',
  'DISCOUNT_PERCENT',
  'FREEBIE',
  'PACKAGE_DEAL',
  'TIME_LIMITED',
  'REUSABLE',
] as const
export type VoucherTypeEnum = (typeof VOUCHER_TYPES)[number]

// An availability window (TIME_LIMITED only). Mirrors the backend Zod shape.
export const availabilityWindowSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  openTime: z.string(),
  closeTime: z.string(),
})
export type AvailabilityWindow = z.infer<typeof availabilityWindowSchema>

// The curated LIST row shape (GET /vouchers). .passthrough() so a future backend
// field cannot break this client; estimatedSaving is Decimal-on-the-wire so we
// coerce to a number. redemptionCount is the per-voucher aggregate. The list does
// NOT carry merchantFields/availabilityWindows (detail-only).
export const customVoucherListRowSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    type: z.string(),
    status: z.string(),
    approvalStatus: z.string(),
    approvalComment: z.string().nullish(),
    estimatedSaving: z.coerce.number(),
    description: z.string().nullish(),
    terms: z.string().nullish(),
    isRmv: z.boolean().default(false),
    cooldownSeconds: z.number().nullish(),
    publishedAt: z.string().nullish(),
    expiryDate: z.string().nullish(),
    approvedAt: z.string().nullish(),
    createdAt: z.string(),
    redemptionCount: z.number().default(0),
  })
  .passthrough()
export type CustomVoucherListRow = z.infer<typeof customVoucherListRowSchema>

// The concierge adminProposed bag (a subset of the editable fields). Every key is
// optional; the admin only proposes what they want to change.
export const adminProposedSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    terms: z.string().optional(),
    estimatedSaving: z.coerce.number().optional(),
    availabilityWindows: z.array(availabilityWindowSchema).optional(),
    cooldownSeconds: z.number().nullish(),
  })
  .passthrough()
export type AdminProposed = z.infer<typeof adminProposedSchema>

// The merchantFields bag (askHelp + builder draft + the concierge adminProposed /
// adminNote). .passthrough() everywhere so unknown builder keys round-trip.
//
// INVARIANT (B-13): merchantFields is fully CLIENT-READABLE and CLIENT-ECHOED - the
// merchant edits it and the same shape is sent back on create/update. It must NEVER
// be used to carry server-private data (customer PII, redemption PINs, internal
// flags). Anything the backend wants to keep private must live OUTSIDE this bag.
export const merchantFieldsSchema = z
  .object({
    askHelp: z.boolean().optional(),
    adminProposed: adminProposedSchema.nullish(),
    adminNote: z.string().nullish(),
  })
  .passthrough()
export type MerchantFields = z.infer<typeof merchantFieldsSchema>

// The full DETAIL shape (GET /vouchers/:id). Extends the list row with the
// detail-only fields (merchantFields; availabilityWindows when the backend
// includes them). NOTE (contract): the PR-A getVoucher uses include:{ _count }
// only, so availabilityWindows is NOT returned today - modelled as optional so
// the client never breaks if/when it is added.
export const customVoucherDetailSchema = customVoucherListRowSchema
  .extend({
    merchantFields: merchantFieldsSchema.nullish(),
    availabilityWindows: z.array(availabilityWindowSchema.passthrough()).nullish(),
    imageUrl: z.string().nullish(),
  })
  .passthrough()
export type CustomVoucherDetail = z.infer<typeof customVoucherDetailSchema>

// The create payload. The merchant NEVER sends status/approvalStatus/isRmv/merchantId
// (the server sets them) - they are intentionally absent from this type.
export interface CreateVoucherPayload {
  type: VoucherTypeEnum
  title: string
  estimatedSaving: number
  description?: string
  terms?: string
  // Nullable-clear contract (spec 2026-07-05, D1): explicit null on a PATCH
  // clears the saved value; omission preserves. The two fields are independent.
  imageUrl?: string | null
  expiryDate?: string | null
  availabilityWindows?: AvailabilityWindow[]
  cooldownSeconds?: number | null
  merchantFields?: Record<string, unknown>
}

// The update payload is a partial of the create payload (DRAFT-only PATCH).
export type UpdateVoucherPayload = Partial<CreateVoucherPayload>

export async function listCustomVouchers(): Promise<CustomVoucherListRow[]> {
  return z
    .array(customVoucherListRowSchema)
    .parse(await apiFetch('/api/v1/merchant/vouchers', { method: 'GET', auth: true }))
}

export async function getVoucher(id: string): Promise<CustomVoucherDetail> {
  return customVoucherDetailSchema.parse(
    await apiFetch(`/api/v1/merchant/vouchers/${id}`, { method: 'GET', auth: true }),
  )
}

export async function createVoucher(payload: CreateVoucherPayload): Promise<CustomVoucherDetail> {
  return customVoucherDetailSchema.parse(
    await apiFetch('/api/v1/merchant/vouchers', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload),
    }),
  )
}

export async function updateVoucher(
  id: string,
  payload: UpdateVoucherPayload,
): Promise<CustomVoucherDetail> {
  return customVoucherDetailSchema.parse(
    await apiFetch(`/api/v1/merchant/vouchers/${id}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(payload),
    }),
  )
}

export async function submitVoucher(id: string): Promise<CustomVoucherDetail> {
  return customVoucherDetailSchema.parse(
    await apiFetch(`/api/v1/merchant/vouchers/${id}/submit`, { method: 'POST', auth: true }),
  )
}

export async function deleteVoucher(id: string): Promise<{ deleted: boolean }> {
  return z
    .object({ deleted: z.boolean() })
    .parse(await apiFetch(`/api/v1/merchant/vouchers/${id}`, { method: 'DELETE', auth: true }))
}

// Flagship list, parsed as custom rows + isRmv:true so the Vouchers page can pin
// them at the top. The flagship endpoint now also carries redemptionCount (PR-A A2).
const flagshipRowSchema = customVoucherListRowSchema.extend({ isRmv: z.boolean().default(true) })
export type FlagshipVoucherRow = z.infer<typeof flagshipRowSchema>

export async function listFlagshipVouchers(): Promise<FlagshipVoucherRow[]> {
  return z
    .array(flagshipRowSchema)
    .parse(await apiFetch('/api/v1/merchant/vouchers/rmv', { method: 'GET', auth: true }))
}
