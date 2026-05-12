import React from 'react'
import { render } from '@testing-library/react-native'
import { ReusableGuidanceCard } from '@/features/voucher/components/ReusableGuidanceCard'

describe('<ReusableGuidanceCard>', () => {
  it('renders locked title "Your code stays available"', () => {
    const { getByText } = render(<ReusableGuidanceCard />)
    expect(getByText('Your code stays available')).toBeTruthy()
  })

  it('renders locked body', () => {
    const { getByText } = render(<ReusableGuidanceCard />)
    expect(
      getByText(/After you redeem, your code stays available to show staff for up to 2 hours\. This voucher becomes available again after the time shown above\./),
    ).toBeTruthy()
  })

  it('has testID voucher-detail-reusable-guidance', () => {
    const { getByTestId } = render(<ReusableGuidanceCard />)
    expect(getByTestId('voucher-detail-reusable-guidance')).toBeTruthy()
  })

  it('a11y label covers title + body', () => {
    const { getByTestId } = render(<ReusableGuidanceCard />)
    const card = getByTestId('voucher-detail-reusable-guidance')
    const a11y = card.props.accessibilityLabel || ''
    expect(a11y).toContain('Your code stays available')
    expect(a11y).toContain('show staff for up to 2 hours')
  })
})
