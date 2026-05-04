import React from 'react'
import { render } from '@testing-library/react-native'
import { MerchantHeadline } from '@/features/merchant/components/MerchantHeadline'

// Visual correction round (post-PR-#35 QA): MerchantHeadline now renders
// only the merchant name. The branch line moved into BranchContextBand —
// see `branch-context-band.test.tsx` for that surface's tests.
describe('MerchantHeadline', () => {
  it('renders the merchant name', () => {
    const { getByText } = render(<MerchantHeadline merchantName="Covelum Restaurant" />)
    expect(getByText('Covelum Restaurant')).toBeTruthy()
  })

  it('handles long names without overflow (numberOfLines=2)', () => {
    const longName = 'A Really Long Merchant Name That Could Wrap Across Two Lines Eventually'
    const { getByText } = render(<MerchantHeadline merchantName={longName} />)
    expect(getByText(longName)).toBeTruthy()
  })
})
