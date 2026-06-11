import { PrismaClient } from '../../../../generated/prisma/client'
import type { Redis } from 'ioredis'
import { AppError } from '../../shared/errors'
import { writeAuditLogTx } from '../../shared/audit'
import { RedisKey } from '../../shared/redis-keys'
import { revokeAllSessionsForEntity, revokeAllUserSessionRecords } from '../../shared/session'

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
