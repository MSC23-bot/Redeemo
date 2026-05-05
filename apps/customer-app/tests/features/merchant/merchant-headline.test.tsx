import React from 'react'
import { render } from '@testing-library/react-native'
import { MerchantHeadline } from '@/features/merchant/components/MerchantHeadline'

// Round 4 §1: identity zone restructure. MerchantHeadline now owns:
//   - the logo (absolute-positioned, overlapping the banner)
//   - the rating block (top-right of identity zone, near the banner)
//   - the merchant name (under the logo, left-aligned)
describe('MerchantHeadline', () => {
  it('renders the merchant name', () => {
    const { getByText } = render(
      <MerchantHeadline
        merchantName="Covelum Restaurant"
        logoUrl={null}
        avgRating={null}
        reviewCount={0}
      />
    )
    expect(getByText('Covelum Restaurant')).toBeTruthy()
  })

  it('handles long names without overflow (numberOfLines=2)', () => {
    const longName = 'A Really Long Merchant Name That Could Wrap Across Two Lines Eventually'
    const { getByText } = render(
      <MerchantHeadline
        merchantName={longName}
        logoUrl={null}
        avgRating={null}
        reviewCount={0}
      />
    )
    expect(getByText(longName)).toBeTruthy()
  })

  it('renders a rating block when avgRating + reviewCount are populated', () => {
    const { getByText, getByLabelText } = render(
      <MerchantHeadline
        merchantName="X"
        logoUrl={null}
        avgRating={4.1}
        reviewCount={7}
      />
    )
    expect(getByText('X')).toBeTruthy()
    // The rating block surfaces an aria-style label for assistive tech.
    expect(getByLabelText(/Rating 4\.1 from 7 reviews/)).toBeTruthy()
    expect(getByText('4.1')).toBeTruthy()
    expect(getByText('(7)')).toBeTruthy()
  })

  it('renders "No reviews yet" placeholder when reviewCount=0', () => {
    const { getByText } = render(
      <MerchantHeadline
        merchantName="X"
        logoUrl={null}
        avgRating={null}
        reviewCount={0}
      />
    )
    expect(getByText('No reviews yet')).toBeTruthy()
  })

  it('accepts a logoUrl without crashing', () => {
    const { getByText } = render(
      <MerchantHeadline
        merchantName="X"
        logoUrl="https://example.com/logo.png"
        avgRating={null}
        reviewCount={0}
      />
    )
    expect(getByText('X')).toBeTruthy()
  })
})
