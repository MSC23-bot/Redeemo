import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getMyRedemptionByCode } from '../../../src/api/redemption/service'

// Customer self-lookup by redemption code, used by the
// Show-to-Staff polling hook to detect staff validation transitions.
//
// Slim payload by design — this endpoint is hit every 5s while
// Show-to-Staff is open. No PII beyond what the customer already sees.

const fakePrisma = () => ({
  voucherRedemption: { findUnique: vi.fn() },
})

describe('getMyRedemptionByCode', () => {
  let prisma: ReturnType<typeof fakePrisma>

  beforeEach(() => {
    prisma = fakePrisma()
  })

  it('returns the slim polling payload on the happy path', async () => {
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      userId:           'u1',
      redemptionCode:   'A7K2P9X4',
      isValidated:      true,
      validatedAt:      new Date('2026-05-08T10:00:00Z'),
      validationMethod: 'QR_SCAN',
      voucher: { id: 'v1', merchant: { businessName: 'Pizza Palace' } },
      branch:  { name: 'High Street' },
    })

    const result = await getMyRedemptionByCode(prisma as any, 'u1', 'A7K2P9X4')

    expect(result).toEqual({
      code:             'A7K2P9X4',
      isValidated:      true,
      validatedAt:      new Date('2026-05-08T10:00:00Z'),
      validationMethod: 'QR_SCAN',
      voucherId:        'v1',
      merchantName:     'Pizza Palace',
      branchName:       'High Street',
    })
    // Slim shape — must NOT leak any other field on the redemption row
    // (no userId, no validatedById, no estimatedSaving, no redeemedAt).
    expect(Object.keys(result).sort()).toEqual([
      'branchName', 'code', 'isValidated', 'merchantName',
      'validatedAt', 'validationMethod', 'voucherId',
    ])
  })

  it('normalises lowercase + spaces to canonical uppercase before lookup', async () => {
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      userId: 'u1', redemptionCode: 'A7K2P9X4',
      isValidated: false, validatedAt: null, validationMethod: null,
      voucher: { id: 'v1', merchant: { businessName: 'X' } },
      branch:  { name: 'Y' },
    })

    await getMyRedemptionByCode(prisma as any, 'u1', 'a7k2 p9x4')

    expect(prisma.voucherRedemption.findUnique).toHaveBeenCalledWith({
      where:   { redemptionCode: 'A7K2P9X4' },
      include: expect.any(Object),
    })
  })

  it('throws REDEMPTION_NOT_FOUND when the code does not exist', async () => {
    prisma.voucherRedemption.findUnique.mockResolvedValue(null)
    await expect(
      getMyRedemptionByCode(prisma as any, 'u1', 'NOPE0000'),
    ).rejects.toThrow('REDEMPTION_NOT_FOUND')
  })

  it('throws REDEMPTION_NOT_FOUND when the redemption belongs to a different user', async () => {
    // Critical security check — same shape as flagRedemptionScreenshot.
    // A leaked code from another customer must NOT surface their
    // redemption status to a different user's session.
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      userId:           'OTHER_USER',
      redemptionCode:   'A7K2P9X4',
      isValidated:      false,
      validatedAt:      null,
      validationMethod: null,
      voucher: { id: 'v1', merchant: { businessName: 'X' } },
      branch:  { name: 'Y' },
    })
    await expect(
      getMyRedemptionByCode(prisma as any, 'u1', 'A7K2P9X4'),
    ).rejects.toThrow('REDEMPTION_NOT_FOUND')
  })
})
