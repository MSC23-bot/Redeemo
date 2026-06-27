import { AppError } from '../../shared/errors'
import type { MerchantContext } from '../shared'

// Insights PR-A Task A2: authorization + lifecycle (spec 7.2/7.3).
//
// These helpers gate every /api/v1/merchant/insights/* endpoint AFTER
// resolveMerchantContext (which resolves merchantId + role + branch scope from
// the session and hard-blocks a SUSPENDED merchant via MERCHANT_SUSPENDED). They
// add the two Insights-specific rules: a server-side Staff deny and an
// ACTIVE-only lifecycle gate. The frontend nav exclusion is UX only; it is never
// the authorization boundary.

/**
 * Branch scope for Insights queries (the scopeBranchIds precedent in
 * src/api/merchant/redemptions/routes.ts:11-13). null means "all of THIS
 * merchant's branches" and is legitimate for OWNER and for an all-branches
 * BRANCH_MANAGER (allBranches=true). When allBranches=false the read is
 * restricted to allowedBranchIds; an empty allowedBranchIds therefore fails
 * closed (no rows), and is never widened. The merchant tenant boundary
 * (branch.merchantId = ctx.merchantId) is always applied at the WHERE level, so
 * a null scope never means cross-tenant.
 */
export function insightsScope(ctx: MerchantContext): string[] | null {
  return ctx.allBranches ? null : ctx.allowedBranchIds
}

/**
 * Server-side Staff deny (spec 7.2). STAFF is denied with INSUFFICIENT_PERMISSIONS
 * independent of the nav. OWNER and BRANCH_MANAGER pass.
 */
export function assertInsightsAccess(ctx: MerchantContext): void {
  if (ctx.role === 'STAFF') throw new AppError('INSUFFICIENT_PERMISSIONS')
}

/**
 * Active-merchant gate (spec 7.2, SEC-M2 preserved). Selects merchant.status and
 * throws the single typed MERCHANT_NOT_ACTIVE unless status === 'ACTIVE'. This
 * blocks REGISTERED / PENDING_APPROVAL / INACTIVE / DELETED and a missing merchant
 * at the server (SUSPENDED is already blocked earlier by resolveMerchantContext's
 * MERCHANT_SUSPENDED). prisma is typed loosely (a minimal structural type) so this
 * is unit-testable with a mock.
 */
export async function assertMerchantActive(
  prisma: { merchant: { findUnique: (args: any) => Promise<{ status: string } | null> } },
  merchantId: string
): Promise<void> {
  const row = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { status: true },
  })
  if (row?.status !== 'ACTIVE') throw new AppError('MERCHANT_NOT_ACTIVE')
}
