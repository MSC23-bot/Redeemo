import { PrismaClient } from '../../../../generated/prisma/client'
import type { MerchantStatus } from '../../../../generated/prisma/enums'
import type { Redis } from 'ioredis'
import { AppError } from '../../shared/errors'
import { writeAuditLogTx } from '../../shared/audit'
import { RedisKey } from '../../shared/redis-keys'
import { revokeAllSessionsForEntity, revokeAllUserSessionRecords } from '../../shared/session'

// ── WP2 — admin merchants directory (read-only list + search) ────────────────

export interface ListMerchantsFilters {
  q?: string
  status?: MerchantStatus
  page?: number
  pageSize?: number
}

/**
 * List merchants for the admin directory (admin follow-up WP2). Paginated +
 * filterable by status and a case-insensitive name search (businessName OR
 * tradingName), ordered newest-first.
 *
 * REDACTION: the select is deliberately tight — id, names, lifecycle status,
 * verification, onboarding step, logo, createdAt, and the primary category name
 * only. NO secrets are selected. `redemptionPin` lives on Branch (never on
 * Merchant) and branches are not joined here, so no branch secret can leak; the
 * owner's password fields live on MerchantAdmin and are never selected. The
 * primaryCategory relation is flattened to a `category` string so the wire shape
 * exposes only the category name, nothing else from the Category row.
 */
export async function listMerchants(prisma: PrismaClient, filters: ListMerchantsFilters) {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20))

  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q
      ? {
          OR: [
            { businessName: { contains: filters.q, mode: 'insensitive' as const } },
            { tradingName: { contains: filters.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.merchant.count({ where }),
    prisma.merchant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        businessName: true,
        tradingName: true,
        status: true,
        verificationStatus: true,
        onboardingStep: true,
        logoUrl: true,
        createdAt: true,
        primaryCategory: { select: { name: true } },
        _count: { select: { branches: true } },
        // redemptionPin lives on Branch and is NEVER selected here.
        // owner password fields live on MerchantAdmin and are NEVER selected.
      },
    }),
  ])

  const merchants = rows.map((m) => {
    const { primaryCategory, _count, ...rest } = m
    return {
      ...rest,
      category: primaryCategory?.name ?? null,
      branchCount: _count.branches,
    }
  })

  return { page, pageSize, total, merchants }
}

/**
 * Option B B2.1-read: single merchant detail for the admin edit page (B2.1-web).
 * Returns the merchant identity/status summary + the editable `websiteUrl`, plus
 * each non-soft-deleted branch's display fields + the B2.1-editable contact set
 * (phone/email/websiteUrl/isActive).
 *
 * REDACTION: TIGHT explicit selects only. Branches ARE joined here (unlike
 * listMerchants), so the branch select is an allow-list that NEVER includes
 * `redemptionPin` (the AES-encrypted PIN) or other branch secrets/asset URLs
 * (logoUrl/bannerUrl/priceListUrl/about). The merchant registered-identity
 * fields (vatNumber/companyNumber) ARE returned read-only (B2.2) so an admin can
 * understand the record; editing them is gated by the SUPER_ADMIN-only
 * `merchant:edit-identity` capability on PATCH /:id/identity, NOT this read. No
 * MerchantAdmin/owner-password join; no tokens / raw storage keys / document
 * paths. Soft-deleted branches (deletedAt != null) are excluded.
 *
 * B2.3-read adds `primaryCategoryId` (the id, alongside the display `category`
 * name) so the admin category editor can preselect, and `categoryLocked` (true
 * when the merchant has any RMV in PENDING_APPROVAL/ACTIVE) so the UI can show a
 * locked state WITHOUT a failed edit attempt. `categoryLocked` is exactly the
 * `handleCategoryChange` CATEGORY_CHANGE_BLOCKED condition.
 */
