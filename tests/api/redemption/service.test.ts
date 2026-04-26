import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppError } from '../../../src/api/shared/errors'

vi.mock('../../../src/api/shared/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}))

vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'TESTCODE123') }))

import {
  createRedemption,
  verifyRedemption,
  listMyRedemptions,
  getMyRedemption,
  listBranchRedemptions,
} from '../../../src/api/redemption/service'

const mockPrisma = () => ({
  branch:                  { findUnique: vi.fn() },
  subscription:            { findUnique: vi.fn() },
  voucher:                 { findUnique: vi.fn() },
  userVoucherCycleState:   { findUnique: vi.fn() },
  voucherRedemption:       { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  user:                    { findUnique: vi.fn().mockResolvedValue({ phoneVerified: true }) },
  auditLog:                { create: vi.fn().mockResolvedValue({}) },
  $transaction:            vi.fn(),
} as any)

const mockRedis = () => ({
  get:   vi.fn().mockResolvedValue(null),
  incr:  vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
  del:   vi.fn().mockResolvedValue(1),
} as any)

const baseCtx = { ipAddress: '127.0.0.1', userAgent: 'test' }

describe('createRedemption', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('throws PIN_NOT_CONFIGURED when branch has no redemptionPin', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: null })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).rejects.toThrow('PIN_NOT_CONFIGURED')
  })

  it('throws PIN_RATE_LIMIT_EXCEEDED when rate limit counter >= 5', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValueOnce('5')
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:9999' })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).rejects.toThrow('PIN_RATE_LIMIT_EXCEEDED')
  })

  it('throws INVALID_PIN when submitted PIN does not match decrypted value', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:9999' })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).rejects.toThrow('INVALID_PIN')

    expect(redis.incr).toHaveBeenCalled()
  })

  it('throws SUBSCRIPTION_REQUIRED when subscription is not active', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234' })
    prisma.subscription.findUnique.mockResolvedValue({ status: 'CANCELLED' })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).rejects.toThrow('SUBSCRIPTION_REQUIRED')
  })

  it('throws PHONE_NOT_VERIFIED when user.phoneVerified is false and does not proceed past the guard', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234' })
    prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE' })
    prisma.user.findUnique.mockResolvedValueOnce({ phoneVerified: false })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).rejects.toThrow('PHONE_NOT_VERIFIED')

    // Proves execution stopped at the phone-verified guard — voucher lookup
    // and downstream cycle/transaction work were never reached.
    expect(prisma.voucher.findUnique).not.toHaveBeenCalled()
    expect(prisma.userVoucherCycleState.findUnique).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('throws VOUCHER_NOT_FOUND when voucher is inactive', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234' })
    prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE' })
    prisma.voucher.findUnique.mockResolvedValue({
      id: 'v1', merchantId: 'm1', status: 'INACTIVE', approvalStatus: 'APPROVED',
      estimatedSaving: 5.00,
      merchant: { status: 'ACTIVE' },
    })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).rejects.toThrow('VOUCHER_NOT_FOUND')
  })

  it('throws BRANCH_MERCHANT_MISMATCH when branch is from a different merchant', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'other-merchant', redemptionPin: 'enc:1234' })
    prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE' })
    prisma.voucher.findUnique.mockResolvedValue({
      id: 'v1', merchantId: 'm1', status: 'ACTIVE', approvalStatus: 'APPROVED',
      estimatedSaving: 5.00,
      merchant: { status: 'ACTIVE' },
    })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).rejects.toThrow('BRANCH_MERCHANT_MISMATCH')
  })

  it('throws ALREADY_REDEEMED when isRedeemedInCurrentCycle is true in current cycle', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234' })
    // Anchor on the 10th — current cycle includes today
    const anchor = new Date(Date.UTC(2026, 0, 10))
    prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE', cycleAnchorDate: anchor })
    prisma.voucher.findUnique.mockResolvedValue({
      id: 'v1', merchantId: 'm1', status: 'ACTIVE', approvalStatus: 'APPROVED',
      estimatedSaving: 5.00,
      merchant: { status: 'ACTIVE' },
    })
    // cycleStartDate is in the current cycle window — should block
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,
      cycleStartDate: new Date(), // today is within the current cycle
    })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).rejects.toThrow('ALREADY_REDEEMED')
  })

  it('allows redemption when cycleStartDate is from a previous cycle (cycle rolled over)', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234' })
    const anchor = new Date(Date.UTC(2026, 0, 10))
    prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE', cycleAnchorDate: anchor })
    prisma.voucher.findUnique.mockResolvedValue({
      id: 'v1', merchantId: 'm1', status: 'ACTIVE', approvalStatus: 'APPROVED',
      estimatedSaving: 5.00,
      merchant: { status: 'ACTIVE' },
    })
    // cycleStartDate is from 2 months ago — a previous cycle, should allow
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,
      cycleStartDate: new Date(Date.UTC(2025, 10, 10)),
    })
    prisma.$transaction.mockResolvedValue({ id: 'r1', redemptionCode: 'TESTCODE123' })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).resolves.toBeDefined()
  })

  it('succeeds: runs transaction, deletes rate-limit key, returns redemption', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234' })
    const anchor = new Date(Date.UTC(2026, 0, 10))
    prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE', cycleAnchorDate: anchor })
    prisma.voucher.findUnique.mockResolvedValue({
      id: 'v1', merchantId: 'm1', status: 'ACTIVE', approvalStatus: 'APPROVED',
      estimatedSaving: 5.00,
      merchant: { status: 'ACTIVE' },
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue(null)
    const redemption = {
      id: 'r1', redemptionCode: 'TESTCODE123', voucherId: 'v1',
      branchId: 'b1', redeemedAt: new Date(), isValidated: false,
      estimatedSaving: 5.00,
    }
    prisma.$transaction.mockResolvedValue(redemption)

    const result = await createRedemption(
      prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx
    )

    expect(prisma.$transaction).toHaveBeenCalled()
    expect(redis.del).toHaveBeenCalled()
    expect(result).toEqual({ ...redemption, estimatedSaving: Number(redemption.estimatedSaving) })
  })

  it('PIN failure at branch A does not block at branch B', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockImplementation((key: string) => {
      if (key.includes('b-branch-a')) return Promise.resolve('5')
      return Promise.resolve(null)
    })

    prisma.branch.findUnique.mockResolvedValue({ id: 'b-branch-b', merchantId: 'm1', redemptionPin: 'enc:1234' })
    const anchor = new Date(Date.UTC(2026, 0, 10))
    prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE', cycleAnchorDate: anchor })
    prisma.voucher.findUnique.mockResolvedValue({
      id: 'v1', merchantId: 'm1', status: 'ACTIVE', approvalStatus: 'APPROVED',
      estimatedSaving: 5.00,
      merchant: { status: 'ACTIVE' },
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue(null)
    prisma.$transaction.mockResolvedValue({ id: 'r1', redemptionCode: 'TESTCODE123' })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b-branch-b', pin: '1234' }, baseCtx)
    ).resolves.toBeDefined()
  })

  // ── Subscription-anchored cycle: additional scenarios ───────────────────

  it('annual subscriber: cycle resets monthly based on cycleAnchorDate, not billing interval', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234' })
    // Annual subscriber anchored on Jan 15
    const anchor = new Date(Date.UTC(2026, 0, 15))
    prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE', cycleAnchorDate: anchor })
    prisma.voucher.findUnique.mockResolvedValue({
      id: 'v1', merchantId: 'm1', status: 'ACTIVE', approvalStatus: 'APPROVED',
      estimatedSaving: 5.00,
      merchant: { status: 'ACTIVE' },
    })
    // Redeemed in a previous monthly cycle — should allow
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,
      cycleStartDate: new Date(Date.UTC(2025, 11, 15)), // Dec 15 — previous cycle
    })
    prisma.$transaction.mockResolvedValue({ id: 'r1', redemptionCode: 'TESTCODE123' })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).resolves.toBeDefined()
  })

  it('throws SUBSCRIPTION_REQUIRED for cancelled subscriber', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234' })
    prisma.subscription.findUnique.mockResolvedValue({ status: 'CANCELLED', cycleAnchorDate: new Date() })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).rejects.toThrow('SUBSCRIPTION_REQUIRED')
  })

  it('throws SUBSCRIPTION_REQUIRED for past-due subscriber', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234' })
    prisma.subscription.findUnique.mockResolvedValue({ status: 'PAST_DUE', cycleAnchorDate: new Date() })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).rejects.toThrow('SUBSCRIPTION_REQUIRED')
  })

  it('throws SUBSCRIPTION_REQUIRED for expired subscriber', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234' })
    prisma.subscription.findUnique.mockResolvedValue({ status: 'EXPIRED', cycleAnchorDate: new Date() })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).rejects.toThrow('SUBSCRIPTION_REQUIRED')
  })

  it('allows TRIALLING subscriber to redeem', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234' })
    const anchor = new Date(Date.UTC(2026, 0, 10))
    prisma.subscription.findUnique.mockResolvedValue({ status: 'TRIALLING', cycleAnchorDate: anchor })
    prisma.voucher.findUnique.mockResolvedValue({
      id: 'v1', merchantId: 'm1', status: 'ACTIVE', approvalStatus: 'APPROVED',
      estimatedSaving: 5.00,
      merchant: { status: 'ACTIVE' },
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue(null)
    prisma.$transaction.mockResolvedValue({ id: 'r1', redemptionCode: 'TESTCODE123' })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).resolves.toBeDefined()
  })

  it('resubscribe after gap: new cycleAnchorDate allows fresh redemption', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234' })
    // New subscription created today with fresh anchor
    const newAnchor = new Date(Date.UTC(2026, 3, 18))
    prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE', cycleAnchorDate: newAnchor })
    prisma.voucher.findUnique.mockResolvedValue({
      id: 'v1', merchantId: 'm1', status: 'ACTIVE', approvalStatus: 'APPROVED',
      estimatedSaving: 5.00,
      merchant: { status: 'ACTIVE' },
    })
    // Old cycle state from previous subscription — cycleStartDate is from months ago
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,
      cycleStartDate: new Date(Date.UTC(2025, 8, 10)), // Sep 2025 — old subscription
    })
    prisma.$transaction.mockResolvedValue({ id: 'r1', redemptionCode: 'TESTCODE123' })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).resolves.toBeDefined()
  })

  it('throws SUBSCRIPTION_REQUIRED when no subscription exists (free user)', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234' })
    prisma.subscription.findUnique.mockResolvedValue(null) // free user — no subscription

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).rejects.toThrow('SUBSCRIPTION_REQUIRED')
  })
})

