import React from 'react'
import { render } from '@testing-library/react-native'
import { ReusableRulesCard } from '@/features/voucher/components/ReusableRulesCard'

describe('<ReusableRulesCard>', () => {
  it('renders title "Reusable voucher"', () => {
    const { getByText } = render(<ReusableRulesCard effectiveCooldownSeconds={14400} />)
    expect(getByText('Reusable voucher')).toBeTruthy()
  })

  it('renders body with "every 4 hours" for 14400s cooldown', () => {
    const { getByText } = render(<ReusableRulesCard effectiveCooldownSeconds={14400} />)
    expect(getByText(/Available again every 4 hours\. Your subscription must stay active to redeem\./)).toBeTruthy()
  })

  it('renders body with "every 30 minutes" for 1800s', () => {
    const { getByText } = render(<ReusableRulesCard effectiveCooldownSeconds={1800} />)
    expect(getByText(/every 30 minutes/)).toBeTruthy()
  })

  it('renders body with "every 1 day" for 86400s', () => {
    const { getByText } = render(<ReusableRulesCard effectiveCooldownSeconds={86400} />)
    expect(getByText(/every 1 day/)).toBeTruthy()
  })

  it('has testID voucher-detail-reusable-rules', () => {
    const { getByTestId } = render(<ReusableRulesCard effectiveCooldownSeconds={14400} />)
    expect(getByTestId('voucher-detail-reusable-rules')).toBeTruthy()
  })
})
