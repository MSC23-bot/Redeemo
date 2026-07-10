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

// ── A4: custom (RCV) voucher roster (read-only) ──────────────────────────────────

// The curated pending-edit summary the backend exposes (at most one OPEN edit
// per voucher). `kind` is CHANGE | END; drift-tolerant string keeps the mirror
// resilient if a new kind lands before this is updated.
export const adminVoucherPendingEditSchema = z.object({
  id: z.string(),
  kind: z.string(),
  status: z.string(),
})

export const adminCustomVoucherSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  type: z.string(),
  status: z.string(),
  approvalStatus: z.string(),
  estimatedSaving: z.number(),
  // ISO strings over the wire; null when unset.
  expiryDate: z.string().nullable(),
  createdAt: z.string(),
  pendingEdit: adminVoucherPendingEditSchema.nullable(),
})
export type AdminCustomVoucher = z.infer<typeof adminCustomVoucherSchema>

export const listAdminCustomResponseSchema = z.object({
  vouchers: z.array(adminCustomVoucherSchema),
})
export type ListAdminCustomResponse = z.infer<typeof listAdminCustomResponseSchema>

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
   * A4: read the merchant's custom (RCV) vouchers for the read-only Vouchers-tab
   * custom section. `merchant:read`-gated; no mutations (B5.2 stays unbuilt).
   */
  listCustom: async (merchantId: string): Promise<ListAdminCustomResponse> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/merchants/${merchantId}/vouchers`,
      { auth: true }
    )
    return listAdminCustomResponseSchema.parse(raw)
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
