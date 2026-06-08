import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppError } from '../../../../src/api/shared/errors'

vi.mock('../../../../src/api/shared/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}))

// SEC-H3 (Gate-PR-7): mock Twilio (no real SMS) + the SMS limiter so the branch-PIN
// SMS path is exercised in isolation. The limiter's own logic is covered by
// tests/api/shared/sms-limiter.test.ts.
const { messagesCreate } = vi.hoisted(() => ({ messagesCreate: vi.fn() }))
vi.mock('twilio', () => ({
  default: vi.fn(() => ({ messages: { create: messagesCreate } })),
}))
vi.mock('../../../../src/api/shared/smsLimiter', () => ({
  assertSmsSendAllowed: vi.fn().mockResolvedValue(undefined),
  recordSmsSend: vi.fn().mockResolvedValue(undefined),
}))

import { getBranchPin, setBranchPin, sendBranchPin } from '../../../../src/api/merchant/branch/service'
import { assertSmsSendAllowed, recordSmsSend } from '../../../../src/api/shared/smsLimiter'

const mockPrisma = () => ({
  merchantAdmin: { findUnique: vi.fn() },
  branch:        { findFirst: vi.fn(), update: vi.fn() },
  branchUser:    { findMany: vi.fn() },
  auditLog:      { create: vi.fn().mockResolvedValue({}) },
} as any)

describe('getBranchPin', () => {
  it('returns decrypted PIN when set', async () => {
    const prisma = mockPrisma()
    prisma.merchantAdmin.findUnique.mockResolvedValue({ id: 'ma1', merchantId: 'm1' })
    prisma.branch.findFirst.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234' })

    const result = await getBranchPin(prisma, 'ma1', 'b1')
    expect(result).toEqual({ pin: '1234' })
  })

  it('returns { pin: null } when no PIN set', async () => {
    const prisma = mockPrisma()
    prisma.merchantAdmin.findUnique.mockResolvedValue({ id: 'ma1', merchantId: 'm1' })
    prisma.branch.findFirst.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: null })

    const result = await getBranchPin(prisma, 'ma1', 'b1')
    expect(result).toEqual({ pin: null })
  })
})

describe('setBranchPin', () => {
  it('throws INVALID_PIN_FORMAT for non-4-digit PIN', async () => {
    const prisma = mockPrisma()
    prisma.merchantAdmin.findUnique.mockResolvedValue({ id: 'ma1', merchantId: 'm1' })
    prisma.branch.findFirst.mockResolvedValue({ id: 'b1', merchantId: 'm1' })

    await expect(setBranchPin(prisma, 'ma1', 'b1', '12', { ipAddress: '1.2.3.4', userAgent: 'test' }))
      .rejects.toThrow('INVALID_PIN_FORMAT')
  })

  it('encrypts and persists the PIN', async () => {
    const prisma = mockPrisma()
    prisma.merchantAdmin.findUnique.mockResolvedValue({ id: 'ma1', merchantId: 'm1' })
    prisma.branch.findFirst.mockResolvedValue({ id: 'b1', merchantId: 'm1' })
    prisma.branch.update.mockResolvedValue({})

    await setBranchPin(prisma, 'ma1', 'b1', '5678', { ipAddress: '1.2.3.4', userAgent: 'test' })

    expect(prisma.branch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { redemptionPin: 'enc:5678' } })
    )
  })
})

describe('sendBranchPin', () => {
  it('throws PIN_NOT_CONFIGURED when branch has no PIN', async () => {
    const prisma = mockPrisma()
    prisma.merchantAdmin.findUnique.mockResolvedValue({ id: 'ma1', merchantId: 'm1' })
    prisma.branch.findFirst.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: null, email: null, phone: null })

    await expect(sendBranchPin(prisma, {} as any, 'ma1', 'b1', { ipAddress: '1.2.3.4', userAgent: 'test' }))
      .rejects.toThrow('PIN_NOT_CONFIGURED')
  })

  it('resolves when branch has no users and no contact info', async () => {
    const prisma = mockPrisma()
    prisma.merchantAdmin.findUnique.mockResolvedValue({ id: 'ma1', merchantId: 'm1' })
    prisma.branch.findFirst.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234', name: 'Main', email: null, phone: null })

    await expect(sendBranchPin(prisma, {} as any, 'ma1', 'b1', { ipAddress: '1.2.3.4', userAgent: 'test' }))
      .resolves.toEqual({ message: 'PIN sent to branch staff' })
  })
})

describe('sendBranchPin — SMS path (branch.phone present)', () => {
  function branchWithPhone(prisma: any) {
    prisma.merchantAdmin.findUnique.mockResolvedValue({ id: 'ma1', merchantId: 'm1' })
    prisma.branch.findFirst.mockResolvedValue({
      id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234', name: 'Main', phone: '+447700900000', email: null,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(assertSmsSendAllowed as any).mockResolvedValue(undefined)
    ;(recordSmsSend as any).mockResolvedValue(undefined)
    messagesCreate.mockResolvedValue({ sid: 'SM1' })
  })

  it('limiter allows → awaits Twilio once with the branch phone, records, writes audit, returns the message', async () => {
    const prisma = mockPrisma()
    branchWithPhone(prisma)

    const result = await sendBranchPin(prisma, {} as any, 'ma1', 'b1', { ipAddress: '1.2.3.4', userAgent: 'test' })

    // Limiter runs BEFORE Twilio, scoped to branchPin with the branch phone + IP.
    expect(assertSmsSendAllowed).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ phone: '+447700900000', ip: '1.2.3.4', scope: 'branchPin', branchId: 'b1' }),
    )
    expect(recordSmsSend).toHaveBeenCalled()
    expect(messagesCreate).toHaveBeenCalledTimes(1)
    expect(messagesCreate).toHaveBeenCalledWith(expect.objectContaining({ to: '+447700900000' }))
    expect(prisma.auditLog.create).toHaveBeenCalled() // BRANCH_PIN_SENT
    expect(result).toEqual({ message: 'PIN sent to branch staff' })
  })

  it('limiter blocks → Twilio is never called', async () => {
    const prisma = mockPrisma()
    branchWithPhone(prisma)
    ;(assertSmsSendAllowed as any).mockRejectedValueOnce(new AppError('SMS_RATE_LIMITED'))

    await expect(sendBranchPin(prisma, {} as any, 'ma1', 'b1', { ipAddress: '1.2.3.4', userAgent: 'test' }))
      .rejects.toThrow('SMS_RATE_LIMITED')
    expect(messagesCreate).not.toHaveBeenCalled()
  })

  it('Twilio failure propagates and no BRANCH_PIN_SENT audit row is written', async () => {
    const prisma = mockPrisma()
    branchWithPhone(prisma)
    messagesCreate.mockRejectedValueOnce(new Error('twilio down'))

    await expect(sendBranchPin(prisma, {} as any, 'ma1', 'b1', { ipAddress: '1.2.3.4', userAgent: 'test' }))
      .rejects.toThrow('twilio down')
    expect(prisma.auditLog.create).not.toHaveBeenCalled()
  })
})
