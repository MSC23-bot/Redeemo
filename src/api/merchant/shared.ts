import { PrismaClient } from '../../../generated/prisma/client'
import type { MerchantStatus } from '../../../generated/prisma/enums'
import { AppError } from '../shared/errors'
import { getOwnerMembership } from '../shared/merchantMembership'

// Option B B2.1: who is performing a direct profile/branch edit. The shared
// `fnCore` helpers take this so the merchant route ({ type: 'MERCHANT_ADMIN' })
// and the new admin route ({ type: 'ADMIN', reason }) run the SAME
// validation/apply/audit path (no weaker path). `reason` is required on the
// ADMIN path (the admin routes enforce a non-empty reason) and absent on the
// merchant path.
export type EditActor = { type: 'MERCHANT_ADMIN' | 'ADMIN'; id: string; reason?: string }

export async function resolveAdminMerchant(
  prisma: PrismaClient,
  adminId: string
): Promise<{ adminId: string; merchantId: string }> {
  // Phase 2 Slice 1 M1: resolve management-side ownership via the new
  // `MerchantMembership` source of truth, NOT `MerchantAdmin.merchantId`.
  // The column + the `merchant` relation are KEPT (transitional compatibility)
  // because the merchant auth (login/OTP/refresh/reactivate) + branch-user
  // flows still read them directly — those are untouched in M1 and rerouted in
  // M6, where the column is dropped (D-1 contract step).
  const membership = await getOwnerMembership(prisma, adminId)
  if (!membership) throw new AppError('INVALID_CREDENTIALS')
  // SEC-M2 (M6a): block a SUSPENDED merchant from ALL management endpoints (this
  // helper gates every merchant-management read/write). Lenient by design — only
  // an EXPLICITLY suspended merchant throws; a missing/ACTIVE merchant (incl. a
  // mock that omits the joined status) passes, so existing call sites are
  // unaffected. Status is joined by getOwnerMembership — no extra query.
  if (membership.merchant?.status === 'SUSPENDED') throw new AppError('MERCHANT_SUSPENDED')
  return { adminId, merchantId: membership.merchantId }
}

/**
 * Option B B2.1: resolve a merchant BY ID for an admin acting on the merchant's
 * behalf. Unlike `resolveAdminMerchant` (which resolves the caller's OWN merchant
 * via membership and refuses a SUSPENDED merchant), this looks the merchant up by
 * id and does NOT block SUSPENDED: admins may edit a suspended merchant for
 * operational fixes. The admin routes that call this REQUIRE a non-empty reason +
 * write an audit row, so the action is always attributable.
 */
export async function resolveTargetMerchantForAdmin(
  prisma: PrismaClient,
  merchantId: string
): Promise<{ merchantId: string; status: MerchantStatus }> {
  const m = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, status: true },
  })
  if (!m) throw new AppError('MERCHANT_NOT_FOUND')
  return { merchantId: m.id, status: m.status }
}
