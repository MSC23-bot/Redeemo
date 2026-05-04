import React from 'react'
import { render } from '@testing-library/react-native'
import { MerchantHeadline } from '@/features/merchant/components/MerchantHeadline'

describe('MerchantHeadline', () => {
  it('renders merchant name', () => {
    const { getByText } = render(
      <MerchantHeadline merchantName="Covelum Restaurant" branchLine={null} />
    )
    expect(getByText('Covelum Restaurant')).toBeTruthy()
  })

  it('renders the branch line when supplied (multi-branch)', () => {
    const { getByText } = render(
      <MerchantHeadline merchantName="Covelum Restaurant" branchLine="Brightlingsea, Essex" />
    )
    expect(getByText('Covelum Restaurant')).toBeTruthy()
    expect(getByText('Brightlingsea, Essex')).toBeTruthy()
  })

  it('omits the branch line when null (single-branch)', () => {
    const { queryByText, getByText } = render(
      <MerchantHeadline merchantName="Beans & Brew" branchLine={null} />
    )
    expect(getByText('Beans & Brew')).toBeTruthy()
    expect(queryByText(/Brightlingsea/)).toBeNull()
  })

  it('omits the branch line when empty string (defensive)', () => {
    const { queryByTestId } = render(
      <MerchantHeadline merchantName="Beans & Brew" branchLine="" />
    )
    expect(queryByTestId('merchant-branch-line')).toBeNull()
  })

  it('exposes the branch line via testID for animation hookup', () => {
    const { getByTestId } = render(
      <MerchantHeadline merchantName="Covelum" branchLine="Brightlingsea" />
    )
    expect(getByTestId('merchant-branch-line')).toBeTruthy()
  })
})
