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
  return { adminId, merchantId: membership.merchantId }
}