export async function getMerchantDetail(prisma: PrismaClient, merchantId: string) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: {
      id: true,
      businessName: true,
      tradingName: true,
      status: true,
      verificationStatus: true,
      onboardingStep: true,
      websiteUrl: true,
      // B2.2: registered-identity fields, read-only on this merchant:read payload.
      vatNumber: true,
      companyNumber: true,
      // B2.3-read: the category id (for preselection) alongside the display name.
      primaryCategoryId: true,
      // B2.5: the SENSITIVE description, read-only here so the propose dialog can
      // prefill it. Editing it post-go-live routes through the B1 pending-edit lane.
      description: true,
      logoUrl: true,
      primaryCategory: { select: { name: true } },
      branches: {
        where: { deletedAt: null },
        orderBy: [{ isMainBranch: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          isMainBranch: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          postcode: true,
          localityName: true,
          locationConfidence: true,
          // B2.1-editable contact fields (the shipped PATCH allow-list):
          phone: true,
          email: true,
          websiteUrl: true,
          isActive: true,
          // redemptionPin (AES-encrypted) is NEVER selected.
        },
      },
    },
  })
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')

  // B2.3-read: category is locked once any RMV is submitted/live. This is the
  // exact condition handleCategoryChange uses to throw CATEGORY_CHANGE_BLOCKED,
  // surfaced here so the UI shows a locked state instead of a failed round-trip.
  const blockingRmvCount = await prisma.voucher.count({
    where: { merchantId, isRmv: true, status: { in: ['PENDING_APPROVAL', 'ACTIVE'] } },
  })

  // B2.5: whether a SENSITIVE identity edit is already awaiting review (one
  // pending edit per merchant). Surfaced so the admin UI disables the propose
  // affordance instead of a failed PENDING_EDIT_EXISTS round-trip.
  const pendingIdentityEdit = await prisma.merchantPendingEdit.findFirst({
    where: { merchantId, status: 'PENDING' }, select: { id: true },
  })

  const { primaryCategory, branches, ...rest } = merchant
  return {
    merchant: {
      ...rest,
      category: primaryCategory?.name ?? null,
      categoryLocked: blockingRmvCount > 0,
      hasPendingIdentityEdit: pendingIdentityEdit !== null,
    },
    branches,
  }
}

/**
 * B2.3-read: the categories an admin can assign as a merchant's primaryCategoryId.
 * `eligible = (active RMV templates >= 2)` mirrors the provisioning constraint
 * (the category-set/change path throws NO_RMV_TEMPLATE for a category with < 2
 * active templates), so the picker can disable ineligible categories. Top-level
 * active categories only (parentId: null), matching the set the merchant
 * onboarding category picker offers. Gated `merchant:read` at the route.
 */
export async function listAdminCategories(prisma: PrismaClient) {
  const cats = await prisma.category.findMany({
    where: { parentId: null, isActive: true },
    select: {
      id: true,
      name: true,
      parentId: true,
      sortOrder: true,
      _count: { select: { rmvTemplates: { where: { isActive: true } } } },
    },
    orderBy: { sortOrder: 'asc' },
  })
  return {
    categories: cats.map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      eligible: c._count.rmvTemplates >= 2,
    })),
  }
}

export interface CreateMerchantDraftInput {
  businessName: string
  tradingName?: string
  ownerEmail: string
  ownerFirstName: string
  ownerLastName: string
  jobTitle?: string
}

export interface CreateMerchantDraftResult {
  merchantId: string
  ownerAdminId: string
  ownerEmail: string
  // The owner sets their password via the existing password-reset flow; the
  // admin never receives a password or token. This flag tells the caller the
  // draft owner still needs to claim their account.
  passwordSetupRequired: true
}

/**
 * Create a merchant DRAFT on an admin's behalf (Phase 2 Slice 1 M2, D-3).
 *
 * One transaction creates the Merchant (defaults to status REGISTERED /
 * verificationStatus NOT_SUBMITTED / onboardingStep REGISTERED), the owner
 * MerchantAdmin (no password — `mustChangePassword: true`), and the first
 * OWNER MerchantMembership, then writes the transactional audit. The owner
 * claims the account later via password-reset (no admin-known password/token).
 */
