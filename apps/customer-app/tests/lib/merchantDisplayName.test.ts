import { merchantDisplayName } from '@/lib/merchantDisplayName'

describe('merchantDisplayName', () => {
  it('prefers a non-blank tradingName over businessName', () => {
    expect(
      merchantDisplayName({ tradingName: 'The Kraft Store', businessName: 'The Kraft Store Pvt Ltd' }),
    ).toBe('The Kraft Store')
  })

  it('falls back to businessName when tradingName is null', () => {
    expect(
      merchantDisplayName({ tradingName: null, businessName: 'The Kraft Store Pvt Ltd' }),
    ).toBe('The Kraft Store Pvt Ltd')
  })

  it('falls back to businessName when tradingName is undefined', () => {
    expect(
      merchantDisplayName({ businessName: 'The Kraft Store Pvt Ltd' }),
    ).toBe('The Kraft Store Pvt Ltd')
  })

  it('falls back to businessName when tradingName is an empty string', () => {
    expect(
      merchantDisplayName({ tradingName: '', businessName: 'The Kraft Store Pvt Ltd' }),
    ).toBe('The Kraft Store Pvt Ltd')
  })

  it('falls back to businessName when tradingName is whitespace-only', () => {
    expect(
      merchantDisplayName({ tradingName: '   ', businessName: 'The Kraft Store Pvt Ltd' }),
    ).toBe('The Kraft Store Pvt Ltd')
  })

  it('trims surrounding whitespace on a valid tradingName', () => {
    expect(
      merchantDisplayName({ tradingName: '  The Kraft Store  ', businessName: 'The Kraft Store Pvt Ltd' }),
    ).toBe('The Kraft Store')
  })
})
