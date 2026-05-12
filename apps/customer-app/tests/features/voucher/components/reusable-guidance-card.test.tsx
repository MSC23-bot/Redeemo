import React from 'react'
import { render } from '@testing-library/react-native'
import { ReusableGuidanceCard } from '@/features/voucher/components/ReusableGuidanceCard'

describe('<ReusableGuidanceCard>', () => {
  it('renders locked title "Your latest code is shown here"', () => {
    const { getByText } = render(<ReusableGuidanceCard />)
    expect(getByText('Your latest code is shown here')).toBeTruthy()
  })

  it('renders locked body (Option B — truthful about latest-code behaviour)', () => {
    const { getByText } = render(<ReusableGuidanceCard />)
    expect(
      getByText(/After you redeem, your latest code is available to show staff for up to 2 hours\. Redeeming again creates a new code and replaces the one shown here\./),
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
    expect(a11y).toContain('Your latest code is shown here')
    expect(a11y).toContain('show staff for up to 2 hours')
    expect(a11y).toContain('replaces the one shown here')
  })

  // Q8 D42/D43 lock — never say "cooldown" or "wait" in customer copy.
  it('copy does NOT contain banned words "cooldown" or "wait"', () => {
    const { getByTestId } = render(<ReusableGuidanceCard />)
    const card = getByTestId('voucher-detail-reusable-guidance')
    const a11y = (card.props.accessibilityLabel || '').toLowerCase()
    expect(a11y).not.toContain('cooldown')
    expect(a11y).not.toContain('wait')
  })
})