export async function createMerchantDraft(
  prisma: PrismaClient,
  adminId: string,
  input: CreateMerchantDraftInput,
  ctx: { ipAddress: string; userAgent: string }
): Promise<CreateMerchantDraftResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.merchantAdmin.findUnique({
      where: { email: input.ownerEmail },
      select: { id: true },
    })
    if (existing) throw new AppError('EMAIL_ALREADY_EXISTS')

    const merchant = await tx.merchant.create({
      data: {
        businessName: input.businessName,
        tradingName: input.tradingName,
        status: 'REGISTERED',
      },
      select: { id: true },
    })

    const admin = await tx.merchantAdmin.create({
      data: {
        // M6b (D-1): MerchantAdmin.merchantId is dropped — the OWNER membership
        // created just below is the sole link from this admin to the merchant.
        email: input.ownerEmail,
        firstName: input.ownerFirstName,
        lastName: input.ownerLastName,
        jobTitle: input.jobTitle,
        mustChangePassword: true,
        // passwordHash intentionally omitted — set by the owner via reset flow.
      },
      select: { id: true },
    })

    const membership = await tx.merchantMembership.create({
      data: {
        merchantId: merchant.id,
        merchantAdminId: admin.id,
        role: 'OWNER',
        allBranches: true,
        status: 'ACTIVE',
      },
      select: { id: true },
    })

    await writeAuditLogTx(tx, {
      entityId: merchant.id,
      entityType: 'merchant',
      event: 'MERCHANT_DRAFT_CREATED',
      actorId: adminId,
      actorType: 'ADMIN',
      after: { merchantId: merchant.id, ownerAdminId: admin.id, ownerEmail: input.ownerEmail },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    await writeAuditLogTx(tx, {
      entityId: merchant.id,
      entityType: 'merchant',
      event: 'MEMBERSHIP_CREATED',
      actorId: adminId,
      actorType: 'ADMIN',
      after: { membershipId: membership.id, role: 'OWNER', merchantAdminId: admin.id },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return {
      merchantId: merchant.id,
      ownerAdminId: admin.id,
      ownerEmail: input.ownerEmail,
      passwordSetupRequired: true as const,
    }
  }).catch((e) => {
    // P2002: a concurrent createMerchantDraft raced past the findUnique pre-check
    // on the unique `email`. Map the unique-constraint violation to the same
    // friendly 409 the pre-check returns, instead of an unhandled 500.
    if ((e as { code?: string })?.code === 'P2002') throw new AppError('EMAIL_ALREADY_EXISTS')
    throw e
  })
}

// ── Phase 2 Slice 1 M6a — admin suspend / reactivate ────────────────────────

type AuditCtx = { ipAddress: string; userAgent: string }

/**
 * Revoke every cached session for a merchant — its ACTIVE members (OWNER admins)
 * AND every branch user of its branches. Reuses the branch-user-deactivate
 * precedent: delete the Redis `auth:*` snapshot + the `refresh:*` tokens + mark
 * the DB session records revoked. Best-effort: called AFTER the suspend commits;
 * a failure here must not un-suspend the merchant (the status flip is the safety).
 */
async function revokeMerchantSessions(prisma: PrismaClient, redis: Redis, merchantId: string): Promise<void> {
  const members = await prisma.merchantMembership.findMany({
    where: { merchantId, status: 'ACTIVE' },
    select: { merchantAdminId: true },
  })
  for (const m of members) {
    await revokeAllSessionsForEntity(redis, { role: 'merchant', entityId: m.merchantAdminId })
    await revokeAllUserSessionRecords(prisma, { entityId: m.merchantAdminId, entityType: 'merchant', reason: 'MERCHANT_SUSPENDED' })
    await redis.del(RedisKey.authMerchant(m.merchantAdminId))
  }

  const branchUsers = await prisma.branchUser.findMany({
    where: { branch: { merchantId } },
    select: { id: true },
  })
  for (const bu of branchUsers) {
    await revokeAllSessionsForEntity(redis, { role: 'branch', entityId: bu.id })
    await revokeAllUserSessionRecords(prisma, { entityId: bu.id, entityType: 'branch', reason: 'MERCHANT_SUSPENDED' })
    await redis.del(RedisKey.authBranch(bu.id))
  }
}

/**
 * D-α cycle-refund (suspend-time sweep). When a merchant is suspended, an
 * in-flight (un-validated) redemption can no longer be validated (its staff
 * session is revoked + SEC-M1 blocks verify), so the customer should not stay
 * penalised for having consumed their voucher cycle. For each NORMAL-type
 * in-flight redemption we reset the consumed per-cycle flag
 * (`UserVoucherCycleState.isRedeemedInCurrentCycle → false`).
 *
 * The `newer` guard skips a redemption that has been SUPERSEDED — if a later
 * redemption for the same (user, voucher) exists, IT owns the cycle-state (the
 * user redeemed again, e.g. across a cycle rollover), so we must NOT un-do that
 * newer, legitimate consumption. Only the latest in-flight redemption resets.
 *
 * Scope note (finding-2): we do NOT recompute the user's exact subscription
 * cycle window here. That's intentional + safe — the redeem-time gate is
 * `cycleState.cycleStartDate >= currentCycleStart`, so a stale OLD-cycle flag
 * never blocks a NEW cycle anyway; resetting it is at worst a harmless no-op.
 * The common case (suspend with recent in-flight redemptions) IS current-cycle.
 *
 * SCOPE: TIME_LIMITED + REUSABLE vouchers are EXCLUDED — they bypass
 * `UserVoucherCycleState` (their truth is the window-occurrence / cooldown on
 * the redemption row), so touching the per-cycle flag would be meaningless.
 * Their in-flight-on-suspend handling is a separate follow-up (reported).
 * Best-effort: runs after the suspend commits.
 */
async function refundInflightCycles(prisma: PrismaClient, merchantId: string): Promise<void> {
  const inflight = await prisma.voucherRedemption.findMany({
    where: {
      isValidated: false,
      voucher: { merchantId, type: { notIn: ['TIME_LIMITED', 'REUSABLE'] } },
    },
    select: { userId: true, voucherId: true, redeemedAt: true },
  })
  for (const r of inflight) {
    // Skip if a newer redemption for this (user, voucher) owns the cycle-state
    // (cycle rolled over + the user redeemed again) — don't un-do that one.
    const newer = await prisma.voucherRedemption.count({
      where: { userId: r.userId, voucherId: r.voucherId, redeemedAt: { gt: r.redeemedAt } },
    })
    if (newer > 0) continue
    await prisma.userVoucherCycleState.updateMany({
      where: { userId: r.userId, voucherId: r.voucherId, isRedeemedInCurrentCycle: true },
      data: { isRedeemedInCurrentCycle: false },
    })
  }
}

/**
 * Admin suspend a merchant (Phase 2 Slice 1 M6a, spec §7). One transaction flips
 * `status→SUSPENDED` / `onboardingStep→SUSPENDED` + writes a transactional
 * `MERCHANT_SUSPENDED` audit (actor, reason, before/after). After commit
 * (best-effort): revoke all owner + branch-user sessions, and sweep in-flight
 * redemptions' cycle-state (D-α). Idempotent: an already-SUSPENDED merchant is a
 * no-op. Discovery already hides a non-ACTIVE merchant (live query) — no cache
 * invalidation needed.
 */
export async function suspendMerchant(
  prisma: PrismaClient,
  redis: Redis,
  adminId: string,
  merchantId: string,
  reason: string,
  ctx: AuditCtx
): Promise<{ suspended: true; alreadySuspended: boolean }> {
  const result = await prisma.$transaction(async (tx) => {
    const merchant = await tx.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, status: true, onboardingStep: true },
    })
    if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')
    if (merchant.status === 'SUSPENDED') return { alreadySuspended: true as const }

    await tx.merchant.update({
      where: { id: merchantId },
      data: { status: 'SUSPENDED', onboardingStep: 'SUSPENDED' },
    })
    await writeAuditLogTx(tx, {
      entityId: merchantId,
      entityType: 'merchant',
      event: 'MERCHANT_SUSPENDED',
      actorId: adminId,
      actorType: 'ADMIN',
      reason,
      before: { status: merchant.status, onboardingStep: merchant.onboardingStep },
      after: { status: 'SUSPENDED', onboardingStep: 'SUSPENDED' },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return { alreadySuspended: false as const }
  })

  if (result.alreadySuspended) return { suspended: true, alreadySuspended: true }

  // After commit (best-effort): a failure here must not un-suspend the merchant.
  try {
    await revokeMerchantSessions(prisma, redis, merchantId)
  } catch (err) {
    console.warn(`[suspend] session revocation failed for merchant ${merchantId} (merchant IS suspended):`, err)
  }
  try {
    await refundInflightCycles(prisma, merchantId)
  } catch (err) {
    console.warn(`[suspend] cycle-refund sweep failed for merchant ${merchantId} (merchant IS suspended):`, err)
  }
  return { suspended: true, alreadySuspended: false }
}

