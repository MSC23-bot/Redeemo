import React from 'react'
import { render } from '@testing-library/react-native'
import { MerchantDescriptor } from '@/features/merchant/components/MerchantDescriptor'

describe('MerchantDescriptor', () => {
  it('renders the descriptor string', () => {
    const { getByText } = render(<MerchantDescriptor descriptor="Indian Restaurant" />)
    expect(getByText('Indian Restaurant')).toBeTruthy()
  })

  it('renders nothing when descriptor is null', () => {
    const { toJSON } = render(<MerchantDescriptor descriptor={null} />)
    expect(toJSON()).toBeNull()
  })

  it('renders nothing when descriptor is empty string', () => {
    const { toJSON } = render(<MerchantDescriptor descriptor="" />)
    expect(toJSON()).toBeNull()
  })
})
