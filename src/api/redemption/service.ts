import { PrismaClient, Prisma, MerchantStatus, VoucherStatus, ApprovalStatus } from '../../../generated/prisma/client'
import type Redis from 'ioredis'
import crypto from 'crypto'
import { AppError } from '../shared/errors'
import { decrypt } from '../shared/encryption'
import { writeAuditLog } from '../shared/audit'
import { RedisKey } from '../shared/redis-keys'
import { getCurrentCycleWindow } from '../subscription/cycle'

const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

function generateRedemptionCode(length = 10): string {
  const bytes = crypto.randomBytes(length)
  let code = ''
  for (let i = 0; i < length; i++) {
    code += ALPHANUMERIC[bytes[i] % ALPHANUMERIC.length]
  }
  return code
}

const PIN_FAIL_LIMIT = 5
const PIN_FAIL_WINDOW = 15 * 60 // 15 minutes in seconds

interface RequestCtx { ipAddress: string; userAgent: string }

export interface VerifyActor {
  role: 'branch' | 'merchant'
  branchId: string | null
  merchantId: string
  actorId: string
}

export async function createRedemption(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
  data: { voucherId: string; branchId: string; pin: string },
  ctx: RequestCtx
) {
  // PIN-oracle defense: every eligibility gate runs BEFORE PIN comparison.
  // An attacker probing PINs against an ineligible voucher/branch must NOT
  // be able to distinguish "wrong PIN" (INVALID_PIN) from "right PIN, but
  // ineligible" (eligibility error). All eligibility checks below precede
  // the PIN-compare step at line ~120.
  //
  // See docs/superpowers/plans/2026-05-06-voucher-detail-m2.md §Threat model.
  const now = new Date()

  // 1. Voucher must exist + ACTIVE + APPROVED + merchant ACTIVE
  const voucher = await prisma.voucher.findUnique({
    where: { id: data.voucherId },
    include: { merchant: { select: { id: true, status: true } } },
  })
  if (
    !voucher ||
    voucher.status !== VoucherStatus.ACTIVE ||
    voucher.approvalStatus !== ApprovalStatus.APPROVED ||
    voucher.merchant.status !== MerchantStatus.ACTIVE
  ) {
    throw new AppError('VOUCHER_NOT_FOUND')
  }

  // 2. Voucher not expired — server-side eligibility, not a UI concern.
  //    Collapse expired into VOUCHER_NOT_FOUND so an attacker cannot
  //    distinguish "voucher does not exist" vs "voucher expired" via the
  //    error response. A leaked PIN must not be redeemable against an
  //    expired voucher even if the customer-app UI is bypassed.
  if (voucher.expiryDate && voucher.expiryDate.getTime() <= now.getTime()) {
    throw new AppError('VOUCHER_NOT_FOUND')
  }

  // 3. Branch exists + isActive — server-side eligibility. A branch the
  //    merchant has deactivated must not accept redemptions even if the
  //    branch PIN is known. Wraps both "no such branch" and "branch
  //    deactivated" under BRANCH_UNAVAILABLE so neither state is
  //    distinguishable from the other.
  const branch = await prisma.branch.findUnique({ where: { id: data.branchId } })
  if (!branch || !branch.isActive) {
    throw new AppError('BRANCH_UNAVAILABLE')
  }

  // 4. Branch belongs to voucher's merchant
  if (branch.merchantId !== voucher.merchantId) {
    throw new AppError('BRANCH_MERCHANT_MISMATCH')
  }

  // 5. Subscription guard
  const sub = await prisma.subscription.findUnique({ where: { userId } })
  if (!sub || !['ACTIVE', 'TRIALLING'].includes(sub.status)) {
    throw new AppError('SUBSCRIPTION_REQUIRED')
  }

  // 6. Phone-verified guard — required since phone verification is part of
  //    app onboarding (website users may still have unverified phones, but
  //    they cannot redeem because redemption is mobile-only anyway).
  const userRow = await prisma.user.findUnique({
    where: { id: userId },
    select: { phoneVerified: true },
  })
  if (!userRow || !userRow.phoneVerified) {
    throw new AppError('PHONE_NOT_VERIFIED')
  }

  // 7. Subscription-anchored cycle guard (fast-fail eligibility — closes
  //    PIN oracle by rejecting already-redeemed users BEFORE PIN compare).
  //    Defense in depth: Task A5's transactional claim re-checks under
  //    isolation to defend against the post-PIN race.
  //    Uses cycleAnchorDate as the single source of truth for monthly
  //    cycle windows. Independent of billing interval (monthly/annual)
  //    and payment source (Stripe, Apple IAP, Google Play, admin-grant).
  const { cycleStart } = getCurrentCycleWindow(sub.cycleAnchorDate, now)

  const cycleState = await prisma.userVoucherCycleState.findUnique({
    where: { userId_voucherId: { userId, voucherId: data.voucherId } },
  })

  // If stored cycleStartDate is from a previous cycle, this is a fresh cycle — allow.
  // If stored cycleStartDate matches the current cycle and already redeemed — block.
  const isCurrentCycle = cycleState != null && cycleState.cycleStartDate >= cycleStart
  if (isCurrentCycle && cycleState.isRedeemedInCurrentCycle) {
    throw new AppError('ALREADY_REDEEMED')
  }

  // 8. Branch PIN configured (no leak — eligibility already passed)
  if (!branch.redemptionPin) {
    throw new AppError('PIN_NOT_CONFIGURED')
  }

  // 9. Rate limit — protects ONLY the PIN compare step below
  const failKey = RedisKey.pinFailCount(userId, data.branchId)
  const failCount = await redis.get(failKey)
  if (failCount !== null && parseInt(failCount, 10) >= PIN_FAIL_LIMIT) {
    // Surface the precise lockout window remaining to the customer-app so
    // PinEntrySheet can render an authoritative mm:ss countdown. Redis
    // returns -1 (key has no TTL) or -2 (key missing) on edge cases —
    // fall back to the full PIN_FAIL_WINDOW so the UI never displays a
    // negative or stuck timer.
    const ttl = await redis.ttl(failKey)
    const retryAfter = ttl > 0 ? ttl : PIN_FAIL_WINDOW
    throw new AppError('PIN_RATE_LIMIT_EXCEEDED', { retryAfter })
  }

  // 10. Timing-safe PIN comparison
  let pinMatches = false
  try {
    const decrypted = decrypt(branch.redemptionPin)
    if (decrypted.length !== data.pin.length) {
      pinMatches = false
    } else {
      const pinBuffer = Buffer.from(data.pin, 'utf8')
      const decBuffer = Buffer.from(decrypted, 'utf8')
      pinMatches = crypto.timingSafeEqual(pinBuffer, decBuffer)
    }
  } catch {
    pinMatches = false
  }

  if (!pinMatches) {
    const newCount = await redis.incr(failKey)
    await redis.expire(failKey, PIN_FAIL_WINDOW)
    // Surface remainingAttempts to the customer-app so the lockout-counter
    // UI can show authoritative "X attempts remaining" copy. Clamped at 0
    // — a counter overshoot (from a race or a stale Redis state) never
    // produces a negative number.
    const remainingAttempts = Math.max(0, PIN_FAIL_LIMIT - newCount)
    throw new AppError('INVALID_PIN', { remainingAttempts })
  }

  // 11. Atomic write — race-safe conditional claim.
  //
  // Two concurrent createRedemption calls for the same (userId, voucherId)
  // can both pass the pre-PIN cycle check at step 7 (which reads cycle
  // state without a row lock). Without the conditional claim below, both
  // would write VoucherRedemption rows and the upsert would silently let
  // both succeed — duplicate redemption rows, double branch attribution,
  // inflated merchant analytics.
  //
  // Defense: use the existing @@unique([userId, voucherId]) on
  // UserVoucherCycleState as a single-row claim point. Only ONE racing
  // request can claim the row for the current cycle:
  //   1. Conditional updateMany — succeeds only if the row is from an
  //      older cycle (stale, can be reclaimed) or current cycle but not
  //      yet redeemed.
  //   2. If count === 0, no matching row → try create. P2002 means a
  //      concurrent winner created the row between updateMany and create;
  //      retry the conditional updateMany once.
  //   3. If still unclaimable, throw ALREADY_REDEEMED — race lost.
  //   4. Only AFTER cycle-state is claimed, write the VoucherRedemption.
  const redemptionCode = generateRedemptionCode()

  const redemption = await prisma.$transaction(async (tx) => {
    // Step 1: Conditional claim.
    const claimWhere = {
      userId,
      voucherId: data.voucherId,
      OR: [
        { cycleStartDate: { lt: cycleStart } },           // stale, can be reclaimed
        { isRedeemedInCurrentCycle: false },               // current cycle, not yet claimed
      ],
    }
    const claimData = {
      cycleStartDate:           cycleStart,
      isRedeemedInCurrentCycle: true,
      lastRedeemedAt:           now,
    }

    const updated = await tx.userVoucherCycleState.updateMany({
      where: claimWhere,
      data:  claimData,
    })

    let claimed = updated.count === 1

    if (!claimed) {
      // Step 2: No matching row — try create.
      try {
        await tx.userVoucherCycleState.create({
          data: {
            userId,
            voucherId: data.voucherId,
            cycleStartDate:           cycleStart,
            isRedeemedInCurrentCycle: true,
            lastRedeemedAt:           now,
          },
        })
        claimed = true
      } catch (err: any) {
        // P2002 = unique constraint violation; concurrent winner created
        // the row between our updateMany and our create. Retry once.
        if (err?.code === 'P2002') {
          const retried = await tx.userVoucherCycleState.updateMany({
            where: claimWhere,
            data:  claimData,
          })
          claimed = retried.count === 1
        } else {
          throw err
        }
      }
    }

    if (!claimed) {
      // Step 3: Race lost — concurrent winner already redeemed for the
      // current cycle. The pre-PIN check at step 7 missed it because the
      // row was claimed AFTER our read but BEFORE our write attempt.
      throw new AppError('ALREADY_REDEEMED')
    }

    // Step 4: Cycle state is claimed; safe to create the redemption record.
    return tx.voucherRedemption.create({
      data: {
        userId,
        voucherId:       data.voucherId,
        branchId:        data.branchId,
        redemptionCode,
        estimatedSaving: voucher.estimatedSaving,
        isValidated:     false,
        redeemedAt:      now,
      },
    })
  })

  // 9. Reset fail counter on success
  await redis.del(failKey)

  writeAuditLog(prisma, {
    entityId: userId, entityType: 'customer',
    event: 'VOUCHER_REDEEMED',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { voucherId: data.voucherId, branchId: data.branchId, redemptionCode },
  })

  return { ...redemption, estimatedSaving: Number(redemption.estimatedSaving) }
}

