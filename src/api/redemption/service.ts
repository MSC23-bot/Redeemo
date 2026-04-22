import { PrismaClient, Prisma, MerchantStatus, VoucherStatus, ApprovalStatus } from '../../../generated/prisma/client'
import type Redis from 'ioredis'
import crypto from 'crypto'
import { AppError } from '../shared/errors'
import { decrypt } from '../shared/encryption'
import { writeAuditLog } from '../shared/audit'
import { RedisKey } from '../shared/redis-keys'

const PIN_FAIL_LIMIT = 5
const PIN_FAIL_WINDOW = 15 * 60 // 15 minutes in seconds

// Uppercase letters + digits, MINUS ambiguous characters (0 / O, 1 / I / L).
// 31 chars × 6 positions = ~887M codes. Retries on DB unique-constraint collision.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateRedemptionCode(length = 6): string {
  const bytes = crypto.randomBytes(length)
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return code
}

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
  // 1. Fetch branch and check PIN configured
  const branch = await prisma.branch.findUnique({ where: { id: data.branchId } })
  if (!branch || !branch.redemptionPin) throw new AppError('PIN_NOT_CONFIGURED')

  // 2. Check rate limit BEFORE attempting PIN comparison
  const failKey = RedisKey.pinFailCount(userId, data.branchId)
  const failCount = await redis.get(failKey)
  if (failCount !== null && parseInt(failCount, 10) >= PIN_FAIL_LIMIT) {
    throw new AppError('PIN_RATE_LIMIT_EXCEEDED')
  }

  // 3. Timing-safe PIN comparison
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
    await redis.incr(failKey)
    await redis.expire(failKey, PIN_FAIL_WINDOW)
    throw new AppError('INVALID_PIN')
  }

  // 4. Subscription guard
  const sub = await prisma.subscription.findUnique({ where: { userId } })
  if (!sub || !['ACTIVE', 'TRIALLING'].includes(sub.status)) {
    throw new AppError('SUBSCRIPTION_REQUIRED')
  }

  // 5. Voucher guard — must be ACTIVE + APPROVED, with merchant APPROVED
  const voucher = await prisma.voucher.findUnique({
    where: { id: data.voucherId },
    include: { merchant: { select: { status: true } } },
  })
  if (
    !voucher ||
    voucher.status !== VoucherStatus.ACTIVE ||
    voucher.approvalStatus !== ApprovalStatus.APPROVED ||
    voucher.merchant.status !== MerchantStatus.ACTIVE
  ) {
    throw new AppError('VOUCHER_NOT_FOUND')
  }

  // 6. Branch belongs to voucher's merchant
  if (branch.merchantId !== voucher.merchantId) {
    throw new AppError('BRANCH_MERCHANT_MISMATCH')
  }

  // 7. Cycle state guard — merchant-scoped via (userId, voucherId)
  const cycleState = await prisma.userVoucherCycleState.findUnique({
    where: { userId_voucherId: { userId, voucherId: data.voucherId } },
  })
  if (cycleState?.isRedeemedInCurrentCycle) {
    throw new AppError('ALREADY_REDEEMED')
  }

  // 8. Atomic transaction with collision retry
  const now = new Date()
  const cycleStart = sub.currentPeriodStart ?? now
  const MAX_CODE_ATTEMPTS = 5
  let redemption: Awaited<ReturnType<typeof prisma.voucherRedemption.create>> | null = null

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const redemptionCode = generateRedemptionCode()
    try {
      redemption = await prisma.$transaction(async (tx) => {
        const created = await tx.voucherRedemption.create({
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

        await tx.userVoucherCycleState.upsert({
          where:  { userId_voucherId: { userId, voucherId: data.voucherId } },
          create: {
            userId,
            voucherId:                data.voucherId,
            cycleStartDate:           cycleStart,
            isRedeemedInCurrentCycle: true,
            lastRedeemedAt:           now,
          },
          update: {
            cycleStartDate:           cycleStart,
            isRedeemedInCurrentCycle: true,
            lastRedeemedAt:           now,
          },
        })

        return created
      })
      break
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        Array.isArray((err.meta as { target?: string[] } | undefined)?.target) &&
        (err.meta as { target: string[] }).target.includes('redemptionCode')
      ) {
        continue
      }
      throw err
    }
  }

  if (!redemption) throw new AppError('REDEMPTION_CODE_COLLISION')

  // 9. Reset fail counter on success
  await redis.del(failKey)

  writeAuditLog(prisma, {
    entityId: userId, entityType: 'customer',
    event: 'VOUCHER_REDEEMED',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { voucherId: data.voucherId, branchId: data.branchId, redemptionCode: redemption.redemptionCode },
  })

  return redemption
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
  return prisma.voucherRedemption.findMany({
    where:   { userId },
    orderBy: { redeemedAt: 'desc' },
    take:    pagination.limit,
    skip:    pagination.offset,
    include: {
      voucher: { select: { id: true, title: true, merchant: { select: { businessName: true, logoUrl: true } } } },
      branch:  { select: { id: true, name: true } },
    },
  })
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
  return redemption
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
