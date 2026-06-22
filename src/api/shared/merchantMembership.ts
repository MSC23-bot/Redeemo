import { PrismaClient } from '../../../generated/prisma/client'
import { AppError } from './errors'

export type OwnerMembership = {
  id: string
  merchantId: string
  merchantAdminId: string
  // M6a (SEC-M2): joined merchant status so live suspended-checks don't need a
  // separate query. M6b adds businessName so the merchant auth flow (login/OTP)
  // can build its response from the membership instead of the dropped
  // MerchantAdmin.merchant relation. Optional — a loosely-typed prisma mock may
  // omit it; callers read `merchant?.<field>` defensively.
  merchant?: { status: string; businessName: string } | null
}

/**
 * Resolve the ACTIVE OWNER membership for a merchant-admin person.
 *
 * Phase 2 Slice 1 M1 — `MerchantMembership` is the source of truth for
 * merchant-management ownership resolution. Returns null when the admin has no
 * active OWNER membership. The joined `merchant.status` (M6a) lets
 * `resolveAdminMerchant` / token-refresh enforce SEC-M2 (block a SUSPENDED
 * merchant) without a second query.
 */
export async function getOwnerMembership(
  prisma: PrismaClient,
  adminId: string
): Promise<OwnerMembership | null> {
  return prisma.merchantMembership.findFirst({
    where: { merchantAdminId: adminId, role: 'OWNER', status: 'ACTIVE' },
    select: { id: true, merchantId: true, merchantAdminId: true, merchant: { select: { status: true, businessName: true } } },
  })
}

/**
 * Resolve the ACTIVE OWNER's contact (admin id + email) for a merchant, BY
 * merchantId. The reverse of getOwnerMembership (which keys by adminId): this is
 * used by code that already has the merchantId and needs to notify the owner
 * (Option B B3 admin submit-on-behalf owner notice). Lives in shared so merchant
 * code can use it without importing the admin layer. Mirrors the admin actioner's
 * approvals.getMerchantOwner; kept as a thin parallel helper rather than a
 * cross-layer import. Returns null when the merchant has no ACTIVE OWNER.
 */
export async function getMerchantOwnerContact(
  prisma: PrismaClient,
  merchantId: string
): Promise<{ adminId: string; email: string } | null> {
  const membership = await prisma.merchantMembership.findFirst({
    where: { merchantId, role: 'OWNER', status: 'ACTIVE' },
    select: { merchantAdmin: { select: { id: true, email: true } } },
  })
  return membership?.merchantAdmin
    ? { adminId: membership.merchantAdmin.id, email: membership.merchantAdmin.email }
    : null
}

export type ActiveMembership = {
  id: string
  merchantId: string
  merchantAdminId: string
  role: 'OWNER' | 'BRANCH_MANAGER' | 'STAFF'
  allBranches: boolean
  canManageVouchers: boolean
  allowedBranchIds: string[]
  merchant?: { status: string; businessName: string } | null
}

/**
 * Resolve the caller's single ACTIVE membership (any role). Throws
 * MULTI_MEMBERSHIP_UNSUPPORTED if the person has >1 (multi-merchant identity is
 * deferred; enforced here at resolve time, not just at invite). Returns null if none.
 * `take: 2` is the cheap >1 detector.
 */
export async function getActiveMembership(
  prisma: PrismaClient,
  adminId: string
): Promise<ActiveMembership | null> {
  const rows = await prisma.merchantMembership.findMany({
    where: { merchantAdminId: adminId, status: 'ACTIVE' },
    select: {
      id: true, merchantId: true, merchantAdminId: true, role: true, allBranches: true, canManageVouchers: true,
      merchant: { select: { status: true, businessName: true } },
      branches: { select: { branchId: true } },
    },
    take: 2,
  })
  if (rows.length === 0) return null
  if (rows.length > 1) throw new AppError('MULTI_MEMBERSHIP_UNSUPPORTED')
  const r = rows[0]
  return {
    id: r.id, merchantId: r.merchantId, merchantAdminId: r.merchantAdminId,
    role: r.role as ActiveMembership['role'], allBranches: r.allBranches, canManageVouchers: r.canManageVouchers,
    allowedBranchIds: r.branches.map((b) => b.branchId), merchant: r.merchant,
  }
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