export async function verifyRedemption(
  prisma: PrismaClient,
  code: string,
  method: 'QR_SCAN' | 'MANUAL',
  actor: VerifyActor,
  ctx: RequestCtx
) {
  const redemption = await prisma.voucherRedemption.findUnique({
    where: { redemptionCode: code },
    include: {
      voucher: { select: { merchantId: true } },
      user:    { select: { firstName: true, lastName: true } },
    },
  })

  if (!redemption) throw new AppError('REDEMPTION_NOT_FOUND')
  if (redemption.isValidated) throw new AppError('ALREADY_VALIDATED')

  if (actor.role === 'branch') {
    if (redemption.branchId !== actor.branchId) throw new AppError('BRANCH_ACCESS_DENIED')
  } else {
    if (redemption.voucher.merchantId !== actor.merchantId) throw new AppError('MERCHANT_MISMATCH')
  }

  const updated = await prisma.voucherRedemption.update({
    where: { id: redemption.id },
    data: {
      isValidated:      true,
      validatedAt:      new Date(),
      validationMethod: method,
      validatedById:    actor.actorId,
    },
  })

  writeAuditLog(prisma, {
    entityId: redemption.userId, entityType: 'customer',
    event: 'VOUCHER_VERIFIED',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { redemptionCode: code, method, actorId: actor.actorId },
  })

  return {
    id:               updated.id,
    isValidated:      updated.isValidated,
    validatedAt:      updated.validatedAt,
    validationMethod: updated.validationMethod,
    customer: {
      name: [redemption.user.firstName, redemption.user.lastName].filter(Boolean).join(' '),
    },
  }
}

