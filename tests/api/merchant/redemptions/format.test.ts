import { describe, it, expect } from 'vitest'
import {
  formatCustomerName,
  deriveRedemptionStatus,
  validatedByLabel,
  validatedByDisplayName,
  normalizeRedemptionCode,
  ROW_SELECT,
  ROW_SELECT_WITH_MERCHANT,
  toMerchantRedemptionRow,
} from '../../../../src/api/merchant/redemptions/format'

describe('formatCustomerName (OD4: first name + last initial)', () => {
  it('formats first + last initial', () => { expect(formatCustomerName('Sarah', 'Khan')).toBe('Sarah K.') })
  it('uppercases the initial', () => { expect(formatCustomerName('sarah', 'khan')).toBe('sarah K.') })
  it('first only when no last name', () => { expect(formatCustomerName('Sarah', '')).toBe('Sarah') })
  it('neutral fallback when both empty', () => { expect(formatCustomerName('', '')).toBe('Customer') })
  it('neutral fallback when both null', () => { expect(formatCustomerName(null, null)).toBe('Customer') })
  it('trims', () => { expect(formatCustomerName('  Sarah ', ' Khan ')).toBe('Sarah K.') })
  it('never returns a full surname', () => { expect(formatCustomerName('Sarah', 'Khan')).not.toContain('Khan') })
  it('last-only degrades to the initial', () => { expect(formatCustomerName('', 'Khan')).toBe('K.') })
})

describe('deriveRedemptionStatus', () => {
  it('validated', () => { expect(deriveRedemptionStatus(true)).toBe('VALIDATED') })
  it('awaiting', () => { expect(deriveRedemptionStatus(false)).toBe('AWAITING_VALIDATION') })
})

describe('validatedByLabel (OD6)', () => {
  it('null when not validated', () => { expect(validatedByLabel({ isValidated: false, validatedBy: null })).toBeNull() })
  it('branch-staff name when validatedBy present', () => { expect(validatedByLabel({ isValidated: true, validatedBy: { firstName: 'Jon', lastName: 'Smith' } })).toBe('Jon S.') })
  it('"Validated in the portal" when validated but no validatedBy (merchant-admin path)', () => { expect(validatedByLabel({ isValidated: true, validatedBy: null })).toBe('Validated in the portal') })
})

describe('validatedByDisplayName (A5: full staff name for the detail drawer)', () => {
  it('null when not validated', () => { expect(validatedByDisplayName({ isValidated: false, validatedBy: null })).toBeNull() })
  it('full staff name when a BranchUser validated', () => { expect(validatedByDisplayName({ isValidated: true, validatedBy: { firstName: 'Jon', lastName: 'Smith' } })).toBe('Jon Smith') })
  it('trims and tolerates a first-name-only staff row', () => { expect(validatedByDisplayName({ isValidated: true, validatedBy: { firstName: ' Jon ', lastName: null } })).toBe('Jon') })
  it('generic portal label when validatedBy is null (portal Quick Validate path)', () => { expect(validatedByDisplayName({ isValidated: true, validatedBy: null })).toBe('Validated in the portal') })
  it('generic portal label (never an empty string) for a nameless staff row', () => { expect(validatedByDisplayName({ isValidated: true, validatedBy: { firstName: '', lastName: '  ' } })).toBe('Validated in the portal') })
})

describe('normalizeRedemptionCode', () => {
  it('uppercases + strips spaces', () => { expect(normalizeRedemptionCode('a7k2 p9x4')).toBe('A7K2P9X4') })
  it('strips non-alphanumerics', () => { expect(normalizeRedemptionCode('a7k2-p9x4')).toBe('A7K2P9X4') })
  it('handles empty / nullish input', () => { expect(normalizeRedemptionCode('')).toBe('') })
})

describe('ROW_SELECT (curated, privacy-safe)', () => {
  it('NEVER selects redemptionPin anywhere', () => {
    const json = JSON.stringify(ROW_SELECT)
    expect(json).not.toContain('redemptionPin')
  })
  it('branch select is id + name only (no PIN, no address)', () => {
    expect(ROW_SELECT.branch.select).toEqual({ id: true, name: true })
  })
  it('user select is firstName + lastName only (NO email / phone)', () => {
    expect(ROW_SELECT.user.select).toEqual({ firstName: true, lastName: true })
    const json = JSON.stringify(ROW_SELECT)
    expect(json).not.toContain('email')
    expect(json).not.toContain('phone')
  })
  it('validatedBy select is firstName + lastName only', () => {
    expect(ROW_SELECT.validatedBy.select).toEqual({ firstName: true, lastName: true })
  })
  it('voucher select is id + title + type + description + terms only (no merchant on the list shape)', () => {
    expect(ROW_SELECT.voucher.select).toEqual({ id: true, title: true, type: true, description: true, terms: true })
  })
})

