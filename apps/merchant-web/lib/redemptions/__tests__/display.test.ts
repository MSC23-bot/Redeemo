import {
  formatRedemptionCode,
  formatRedeemedAt,
  formatSaving,
  voucherTypeChip,
  voucherTypeLabel,
  statusLabel,
} from '../display'

describe('formatRedemptionCode (4+4 display)', () => {
  it('groups an 8-char code as 4+4', () => {
    expect(formatRedemptionCode('A7K2P9X4')).toBe('A7K2 P9X4')
  })
  it('normalises lowercase + spaces before grouping', () => {
    expect(formatRedemptionCode('a7k2 p9x4')).toBe('A7K2 P9X4')
  })
  it('returns non-8 codes uppercased without forced grouping', () => {
    expect(formatRedemptionCode('ABC')).toBe('ABC')
  })
})

describe('formatRedeemedAt', () => {
  it('formats an ISO string into an en-GB date+time string', () => {
    const out = formatRedeemedAt('2026-06-21T10:05:00.000Z')
    expect(out).toMatch(/2026/)
    expect(out.length).toBeGreaterThan(0)
  })
  it('returns an empty string for null', () => {
    expect(formatRedeemedAt(null)).toBe('')
  })
})

describe('formatSaving', () => {
  it('formats a number as GBP with two decimals', () => {
    expect(formatSaving(3.5)).toBe('£3.50')
  })
})

describe('voucherTypeChip', () => {
  it('maps backend voucher types to the Chip type', () => {
    expect(voucherTypeChip('BOGO')).toBe('bogo')
    expect(voucherTypeChip('SPEND_AND_SAVE')).toBe('spendsave')
    expect(voucherTypeChip('DISCOUNT_FIXED')).toBe('discount')
    expect(voucherTypeChip('DISCOUNT_PERCENT')).toBe('discount')
    expect(voucherTypeChip('FREEBIE')).toBe('freebie')
    expect(voucherTypeChip('PACKAGE_DEAL')).toBe('package')
    expect(voucherTypeChip('TIME_LIMITED')).toBe('timelimited')
    expect(voucherTypeChip('REUSABLE')).toBe('reusable')
  })
  it('falls back to discount for an unknown type (forward-compat)', () => {
    expect(voucherTypeChip('SOMETHING_NEW')).toBe('discount')
  })
})

describe('voucherTypeLabel', () => {
  it('humanises the backend enum', () => {
    expect(voucherTypeLabel('SPEND_AND_SAVE')).toBe('Spend and save')
    expect(voucherTypeLabel('BOGO')).toBe('BOGO')
  })
})

describe('statusLabel', () => {
  it('maps the status to display copy', () => {
    expect(statusLabel('AWAITING_VALIDATION')).toBe('Awaiting validation')
    expect(statusLabel('VALIDATED')).toBe('Validated')
  })
})
