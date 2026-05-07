import React from 'react'
import { render } from '@testing-library/react-native'
import { CycleRulesCard } from '@/features/voucher/components/CycleRulesCard'

// Locked 2026-05-07 from device QA. The card explains the
// one-redemption-per-cycle rule + the renewal date so users know
// before redeeming. Multi-branch-aware copy (branch-independent rule)
// + null-availableAgainAt early-return (free users / guests).
//
// Renewal date format is en-GB / Europe/London via Intl.DateTimeFormat.
// Tests assert against the rendered visible text so display drift is
// caught without diving into the React Text node tree.

describe('CycleRulesCard', () => {
  it('returns null when availableAgainAt is null (free user / guest path)', () => {
    const { queryByTestId } = render(
      <CycleRulesCard isMultiBranch={false} availableAgainAt={null} isRedeemed={false} />,
    )
    expect(queryByTestId('cycle-rules')).toBeNull()
  })

  it('single-branch + not yet redeemed: shows the simple rule + "Renews on <date>"', () => {
    const { getByText, getByTestId } = render(
      <CycleRulesCard
        isMultiBranch={false}
        availableAgainAt="2026-06-04T00:00:00.000Z"
        isRedeemed={false}
      />,
    )
    expect(getByTestId('cycle-rules')).toBeTruthy()
    expect(getByText('This voucher can be redeemed once per cycle.')).toBeTruthy()
    // The label "Renews on " and the date "Thursday 4 June" render in
    // the same parent Text but as separate children — the date child
    // gets the bold style. RNTL's getByText finds either one.
    expect(getByText('Thursday 4 June')).toBeTruthy()
  })

  it('multi-branch + not yet redeemed: shows the branch-shared rule', () => {
    const { getByText } = render(
      <CycleRulesCard
        isMultiBranch={true}
        availableAgainAt="2026-06-04T00:00:00.000Z"
        isRedeemed={false}
      />,
    )
    expect(
      getByText(
        'Redeeming this voucher at one branch uses it across every branch until the next cycle.',
      ),
    ).toBeTruthy()
  })

  it('redeemed-this-cycle: a11y label uses "Available again on" wording', () => {
    // The label-vs-date assertion is harder to do via getByText
    // because the static "Renews on" / "Available again on" sits
    // alongside the bold date child. The accessibilityLabel on the
    // card aggregates both so we can pin the redeemed variant via
    // its label.
    const { getByLabelText } = render(
      <CycleRulesCard
        isMultiBranch={false}
        availableAgainAt="2026-06-04T00:00:00.000Z"
        isRedeemed={true}
      />,
    )
    expect(
      getByLabelText(/Available again on Thursday 4 June/),
    ).toBeTruthy()
  })

  it('not yet redeemed: a11y label uses "Renews on" wording', () => {
    const { getByLabelText } = render(
      <CycleRulesCard
        isMultiBranch={false}
        availableAgainAt="2026-06-04T00:00:00.000Z"
        isRedeemed={false}
      />,
    )
    expect(getByLabelText(/Renews on Thursday 4 June/)).toBeTruthy()
  })

  it('falls back to the raw ISO when availableAgainAt fails to parse (defensive)', () => {
    const { getByText } = render(
      <CycleRulesCard
        isMultiBranch={false}
        availableAgainAt="not-a-real-date"
        isRedeemed={false}
      />,
    )
    expect(getByText('not-a-real-date')).toBeTruthy()
  })
})