describe('ROW_SELECT_WITH_MERCHANT (lookup ownership check)', () => {
  it('adds merchantId to the voucher select for the ownership check', () => {
    expect(ROW_SELECT_WITH_MERCHANT.voucher.select).toEqual({ id: true, title: true, type: true, description: true, terms: true, merchantId: true })
  })
  it('still NEVER selects redemptionPin / email / phone', () => {
    const json = JSON.stringify(ROW_SELECT_WITH_MERCHANT)
    expect(json).not.toContain('redemptionPin')
    expect(json).not.toContain('email')
    expect(json).not.toContain('phone')
  })
})

describe('toMerchantRedemptionRow (merchant-safe mapping)', () => {
  const base = {
    id: 'r1',
    redemptionCode: 'A7K2P9X4',
    redeemedAt: new Date('2026-06-21T10:00:00.000Z'),
    isValidated: false,
    validatedAt: null,
    validationMethod: null,
    estimatedSaving: 12.5,
    voucher: {
      id: 'v1',
      title: 'Half-price pizza',
      type: 'BOGO',
      description: 'Two pizzas for the price of one.',
      terms: 'Dine in only.\nOne per table.',
      merchantId: 'm1',
    },
    branch: { id: 'b1', name: 'Main Branch' },
    user: { firstName: 'Sarah', lastName: 'Khan' },
    validatedBy: null,
  }

  it('maps to the merchant-safe shape with first + last initial', () => {
    const row = toMerchantRedemptionRow(base)
    expect(row).toEqual({
      id: 'r1',
      redemptionCode: 'A7K2P9X4',
      voucher: {
        id: 'v1',
        title: 'Half-price pizza',
        type: 'BOGO',
        description: 'Two pizzas for the price of one.',
        terms: 'Dine in only.\nOne per table.',
      },
      branch: { id: 'b1', name: 'Main Branch' },
      customerName: 'Sarah K.',
      redeemedAt: '2026-06-21T10:00:00.000Z',
      status: 'AWAITING_VALIDATION',
      validatedAt: null,
      validationMethod: null,
      validatedByLabel: null,
      validatedBy: null,
      estimatedSaving: 12.5,
    })
  })

  it('nulls absent voucher description / terms (never undefined on the wire shape)', () => {
    const row = toMerchantRedemptionRow({
      ...base,
      voucher: { id: 'v1', title: 'Half-price pizza', type: 'BOGO', description: null, terms: null, merchantId: 'm1' },
    })
    expect(row.voucher.description).toBeNull()
    expect(row.voucher.terms).toBeNull()
  })

  it('never leaks voucher.merchantId out of the mapped row', () => {
    const row = toMerchantRedemptionRow(base)
    expect((row.voucher as any).merchantId).toBeUndefined()
  })

  it('maps a validated branch-staff redemption with a validatedByLabel', () => {
    const row = toMerchantRedemptionRow({
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
    // A5: the additive display name carries the FULL staff name (merchant's own
    // staff, not customer PII).
    expect(row.validatedBy).toBe('Jon Smith')
  })

  it('maps a portal validation (validatedBy null) to "Validated in the portal"', () => {
    const row = toMerchantRedemptionRow({
      ...base,
      isValidated: true,
      validatedAt: new Date('2026-06-21T11:00:00.000Z'),
      validationMethod: 'MANUAL',
      validatedBy: null,
    })
    expect(row.validatedByLabel).toBe('Validated in the portal')
    expect(row.validatedBy).toBe('Validated in the portal')
  })

  it('coerces a Decimal-ish estimatedSaving string to a number', () => {
    const row = toMerchantRedemptionRow({ ...base, estimatedSaving: '7.25' })
    expect(row.estimatedSaving).toBe(7.25)
    expect(typeof row.estimatedSaving).toBe('number')
  })
})