export async function listMyRedemptions(
  prisma: PrismaClient,
  userId: string,
  pagination: { limit: number; offset: number }
) {
  const rows = await prisma.voucherRedemption.findMany({
    where:   { userId },
    orderBy: { redeemedAt: 'desc' },
    take:    pagination.limit,
    skip:    pagination.offset,
    include: {
      voucher: { select: { id: true, title: true, merchant: { select: { businessName: true, logoUrl: true } } } },
      branch:  { select: { id: true, name: true } },
    },
  })
  return rows.map((r) => ({ ...r, estimatedSaving: Number(r.estimatedSaving) }))
}

export async function getMyRedemption(
  prisma: PrismaClient,
  userId: string,
  redemptionId: string
) {
  const redemption = await prisma.voucherRedemption.findUnique({
    where:   { id: redemptionId },
    include: {
      voucher: { select: { id: true, title: true, terms: true, merchant: { select: { businessName: true } } } },
      branch:  { select: { id: true, name: true, addressLine1: true, city: true, postcode: true } },
    },
  })
  if (!redemption || redemption.userId !== userId) throw new AppError('REDEMPTION_NOT_FOUND')
  return { ...redemption, estimatedSaving: Number(redemption.estimatedSaving) }
}

export async function listBranchRedemptions(
  prisma: PrismaClient,
  branchId: string,
  pagination: { limit: number; offset: number; from?: Date; to?: Date }
) {
  const where: Prisma.VoucherRedemptionWhereInput = { branchId }
  if (pagination.from || pagination.to) {
    where.redeemedAt = {
      ...(pagination.from ? { gte: pagination.from } : {}),
      ...(pagination.to   ? { lte: pagination.to   } : {}),
    }
  }

  const [total, items] = await Promise.all([
    prisma.voucherRedemption.count({ where }),
    prisma.voucherRedemption.findMany({
      where,
      orderBy: { redeemedAt: 'desc' },
      take:    pagination.limit,
      skip:    pagination.offset,
      include: {
        voucher: { select: { id: true, title: true } },
        user:    { select: { firstName: true, lastName: true } },
      },
    }),
  ])

  return {
    total,
    items: items.map((r) => ({
      ...r,
      customer: { name: [r.user.firstName, r.user.lastName].filter(Boolean).join(' ') },
      user: undefined,
    })),
  }
}