/**
 * Admin reactivate a SUSPENDED merchant → `status→ACTIVE` / `onboardingStep→LIVE`
 * + `MERCHANT_REACTIVATED` audit. Only acts on a SUSPENDED merchant (never force-
 * activates a non-approved one); an already-ACTIVE merchant is a no-op.
 */
export async function reactivateMerchant(
  prisma: PrismaClient,
  adminId: string,
  merchantId: string,
  ctx: AuditCtx
): Promise<{ reactivated: true; alreadyActive: boolean }> {
  return prisma.$transaction(async (tx) => {
    const merchant = await tx.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, status: true, onboardingStep: true },
    })
    if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')
    // Idempotent: an already-ACTIVE merchant is a no-op (reactivating twice is safe).
    if (merchant.status === 'ACTIVE') return { reactivated: true as const, alreadyActive: true }
    // Reactivate is the strict reverse of suspend — it only acts on a SUSPENDED
    // merchant. For any other state (INACTIVE self-deactivation, REGISTERED,
    // PENDING_APPROVAL, …) refuse with a CLEAR error rather than the misleading
    // MERCHANT_NOT_FOUND — and never force-activate a non-approved merchant.
    if (merchant.status !== 'SUSPENDED') throw new AppError('MERCHANT_NOT_SUSPENDED')

    await tx.merchant.update({
      where: { id: merchantId },
      data: { status: 'ACTIVE', onboardingStep: 'LIVE' },
    })
    await writeAuditLogTx(tx, {
      entityId: merchantId,
      entityType: 'merchant',
      event: 'MERCHANT_REACTIVATED',
      actorId: adminId,
      actorType: 'ADMIN',
      before: { status: merchant.status, onboardingStep: merchant.onboardingStep },
      after: { status: 'ACTIVE', onboardingStep: 'LIVE' },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return { reactivated: true as const, alreadyActive: false }
  })
}
