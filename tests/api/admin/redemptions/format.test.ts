import { describe, it, expect } from 'vitest'
import {
  ADMIN_ROW_SELECT,
  toAdminRedemptionRow,
} from '../../../../src/api/admin/redemptions/format'

// D67: read-only admin visibility of voucher redemptions. Mirrors
// tests/api/merchant/redemptions/format.test.ts's style for the admin row shape.

describe('ADMIN_ROW_SELECT (curated, privacy-safe, cross-merchant)', () => {
  it('NEVER selects redemptionPin anywhere', () => {
    const json = JSON.stringify(ADMIN_ROW_SELECT)
    expect(json).not.toContain('redemptionPin')
  })
  it('user select is firstName + lastName only (NO email / phone)', () => {
    expect(ADMIN_ROW_SELECT.user.select).toEqual({ firstName: true, lastName: true })
    const json = JSON.stringify(ADMIN_ROW_SELECT)
    expect(json).not.toContain('email')
    expect(json).not.toContain('phone')
  })
  it('validatedBy select is firstName + lastName only', () => {
    expect(ADMIN_ROW_SELECT.validatedBy.select).toEqual({ firstName: true, lastName: true })
  })
  it('voucher select is id + title + type only (list-only, no detail page; D67-b)', () => {
    expect(ADMIN_ROW_SELECT.voucher.select).toEqual({ id: true, title: true, type: true })
  })
  it('branch select carries the owning merchant identity (id + businessName)', () => {
    expect(ADMIN_ROW_SELECT.branch.select).toEqual({
      id: true, name: true, merchant: { select: { id: true, businessName: true } },
    })
  })
  it('isTestData is selected (drives the D67-c "Test" badge)', () => {
    expect((ADMIN_ROW_SELECT as any).isTestData).toBe(true)
  })
})

describe('toAdminRedemptionRow (admin-safe, cross-merchant mapping)', () => {
  const base = {
    id: 'r1',
    redemptionCode: 'A7K2P9X4',
    redeemedAt: new Date('2026-06-21T10:00:00.000Z'),
    isValidated: false,
    validatedAt: null,
    validationMethod: null,
    estimatedSaving: 12.5,
    isTestData: false,
    voucher: { id: 'v1', title: 'Half-price pizza', type: 'BOGO' },
    branch: { id: 'b1', name: 'Main Branch', merchant: { id: 'm1', businessName: 'Acme Coffee' } },
    user: { firstName: 'Sarah', lastName: 'Khan' },
    validatedBy: null,
  }

  it('maps to the admin-safe shape with the masked customer name + merchant identity', () => {
    const row = toAdminRedemptionRow(base)
    expect(row).toEqual({
      id: 'r1',
      redemptionCode: 'A7K2P9X4',
      voucher: { id: 'v1', title: 'Half-price pizza', type: 'BOGO' },
      branch: { id: 'b1', name: 'Main Branch' },
      merchant: { id: 'm1', businessName: 'Acme Coffee' },
      customerName: 'Sarah K.',
      redeemedAt: '2026-06-21T10:00:00.000Z',
      status: 'AWAITING_VALIDATION',
      validatedAt: null,
      validationMethod: null,
      validatedByLabel: null,
      estimatedSaving: 12.5,
      isTestData: false,
    })
  })

  it('never leaks branch.merchant nested under branch on the mapped row', () => {
    const row = toAdminRedemptionRow(base)
    expect((row.branch as any).merchant).toBeUndefined()
  })

  it('coerces a Decimal-ish estimatedSaving string to a number', () => {
    const row = toAdminRedemptionRow({ ...base, estimatedSaving: '7.25' })
    expect(row.estimatedSaving).toBe(7.25)
    expect(typeof row.estimatedSaving).toBe('number')
  })

  it('passes isTestData through unchanged (true case)', () => {
    const row = toAdminRedemptionRow({ ...base, isTestData: true })
    expect(row.isTestData).toBe(true)
  })

  it('maps a validated branch-staff redemption with a validatedByLabel', () => {
    const row = toAdminRedemptionRow({
      ...base,
      isValidated: true,
      validatedAt: new Date('2026-06-21T11:00:00.000Z'),
      validationMethod: 'QR_SCAN',
      validatedBy: { firstName: 'Jon', lastName: 'Smith' },
    })
    expect(row.status).toBe('VALIDATED')
    expect(row.validatedAt).toBe('2026-06-21T11:00:00.000Z')
    expect(row.validationMethod).toBe('QR_SCAN')
    expect(row.validatedByLabel).toBe('Jon S.')
  })

  it('maps a portal validation (validatedBy null) to "Validated in the portal"', () => {
    const row = toAdminRedemptionRow({
      ...base,
      isValidated: true,
      validatedAt: new Date('2026-06-21T11:00:00.000Z'),
      validationMethod: 'MANUAL',
      validatedBy: null,
    })
    expect(row.validatedByLabel).toBe('Validated in the portal')
  })

  it('neutral "Customer" fallback when the user has no name', () => {
    const row = toAdminRedemptionRow({ ...base, user: { firstName: '', lastName: '' } })
    expect(row.customerName).toBe('Customer')
  })
})
