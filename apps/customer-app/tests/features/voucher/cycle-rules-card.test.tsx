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

  it('single-branch + not yet redeemed: shows the positive pre-redemption copy + "Renews on <date>"', () => {
    const { getByText, getByTestId } = render(
      <CycleRulesCard
        isMultiBranch={false}
        availableAgainAt="2026-06-04T00:00:00.000Z"
        isRedeemed={false}
      />,
    )
    expect(getByTestId('cycle-rules')).toBeTruthy()
    // Locked 2026-05-08 from device QA — non-redeemed copy is
    // helpful and positive ("Use this voucher", "it will refresh"),
    // not negative-framing.
    expect(
      getByText(
        /Use this voucher once during your current cycle\. After you redeem it, it will refresh on the renewal date shown below\./,
      ),
    ).toBeTruthy()
    // Date prominence — the date sits in its own block as a
    // heading-sized standalone value with an uppercase eyebrow
    // label above it.
    expect(getByText('RENEWS ON')).toBeTruthy()
    expect(getByText('Thursday 4 June')).toBeTruthy()
  })

  it('renewal date renders as a heading-prominent block, not inline body text', () => {
    // Locked 2026-05-08 from device QA — the date is the most-asked
    // question on the cycle card, so it must render in its own
    // surface (testID `cycle-rules-date-value`) with a tinted
    // background block (testID `cycle-rules-date`).
    const { getByTestId } = render(
      <CycleRulesCard
        isMultiBranch={false}
        availableAgainAt="2026-06-04T00:00:00.000Z"
        isRedeemed={false}
      />,
    )
    const block = getByTestId('cycle-rules-date')
    const value = getByTestId('cycle-rules-date-value')
    expect(block).toBeTruthy()
    // The date value is its own Text child of the block.
    expect(value.props.children).toBe('Thursday 4 June')
  })

  it('multi-branch + not yet redeemed: SAME branch-agnostic copy as single-branch', () => {
    // Locked 2026-05-08 from device QA — non-redeemed copy is
    // intentionally branch-agnostic for now. The same line works
    // for both single- and multi-branch merchants. (Branch-aware
    // variants can be re-introduced later if specific multi-branch
    // nuance is needed.)
    const single = render(
      <CycleRulesCard
        isMultiBranch={false}
        availableAgainAt="2026-06-04T00:00:00.000Z"
        isRedeemed={false}
      />,
    ).getByTestId('cycle-rules-rule').props.children
    const multi = render(
      <CycleRulesCard
        isMultiBranch={true}
        availableAgainAt="2026-06-04T00:00:00.000Z"
        isRedeemed={false}
      />,
    ).getByTestId('cycle-rules-rule').props.children
    expect(single).toBe(multi)
    expect(String(single)).toMatch(
      /Use this voucher once during your current cycle\. After you redeem it, it will refresh on the renewal date shown below\./,
    )
  })

  it('non-redeemed copy contains no em dashes (locked 2026-05-08 — no em dashes in customer-facing copy)', () => {
    // Pin negative — catches a future copy edit that re-introduces
    // em-dash punctuation in the cycle card.
    const { getByTestId } = render(
      <CycleRulesCard
        isMultiBranch={true}
        availableAgainAt="2026-06-04T00:00:00.000Z"
        isRedeemed={false}
      />,
    )
    const ruleText = String(getByTestId('cycle-rules-rule').props.children ?? '')
    expect(ruleText).not.toMatch(/—/)
  })

  it('redeemed copy contains no em dashes', () => {
    const { getByTestId } = render(
      <CycleRulesCard
        isMultiBranch={true}
        availableAgainAt="2026-06-04T00:00:00.000Z"
        isRedeemed={true}
      />,
    )
    const ruleText = String(getByTestId('cycle-rules-rule').props.children ?? '')
    expect(ruleText).not.toMatch(/—/)
  })

  // State-aware copy (locked 2026-05-08 from device QA). Pre-redemption
  // copy frames the rule as guidance; post-redemption copy
  // acknowledges that the voucher has already been used and points to
  // the renewal date below. The pre/post variants must be DIFFERENT
  // so the user understands which world they're in.

  describe('state-aware copy — redeemed (post-redemption acknowledgement, branch-agnostic)', () => {
    it('single-branch + redeemed: warmer "You’ve used this voucher" copy, points to renewal date', () => {
      const { getByText } = render(
        <CycleRulesCard
          isMultiBranch={false}
          availableAgainAt="2026-06-04T00:00:00.000Z"
          isRedeemed={true}
        />,
      )
      // Locked 2026-05-08 from device QA — warmer, more direct
      // wording than the previous "has already been redeemed".
      expect(
        getByText(
          /You’ve used this voucher for your current cycle\. It will be ready to use again on the renewal date shown below\./,
        ),
      ).toBeTruthy()
    })

    it('redeemed copy is the SAME for single-branch and multi-branch (branch-agnostic)', () => {
      // Locked 2026-05-08 from device QA — the redeemed message
      // doesn't re-litigate the branch-shared rule. "You've used
      // this voucher" implicitly covers all branches because the
      // user's redemption is gone for the cycle, regardless of
      // which branch consumed it. This pin makes sure no future
      // edit re-introduces a multi-branch-specific redeemed line.
      const single = render(
        <CycleRulesCard
          isMultiBranch={false}
          availableAgainAt="2026-06-04T00:00:00.000Z"
          isRedeemed={true}
        />,
      ).getByTestId('cycle-rules-rule').props.children
      const multi = render(
        <CycleRulesCard
          isMultiBranch={true}
          availableAgainAt="2026-06-04T00:00:00.000Z"
          isRedeemed={true}
        />,
      ).getByTestId('cycle-rules-rule').props.children
      expect(single).toBe(multi)
    })

    it('redeemed copy does NOT use the pre-redemption "can be redeemed" wording', () => {
      // Regression pin — a future copy edit that reverts to the
      // present-tense pre-redemption form would mislead the user
      // into thinking the voucher is still redeemable.
      const { queryByText } = render(
        <CycleRulesCard
          isMultiBranch={false}
          availableAgainAt="2026-06-04T00:00:00.000Z"
          isRedeemed={true}
        />,
      )
      expect(queryByText(/can be redeemed once during your current cycle/i)).toBeNull()
    })

    it('redeemed copy does NOT use the older "has already been redeemed" or "Switching branches" phrasings', () => {
      // Locked 2026-05-08 from device QA — those were the previous
      // (colder) variants; the warmer redirect is the canonical
      // wording. Pin negative to prevent regression.
      const { getByTestId } = render(
        <CycleRulesCard
          isMultiBranch={true}
          availableAgainAt="2026-06-04T00:00:00.000Z"
          isRedeemed={true}
        />,
      )
      const ruleText = String(getByTestId('cycle-rules-rule').props.children ?? '')
      expect(ruleText).not.toMatch(/has already been redeemed/)
      expect(ruleText).not.toMatch(/Switching branches will not make it redeemable again/)
    })
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
