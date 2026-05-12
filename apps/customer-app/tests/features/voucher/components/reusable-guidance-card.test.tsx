import React from 'react'
import { render } from '@testing-library/react-native'
import { ReusableGuidanceCard } from '@/features/voucher/components/ReusableGuidanceCard'

describe('<ReusableGuidanceCard>', () => {
  it('renders locked title "Use it again after each redemption"', () => {
    const { getByText } = render(<ReusableGuidanceCard />)
    expect(getByText('Use it again after each redemption')).toBeTruthy()
  })

  it('renders locked body (pre-redemption REUSABLE model explainer)', () => {
    const { getByText } = render(<ReusableGuidanceCard />)
    // Match the body using a regex that tolerates the rsquo apostrophe.
    expect(
      getByText(
        /Redeem this voucher when you.{1,3}re ready to use it\. After each redemption, it becomes available again after the offer.{1,3}s reusable time\./,
      ),
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
    expect(a11y).toContain('Use it again after each redemption')
    expect(a11y).toContain('ready to use it')
    expect(a11y).toContain('reusable time')
  })

  // Q8 D42/D43 lock — never say "cooldown" or "wait" in customer copy.
  it('copy does NOT contain banned words "cooldown" or "wait"', () => {
    const { getByTestId } = render(<ReusableGuidanceCard />)
    const card = getByTestId('voucher-detail-reusable-guidance')
    const a11y = (card.props.accessibilityLabel || '').toLowerCase()
    expect(a11y).not.toContain('cooldown')
    expect(a11y).not.toContain('wait')
  })

  // Regression pin (contextual placement fix, 2026-05-12) — the
  // pre-redemption variant of this card MUST NOT carry the
  // post-redemption "Your latest code is shown here" copy. That copy
  // belongs to <ReusableLatestCodeCard>, mounted post-redemption.
  it('does NOT carry the post-redemption "latest code" copy any more', () => {
    const { queryByText, getByTestId } = render(<ReusableGuidanceCard />)
    expect(queryByText('Your latest code is shown here')).toBeNull()
    const a11y = (getByTestId('voucher-detail-reusable-guidance').props.accessibilityLabel || '').toLowerCase()
    expect(a11y).not.toContain('your latest code is shown here')
    expect(a11y).not.toContain('replaces the one shown here')
  })
})
