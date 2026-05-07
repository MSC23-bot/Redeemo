import React from 'react'
import { render } from '@testing-library/react-native'
import { VoucherTypeExplainerCard } from '@/features/voucher/components/VoucherTypeExplainerCard'
import { voucherTypeExplainer } from '@/features/voucher/constants/productCopy'
import type { VoucherType } from '@/lib/api/voucher'

// Locked 2026-05-07 from device QA. The card is type-driven (NOT
// description-driven) — it explains what THIS TYPE of voucher means
// in general, leaving the merchant-authored offer text in the hero.
//
// Pin: every public VoucherType produces a non-empty type-specific
// explainer body. The REUSABLE wording specifically must NOT imply
// unlimited reuse — backend cycle lockout still applies (see
// productCopy.ts comment + service.ts cycle guard).

describe('VoucherTypeExplainerCard', () => {
  // Per-type titles (locked 2026-05-08 from device QA). Each
  // VoucherType produces a "What is a <type> voucher?" title that
  // confirms the article matches the user's voucher.

  it.each([
    ['BOGO',             'What is a buy one, get one free voucher?'],
    ['FREEBIE',          'What is a freebie voucher?'],
    ['SPEND_AND_SAVE',   'What is a spend & save voucher?'],
    ['DISCOUNT_FIXED',   'What is a discount voucher?'],
    ['DISCOUNT_PERCENT', 'What is a discount voucher?'],
    ['PACKAGE_DEAL',     'What is a package deal voucher?'],
    ['TIME_LIMITED',     'What is a time-limited voucher?'],
    ['REUSABLE',         'What is a reusable voucher?'],
  ] as const)('renders the per-type title for %s', (type, expectedTitle) => {
    const { getByTestId } = render(<VoucherTypeExplainerCard type={type} />)
    expect(getByTestId('voucher-type-explainer-title').props.children).toBe(expectedTitle)
  })

  it('does NOT render the legacy generic "What this voucher means" title', () => {
    // Regression pin — a future revert to the generic copy would
    // break the per-type contract.
    const { queryByText } = render(<VoucherTypeExplainerCard type="BOGO" />)
    expect(queryByText('What this voucher means')).toBeNull()
  })

  // Each VoucherType yields a body string that comes from
  // voucherTypeExplainer(type). We assert the rendered body matches
  // the lookup function exactly so the card stays a thin renderer
  // and copy edits don't require touching this file.
  const ALL_TYPES: VoucherType[] = [
    'BOGO',
    'FREEBIE',
    'SPEND_AND_SAVE',
    'DISCOUNT_FIXED',
    'DISCOUNT_PERCENT',
    'PACKAGE_DEAL',
    'TIME_LIMITED',
    'REUSABLE',
  ]

  it.each(ALL_TYPES)('renders the canonical body for type %s', (type) => {
    const { getByTestId } = render(<VoucherTypeExplainerCard type={type} />)
    const body = getByTestId('voucher-type-explainer-body')
    expect(body.props.children).toBe(voucherTypeExplainer(type))
  })

  it.each(ALL_TYPES)('produces a non-empty explainer string for type %s', (type) => {
    const text = voucherTypeExplainer(type)
    expect(typeof text).toBe('string')
    expect(text.length).toBeGreaterThan(20)
  })

  it('REUSABLE explainer does NOT imply unlimited reuse — references "once per cycle"', () => {
    // REUSABLE is currently label-only in the backend; cycle lockout
    // still applies. The explainer must not contradict that. This
    // test catches an accidental copy edit that would tell customers
    // they can redeem REUSABLE vouchers any number of times.
    const text = voucherTypeExplainer('REUSABLE')
    expect(text).toMatch(/once per cycle/i)
    expect(text).not.toMatch(/unlimited|any number of times|multiple times|reuse anytime/i)
  })

  it('every type explainer mentions either the offer details, terms, or what qualifies — driving customers to merchant content', () => {
    // Sanity check: the explainer is the type-level frame, not the
    // merchant's offer text. Each one should still nudge the user
    // to consult the merchant-authored detail when relevant.
    for (const type of ALL_TYPES) {
      const text = voucherTypeExplainer(type)
      expect(text).toMatch(
        /(offer|merchant|details|terms|conditions|qualif|cycle|availability|item|bundle)/i,
      )
    }
  })

  it('renders distinct copy for each type (no two types share a body string)', () => {
    // If two types accidentally share a body, the cards on different
    // voucher pages would look identical — which defeats the point
    // of a type explainer. Pin uniqueness.
    const bodies = ALL_TYPES.map(voucherTypeExplainer)
    const unique = new Set(bodies)
    expect(unique.size).toBe(ALL_TYPES.length)
  })

  it('component is type-driven only — does NOT take a description prop', () => {
    // The previous AboutThisOfferCard took a `description` prop and
    // rendered the merchant's text verbatim. The new component must
    // NOT accept description; type alone drives the body. This is
    // a compile-time check disguised as runtime — TS would already
    // reject `<VoucherTypeExplainerCard description="x" />`. Asserting
    // here documents the contract for future refactors.
    const { getByTestId } = render(<VoucherTypeExplainerCard type="BOGO" />)
    const body = getByTestId('voucher-type-explainer-body')
    // Body must be the type-level explainer, not any merchant string
    // (which we never pass in).
    expect(body.props.children).toBe(voucherTypeExplainer('BOGO'))
  })
})