describe('verifyRedemption', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('throws REDEMPTION_NOT_FOUND for unknown code', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue(null)

    await expect(
      verifyRedemption(prisma, 'BADCODE', 'QR_SCAN', { role: 'branch', branchId: 'b1', merchantId: 'm1', actorId: 'bu1' }, baseCtx)
    ).rejects.toThrow('REDEMPTION_NOT_FOUND')
  })

  it('throws ALREADY_VALIDATED when isValidated is true', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', isValidated: true, branchId: 'b1',
      voucher: { merchantId: 'm1' }, user: { firstName: 'Jane', lastName: 'Doe' },
    })

    await expect(
      verifyRedemption(prisma, 'CODE1', 'QR_SCAN', { role: 'branch', branchId: 'b1', merchantId: 'm1', actorId: 'bu1' }, baseCtx)
    ).rejects.toThrow('ALREADY_VALIDATED')
  })

  it('throws BRANCH_ACCESS_DENIED when branch_staff branchId does not match redemption branchId', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', isValidated: false, branchId: 'b-other',
      voucher: { merchantId: 'm1' }, user: { firstName: 'Jane', lastName: 'Doe' },
    })

    await expect(
      verifyRedemption(prisma, 'CODE1', 'QR_SCAN', { role: 'branch', branchId: 'b1', merchantId: 'm1', actorId: 'bu1' }, baseCtx)
    ).rejects.toThrow('BRANCH_ACCESS_DENIED')
  })

  it('throws MERCHANT_MISMATCH when merchant_admin merchantId does not match voucher merchantId', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', isValidated: false, branchId: 'b1',
      voucher: { merchantId: 'm-other' }, user: { firstName: 'Jane', lastName: 'Doe' },
    })

    await expect(
      verifyRedemption(prisma, 'CODE1', 'QR_SCAN', { role: 'merchant', branchId: null, merchantId: 'm1', actorId: 'ma1' }, baseCtx)
    ).rejects.toThrow('MERCHANT_MISMATCH')
  })

  it('succeeds for branch_staff: sets isValidated=true, returns customer name only', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', isValidated: false, branchId: 'b1',
      voucher: { merchantId: 'm1' },
      user: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '07700900000' },
    })
    prisma.voucherRedemption.update.mockResolvedValue({
      id: 'r1', isValidated: true, validatedAt: new Date(), validationMethod: 'QR_SCAN',
    })

    const result = await verifyRedemption(
      prisma, 'CODE1', 'QR_SCAN',
      { role: 'branch', branchId: 'b1', merchantId: 'm1', actorId: 'bu1' },
      baseCtx
    )

    expect(prisma.voucherRedemption.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isValidated: true, validationMethod: 'QR_SCAN', validatedById: 'bu1' }),
      })
    )
    expect(result.customer.name).toBe('Jane Doe')
    expect((result.customer as any).email).toBeUndefined()
    expect((result.customer as any).phone).toBeUndefined()
  })

  it('succeeds for merchant_admin: uses merchantId scope check', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', isValidated: false, branchId: 'b-any',
      voucher: { merchantId: 'm1' },
      user: { firstName: 'Bob', lastName: 'Smith' },
    })
    prisma.voucherRedemption.update.mockResolvedValue({
      id: 'r1', isValidated: true, validatedAt: new Date(), validationMethod: 'MANUAL',
    })

    const result = await verifyRedemption(
      prisma, 'CODE1', 'MANUAL',
      { role: 'merchant', branchId: null, merchantId: 'm1', actorId: 'ma1' },
      baseCtx
    )

    expect(result.customer.name).toBe('Bob Smith')
  })
})

