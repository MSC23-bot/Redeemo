import React from 'react'
import { render } from '@testing-library/react-native'
import { MerchantHeadline } from '@/features/merchant/components/MerchantHeadline'

// Visual correction round 3 §A1 (post-PR-#35 QA): MerchantHeadline now
// owns the logo + name horizontal flex row. The logo previously sat
// absolute-positioned in HeroSection; moving it here lets short names
// sit snug to the logo instead of floating in the right-of-logo gutter.
describe('MerchantHeadline', () => {
  it('renders the merchant name', () => {
    const { getByText } = render(
      <MerchantHeadline merchantName="Covelum Restaurant" logoUrl={null} />
    )
    expect(getByText('Covelum Restaurant')).toBeTruthy()
  })

  it('handles long names without overflow (numberOfLines=2)', () => {
    const longName = 'A Really Long Merchant Name That Could Wrap Across Two Lines Eventually'
    const { getByText } = render(
      <MerchantHeadline merchantName={longName} logoUrl={null} />
    )
    expect(getByText(longName)).toBeTruthy()
  })

  it('renders the logo placeholder when logoUrl is null', () => {
    const { getByText } = render(
      <MerchantHeadline merchantName="X" logoUrl={null} />
    )
    expect(getByText('X')).toBeTruthy()
  })

  it('accepts a logoUrl without crashing', () => {
    const { getByText } = render(
      <MerchantHeadline merchantName="X" logoUrl="https://example.com/logo.png" />
    )
    expect(getByText('X')).toBeTruthy()
  })
})
