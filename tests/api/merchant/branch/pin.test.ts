import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppError } from '../../../../src/api/shared/errors'

vi.mock('../../../../src/api/shared/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}))

import { getBranchPin, setBranchPin, sendBranchPin } from '../../../../src/api/merchant/branch/service'

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

    await expect(sendBranchPin(prisma, 'ma1', 'b1', { ipAddress: '1.2.3.4', userAgent: 'test' }))
      .rejects.toThrow('PIN_NOT_CONFIGURED')
  })

  it('resolves when branch has no users and no contact info', async () => {
    const prisma = mockPrisma()
    prisma.merchantAdmin.findUnique.mockResolvedValue({ id: 'ma1', merchantId: 'm1' })
    prisma.branch.findFirst.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234', name: 'Main', email: null, phone: null })

    await expect(sendBranchPin(prisma, 'ma1', 'b1', { ipAddress: '1.2.3.4', userAgent: 'test' }))
      .resolves.toEqual({ message: 'PIN sent to branch staff' })
  })
})
