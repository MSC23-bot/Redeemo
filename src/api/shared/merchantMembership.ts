import { PrismaClient } from '../../../generated/prisma/client'
import { AppError } from './errors'

export type OwnerMembership = {
  id: string
  merchantId: string
  merchantAdminId: string
}

/**
 * Resolve the ACTIVE OWNER membership for a merchant-admin person.
 *
 * Phase 2 Slice 1 M1 — `MerchantMembership` is the source of truth for
 * merchant-management ownership resolution. Returns null when the admin has no
 * active OWNER membership.
 */
export async function getOwnerMembership(
  prisma: PrismaClient,
  adminId: string
): Promise<OwnerMembership | null> {
  return prisma.merchantMembership.findFirst({
    where: { merchantAdminId: adminId, role: 'OWNER', status: 'ACTIVE' },
    select: { id: true, merchantId: true, merchantAdminId: true },
  })
}

/**
 * Guard: refuse to remove/deactivate the LAST active OWNER of a merchant.
 *
 * Throws `LAST_OWNER_PROTECTED` when `membershipId` is the only remaining ACTIVE
 * OWNER membership for `merchantId`. Passing means another active OWNER exists.
 *
 * Slice 1 has no membership-removal route yet; this helper exists so the M2+
 * ownership mutations can call it from day one (and so the invariant is pinned
 * by tests now).
 */
export async function assertNotLastOwner(
  prisma: PrismaClient,
  merchantId: string,
  membershipId: string
): Promise<void> {
  const otherActiveOwners = await prisma.merchantMembership.count({
    where: {
      merchantId,
      role: 'OWNER',
      status: 'ACTIVE',
      id: { not: membershipId },
    },
  })
  if (otherActiveOwners === 0) throw new AppError('LAST_OWNER_PROTECTED')
}
