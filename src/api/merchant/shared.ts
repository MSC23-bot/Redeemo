import { PrismaClient } from '../../../generated/prisma/client'
import type { MerchantStatus } from '../../../generated/prisma/enums'
import { AppError } from '../shared/errors'
import { getOwnerMembership, getActiveMembership } from '../shared/merchantMembership'

// Option B B2.1: who is performing a direct profile/branch edit. The shared
// `fnCore` helpers take this so the merchant route ({ type: 'MERCHANT_ADMIN' })
// and the new admin route ({ type: 'ADMIN', reason }) run the SAME
// validation/apply/audit path (no weaker path). `reason` is required on the
// ADMIN path (the admin routes enforce a non-empty reason) and absent on the
// merchant path.
export type EditActor = { type: 'MERCHANT_ADMIN' | 'ADMIN'; id: string; reason?: string }

/**
 * M2 B1 (D1): the lifecycle "draft window" predicate. While a merchant
 * application is being set up (`status REGISTERED`) OR an admin has asked for
 * changes during onboarding (`onboardingStep NEEDS_CHANGES`, which sits on
 * `status PENDING_APPROVAL`), sensitive identity fields write DIRECTLY (no admin
 * edit-request round-trip). Once SUBMITTED / UNDER_REVIEW (view-only) or live
 * (APPROVED / LIVE / ACTIVE), the governed edit-request lane is the path again.
 *
 * Confirmed against the lifecycle projection (spec section 4.1) + the enums:
 * `MerchantStatus` carries REGISTERED / PENDING_APPROVAL / ACTIVE / ...; the
 * SUBMITTED / UNDER_REVIEW / NEEDS_CHANGES / LIVE / REJECTED states live on
 * `OnboardingStep`. SUBMITTED / UNDER_REVIEW are intentionally NOT in the draft
 * window (B1 does not add new locking there; their direct-edit refusal stays via
 * the existing edit-request lane).
 *
 * Shaped as a single clean predicate so the day-2 edit tiering (e.g.
 * `description` -> instant when live) drops in as a separate, field-aware refinement
 * later. B1 does NOT build day-2 tiering.
 */
export function isDraftWindow(merchant: {
  status: string | null | undefined
  onboardingStep: string | null | undefined
}): boolean {
  return merchant.status === 'REGISTERED' || merchant.onboardingStep === 'NEEDS_CHANGES'
}

/**
 * M2 B2 (D3/D5): the category parent-walk. The merchant identity write stores
 * `Merchant.primaryCategoryId` at the SUBCATEGORY level (so the customer
 * `buildDescriptor` composes "Indian Restaurant" correctly), but RMV templates +
 * eligibility live at the TOP-LEVEL category. This resolves a category id to its
 * top-level parent (`parentId`), returning a TOP-LEVEL id unchanged (parentId
 * null -> the id itself).
 *
 * LENIENT by design: if the row is missing (or `prisma.category` is unavailable in
 * a bare test mock), it falls back to the passed id. A genuinely missing template
 * is then caught downstream by the existing NO_RMV_TEMPLATE guard, NOT by a crash
 * here. This keeps the admin category path (which passes a top-level id and does
 * not always mock `category.findUnique`) working unchanged after B2.
 *
 * Used by BOTH the identity write (to validate/lookup) and the auto-provisioning
 * (so first-time-set + category-change template lookups query the top-level
 * parent, not the subcategory). Placed in shared.ts alongside B1's isDraftWindow.
 */
export async function resolveTopLevelCategoryId(
  prisma: Pick<PrismaClient, 'category'> | { category?: { findUnique?: Function } },
  categoryId: string
): Promise<string> {
  const findUnique = (prisma as any)?.category?.findUnique
  if (typeof findUnique !== 'function') return categoryId
  const row = await findUnique.call((prisma as any).category, {
    where: { id: categoryId },
    select: { parentId: true },
  })
  if (!row) return categoryId
  return row.parentId ?? categoryId
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Staff & Access (v1) PR-A — role-aware resolver + guards (§4.1, §4.2).
//
// `resolveAdminMerchant` (above) is left BYTE-UNCHANGED: it resolves the OWNER
// membership only and denies non-owners by construction (the safe-default-deny
// pattern). Routes that intentionally admit non-owners migrate to
// `resolveMerchantContext` + an explicit guard in PR-B. In PR-A nothing consumes
// these yet (no route migrated, non-owner login NOT live), so adding them cannot
// change any live behaviour.
// ─────────────────────────────────────────────────────────────────────────────

export type MerchantContext = {
  adminId: string
  merchantId: string
  role: 'OWNER' | 'BRANCH_MANAGER' | 'STAFF'
  allBranches: boolean
  allowedBranchIds: string[]
  canManageVouchers: boolean
}

/** Role-aware resolver for routes that intentionally admit non-owners (§4.1). Keeps the SEC-M2 suspended guard. */
export async function resolveMerchantContext(prisma: PrismaClient, adminId: string): Promise<MerchantContext> {
  const m = await getActiveMembership(prisma, adminId)
  if (!m) throw new AppError('INVALID_CREDENTIALS')
  if (m.merchant?.status === 'SUSPENDED') throw new AppError('MERCHANT_SUSPENDED')
  return {
    adminId, merchantId: m.merchantId, role: m.role, allBranches: m.allBranches,
    allowedBranchIds: m.allowedBranchIds, canManageVouchers: m.role === 'OWNER' || m.canManageVouchers,
  }
}

export function assertOwner(ctx: MerchantContext): void {
  if (ctx.role !== 'OWNER') throw new AppError('INSUFFICIENT_PERMISSIONS')
}
export function assertCanManageVouchers(ctx: MerchantContext): void {
  if (!(ctx.role === 'OWNER' || ctx.canManageVouchers)) throw new AppError('INSUFFICIENT_PERMISSIONS')
}
export function assertBranchAllowed(ctx: MerchantContext, branchId: string): void {
  if (!(ctx.allBranches || ctx.allowedBranchIds.includes(branchId))) throw new AppError('INSUFFICIENT_PERMISSIONS')
}
