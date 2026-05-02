import React from 'react'
import { render } from '@testing-library/react-native'
import { AllBranchesUnavailable } from '@/features/merchant/components/AllBranchesUnavailable'

describe('AllBranchesUnavailable', () => {
  it('renders the merchant name + headline message', () => {
    const { getByText } = render(
      <AllBranchesUnavailable
        businessName="Covelum"
        bannerUrl={null}
        logoUrl={null}
      />,
    )
    expect(getByText('Covelum')).toBeTruthy()
    expect(getByText(/All branches are currently unavailable/i)).toBeTruthy()
  })

  it('does NOT render any tab bar / action buttons / vouchers', () => {
    const { queryByLabelText, queryByText } = render(
      <AllBranchesUnavailable businessName="Covelum" bannerUrl={null} logoUrl={null} />,
    )
    expect(queryByLabelText(/Vouchers tab/i)).toBeNull()
    expect(queryByLabelText(/About tab/i)).toBeNull()
    expect(queryByText(/Redeem/i)).toBeNull()
  })
})
