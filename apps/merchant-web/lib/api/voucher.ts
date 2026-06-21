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
