import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/api/shared/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}))

import { verifyRedemption } from '../../../src/api/redemption/service'

// OD6 (B3): validatedById is a BranchUser FK. For a branch-staff actor it is
// the BranchUser id (unchanged). For a merchant-admin portal validation, the
// actor id is a MerchantAdmin id, which would violate the FK against a real DB
// (a latent crash). The no-schema fix sets validatedById = null for the
// merchant path; the merchant-admin actorId is still recorded in the
// VOUCHER_VERIFIED audit metadata, which is the authoritative portal record.

const mockPrisma = () => ({
  voucherRedemption: { findUnique: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn().mockResolvedValue({}) },
} as any)

const baseCtx = { ipAddress: '127.0.0.1', userAgent: 'test' }

function activeRedemption(branchId = 'b1', merchantId = 'm1', user: { firstName: string | null; lastName: string | null } = { firstName: 'Jane', lastName: 'Doe' }) {
  return {
    id: 'r1', userId: 'u1', isValidated: false, branchId,
    voucher: { merchantId, merchant: { status: 'ACTIVE' } },
    branch: { isActive: true },
    user,
  }
}

describe('verifyRedemption validator attribution (OD6 / B3)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('branch actor: validatedById = actor.actorId (UNCHANGED behaviour)', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue(activeRedemption('b1', 'm1'))
    prisma.voucherRedemption.update.mockResolvedValue({
      id: 'r1', isValidated: true, validatedAt: new Date(), validationMethod: 'QR_SCAN',
    })

    await verifyRedemption(
      prisma, 'A7K2P9X4', 'QR_SCAN',
      { role: 'branch', branchId: 'b1', merchantId: 'm1', actorId: 'bu1' },
      baseCtx
    )

    expect(prisma.voucherRedemption.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isValidated: true,
          validationMethod: 'QR_SCAN',
          validatedById: 'bu1',
        }),
      })
    )
  })

  it('merchant actor: validatedById = null (FK-safe portal validation) + validationMethod is the passed method', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue(activeRedemption('b-any', 'm1'))
    prisma.voucherRedemption.update.mockResolvedValue({
      id: 'r1', isValidated: true, validatedAt: new Date(), validationMethod: 'MANUAL',
    })

    await verifyRedemption(
      prisma, 'A7K2P9X4', 'MANUAL',
      { role: 'merchant', branchId: null, merchantId: 'm1', actorId: 'ma1' },
      baseCtx
    )

    const updateArg = (prisma.voucherRedemption.update as any).mock.calls[0][0]
    expect(updateArg.data.validatedById).toBeNull()
    // Defensive: the merchant-admin id must NOT be written into the BranchUser FK.
    expect(updateArg.data.validatedById).not.toBe('ma1')
    expect(updateArg.data.validationMethod).toBe('MANUAL')
    expect(updateArg.data.isValidated).toBe(true)
  })

  it('merchant actor: the VOUCHER_VERIFIED audit still records metadata.actorId (authoritative portal record)', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue(activeRedemption('b-any', 'm1'))
    prisma.voucherRedemption.update.mockResolvedValue({
      id: 'r1', isValidated: true, validatedAt: new Date(), validationMethod: 'MANUAL',
    })

    await verifyRedemption(
      prisma, 'A7K2P9X4', 'MANUAL',
      { role: 'merchant', branchId: null, merchantId: 'm1', actorId: 'ma1' },
      baseCtx
    )

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: 'VOUCHER_VERIFIED',
          metadata: expect.objectContaining({ actorId: 'ma1', method: 'MANUAL' }),
        }),
      })
    )
  })
})

// OD4 (Finding 1): the customer identity returned to a MERCHANT-ADMIN portal
// validation crosses the merchant-portal API boundary, so it must be first
// name + last initial only (formatCustomerName) - NEVER the full surname.
// Branch-staff validation is the in-person mobile-app path (face-to-face), so
// it keeps the full name unchanged.
describe('verifyRedemption customer identity at the merchant-portal boundary (OD4 / Finding 1)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('merchant actor: customer.name is first + last initial (Bob S.), NOT the full surname', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue(
      activeRedemption('b-any', 'm1', { firstName: 'Bob', lastName: 'Smith' })
    )
    prisma.voucherRedemption.update.mockResolvedValue({
      id: 'r1', isValidated: true, validatedAt: new Date(), validationMethod: 'MANUAL',
    })

    const result = await verifyRedemption(
      prisma, 'A7K2P9X4', 'MANUAL',
      { role: 'merchant', branchId: null, merchantId: 'm1', actorId: 'ma1' },
      baseCtx
    )

    expect(result.customer.name).toBe('Bob S.')
    // The merchant portal must NEVER receive the full surname.
    expect(result.customer.name).not.toContain('Smith')
    expect(JSON.stringify(result)).not.toContain('Smith')
  })

  it('branch actor: customer.name is the FULL name (Bob Smith), unchanged for the in-person path', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue(
      activeRedemption('b1', 'm1', { firstName: 'Bob', lastName: 'Smith' })
    )
    prisma.voucherRedemption.update.mockResolvedValue({
      id: 'r1', isValidated: true, validatedAt: new Date(), validationMethod: 'QR_SCAN',
    })

    const result = await verifyRedemption(
      prisma, 'A7K2P9X4', 'QR_SCAN',
      { role: 'branch', branchId: 'b1', merchantId: 'm1', actorId: 'bu1' },
      baseCtx
    )

    expect(result.customer.name).toBe('Bob Smith')
  })
})
