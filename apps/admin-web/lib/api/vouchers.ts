/**
 * Admin RMV (mandatory flagship voucher) co-build API (Option B B5.1, wired in
 * Merchant 360 A3). Typed wrappers for the three existing-but-unconsumed routes:
 *
 *   GET   /api/v1/admin/merchants/:id/vouchers/rmv          (cap merchant:read)
 *   PATCH /api/v1/admin/merchants/:id/vouchers/:vid/rmv     (cap merchant:manage-vouchers)
 *   POST  /api/v1/admin/merchants/:id/vouchers/:vid/rmv/submit (cap merchant:manage-vouchers)
 *
 * The edit allow-list is DYNAMIC per voucher: the read returns each voucher's
 * `allowedFields` (which keys the co-build form may render/edit) prefilled from
 * `merchantFields`; the PATCH sends only those keys under `fields` plus a required
 * `reason`. `estimatedSaving` is coerced to Number server-side (Prisma Decimal).
 *
 * The list is validated with Zod so contract drift surfaces as a clear error;
 * the mutation responses are not parsed (success/failure is all the UI needs).
 */
import { z } from 'zod'
import { apiFetch } from './client'

// ── Response schema ────────────────────────────────────────────────────────────

export const adminRmvVoucherSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  type: z.string(),
  estimatedSaving: z.number(),
  status: z.string(),
  approvalStatus: z.string(),
  merchantFields: z.record(z.string(), z.unknown()),
  allowedFields: z.array(z.string()),
})
export type AdminRmvVoucher = z.infer<typeof adminRmvVoucherSchema>

export const listAdminRmvResponseSchema = z.object({
  vouchers: z.array(adminRmvVoucherSchema),
})
export type ListAdminRmvResponse = z.infer<typeof listAdminRmvResponseSchema>

// ── API calls ──────────────────────────────────────────────────────────────────

export const adminVouchersApi = {
  /** Read the merchant's mandatory RMV flagships for the co-build surface. */
  listRmv: async (merchantId: string): Promise<ListAdminRmvResponse> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/merchants/${merchantId}/vouchers/rmv`,
      { auth: true }
    )
    return listAdminRmvResponseSchema.parse(raw)
  },

  /**
   * Edit a DRAFT RMV's template-allowed fields on the merchant's behalf.
   * `fields` carries only keys from that voucher's `allowedFields`; `reason` is
   * required (min 1) and audited.
   */
  editRmv: async (
    merchantId: string,
    voucherId: string,
    input: { fields: Record<string, unknown>; reason: string }
  ): Promise<{ id: string }> => {
    const raw = await apiFetch<{ id: string }>(
      `/api/v1/admin/merchants/${merchantId}/vouchers/${voucherId}/rmv`,
      { method: 'PATCH', auth: true, body: JSON.stringify(input) }
    )
    return raw
  },

  /** Submit a DRAFT RMV to PENDING_APPROVAL on the merchant's behalf. */
  submitRmv: async (
    merchantId: string,
    voucherId: string,
    input: { reason: string }
  ): Promise<{ id: string }> => {
    const raw = await apiFetch<{ id: string }>(
      `/api/v1/admin/merchants/${merchantId}/vouchers/${voucherId}/rmv/submit`,
      { method: 'POST', auth: true, body: JSON.stringify(input) }
    )
    return raw
  },
}
