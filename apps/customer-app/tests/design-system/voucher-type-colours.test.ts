import { color } from '@/design-system/tokens'

describe('voucher type colours', () => {
  it('exposes all 7 voucher type colours', () => {
    expect(color.voucher.bogo).toBe('#7C3AED')
    expect(color.voucher.discount).toBe('#E20C04')
    expect(color.voucher.freebie).toBe('#16A34A')
    expect(color.voucher.spendSave).toBe('#E84A00')
    expect(color.voucher.package).toBe('#2563EB')
    expect(color.voucher.timeLimited).toBe('#D97706')
    expect(color.voucher.reusable).toBe('#0D9488')
  })

  it('maps VoucherType enum strings to colours', () => {
    expect(color.voucher.byType.BOGO).toBe('#7C3AED')
    expect(color.voucher.byType.DISCOUNT_FIXED).toBe('#E20C04')
    expect(color.voucher.byType.DISCOUNT_PERCENT).toBe('#E20C04')
    expect(color.voucher.byType.FREEBIE).toBe('#16A34A')
    expect(color.voucher.byType.SPEND_AND_SAVE).toBe('#E84A00')
    expect(color.voucher.byType.PACKAGE_DEAL).toBe('#2563EB')
    expect(color.voucher.byType.TIME_LIMITED).toBe('#D97706')
    expect(color.voucher.byType.REUSABLE).toBe('#0D9488')
  })
})