describe('listMyRedemptions', () => {
  it('returns paginated list with voucher and branch details', async () => {
    const prisma = mockPrisma()
    const redemptions = [
      { id: 'r1', redemptionCode: 'CODE1', redeemedAt: new Date(), isValidated: false,
        estimatedSaving: 5.00,
        voucher: { id: 'v1', title: 'Test', merchant: { businessName: 'Acme', logoUrl: null } },
        branch: { id: 'b1', name: 'Main Branch' } },
    ]
    prisma.voucherRedemption.findMany.mockResolvedValue(redemptions)

    const result = await listMyRedemptions(prisma, 'user-1', { limit: 10, offset: 0 })
    expect(result).toEqual(redemptions.map((r) => ({ ...r, estimatedSaving: Number(r.estimatedSaving) })))
    expect(prisma.voucherRedemption.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1' },
      take: 10,
      skip: 0,
    }))
  })
})

describe('getMyRedemption', () => {
  it('throws REDEMPTION_NOT_FOUND when redemption does not belong to user', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue(null)

    await expect(getMyRedemption(prisma, 'user-1', 'r-other')).rejects.toThrow('REDEMPTION_NOT_FOUND')
  })

  it('returns redemption with voucher and branch details', async () => {
    const prisma = mockPrisma()
    const redemption = { id: 'r1', userId: 'user-1', redemptionCode: 'CODE1', estimatedSaving: 5.00 }
    prisma.voucherRedemption.findUnique.mockResolvedValue(redemption)

    const result = await getMyRedemption(prisma, 'user-1', 'r1')
    expect(result).toEqual({ ...redemption, estimatedSaving: Number(redemption.estimatedSaving) })
  })
})

describe('listBranchRedemptions', () => {
  it('returns paginated list with total count', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.count.mockResolvedValue(2)
    prisma.voucherRedemption.findMany.mockResolvedValue([
      { id: 'r1', user: { firstName: 'Jane', lastName: 'Doe' }, voucher: { id: 'v1', title: 'Test' } },
    ])

    const result = await listBranchRedemptions(prisma, 'b1', { limit: 20, offset: 0 })
    expect(result.total).toBe(2)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].customer.name).toBe('Jane Doe')
    expect((result.items[0] as any).user).toBeUndefined()
  })
})
