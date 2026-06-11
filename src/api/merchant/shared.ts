import { PrismaClient } from '../../../generated/prisma/client'
import { AppError } from '../shared/errors'
import { getOwnerMembership } from '../shared/merchantMembership'

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
