import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { VoucherTypeExplainerCard } from '@/features/voucher/components/VoucherTypeExplainerCard'
import { voucherTypeExplainer } from '@/features/voucher/constants/productCopy'
import type { VoucherType } from '@/lib/api/voucher'

jest.mock('@/design-system/haptics', () => ({
  lightHaptic: jest.fn(),
}))

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

  it.each(ALL_TYPES)('renders the canonical body for type %s when expanded', (type) => {
    // Card is collapsed by default (locked 2026-05-08); use the
    // `defaultExpanded` test prop to show the body immediately.
    const { getByTestId } = render(
      <VoucherTypeExplainerCard type={type} defaultExpanded />,
    )
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

  it('no type explainer body uses em dashes (locked 2026-05-08 — customer-facing copy is em-dash-free)', () => {
    // Em dashes are banned from customer-facing copy in the voucher
    // detail flow. Pin negative across all 8 types to catch future
    // copy edits that re-introduce them.
    for (const type of ALL_TYPES) {
      const text = voucherTypeExplainer(type)
      expect(text).not.toMatch(/—/)
    }
  })

  it('component is type-driven only — does NOT take a description prop', () => {
    // The previous AboutThisOfferCard took a `description` prop and
    // rendered the merchant's text verbatim. The new component must
    // NOT accept description; type alone drives the body. This is
    // a compile-time check disguised as runtime — TS would already
    // reject `<VoucherTypeExplainerCard description="x" />`. Asserting
    // here documents the contract for future refactors.
    const { getByTestId } = render(<VoucherTypeExplainerCard type="BOGO" defaultExpanded />)
    const body = getByTestId('voucher-type-explainer-body')
    // Body must be the type-level explainer, not any merchant string
    // (which we never pass in).
    expect(body.props.children).toBe(voucherTypeExplainer('BOGO'))
  })

  // Collapsible behaviour (locked 2026-05-08 from device QA). The
  // card defaults to collapsed so the voucher detail page stays
  // light. Users tap the header to expand if they want the
  // type-level explanation. Same affordance pattern as HowItWorks.

  describe('collapsible', () => {
    it('defaults to collapsed — body NOT rendered, title still visible', () => {
      const { getByTestId, queryByTestId } = render(<VoucherTypeExplainerCard type="BOGO" />)
      // Title row stays visible (it's the tappable header).
      expect(getByTestId('voucher-type-explainer-title')).toBeTruthy()
      // Body is hidden in the default collapsed state.
      expect(queryByTestId('voucher-type-explainer-body')).toBeNull()
    })

    it('tapping the header expands the card — body becomes visible', () => {
      const { getByTestId, queryByTestId } = render(<VoucherTypeExplainerCard type="BOGO" />)
      expect(queryByTestId('voucher-type-explainer-body')).toBeNull()

      fireEvent.press(getByTestId('voucher-type-explainer-toggle'))
      expect(getByTestId('voucher-type-explainer-body')).toBeTruthy()
    })

    it('tapping the header again collapses the card', () => {
      const { getByTestId, queryByTestId } = render(<VoucherTypeExplainerCard type="BOGO" />)
      const toggle = getByTestId('voucher-type-explainer-toggle')

      fireEvent.press(toggle)
      expect(getByTestId('voucher-type-explainer-body')).toBeTruthy()
      fireEvent.press(toggle)
      expect(queryByTestId('voucher-type-explainer-body')).toBeNull()
    })

    it('accessibilityState.expanded mirrors the visible state', () => {
      const { getByTestId } = render(<VoucherTypeExplainerCard type="BOGO" />)
      const toggle = getByTestId('voucher-type-explainer-toggle')

      // Default: collapsed.
      expect(toggle.props.accessibilityState).toEqual({ expanded: false })
      fireEvent.press(toggle)
      expect(toggle.props.accessibilityState).toEqual({ expanded: true })
    })

    it('accessibilityLabel switches between Expand/Collapse with the per-type title', () => {
      const { getByTestId } = render(<VoucherTypeExplainerCard type="BOGO" />)
      const toggle = getByTestId('voucher-type-explainer-toggle')

      expect(toggle.props.accessibilityLabel).toBe(
        'Expand What is a buy one, get one free voucher?',
      )
      fireEvent.press(toggle)
      expect(toggle.props.accessibilityLabel).toBe(
        'Collapse What is a buy one, get one free voucher?',
      )
    })

    it('defaultExpanded=true opens the card without a tap', () => {
      const { getByTestId } = render(<VoucherTypeExplainerCard type="BOGO" defaultExpanded />)
      expect(getByTestId('voucher-type-explainer-body')).toBeTruthy()
    })
  })

  // Auto-scroll on expand (locked 2026-05-08 from device QA). The
  // card emits `onExpand(layoutY)` after a collapse-to-expand
  // transition so the parent can scroll it into view above the
  // sticky CTA wrap. Tests use fake timers + manual rAF flush since
  // the effect uses requestAnimationFrame to defer the call.
  describe('onExpand scroll-into-view callback', () => {
    let rafSpy: jest.SpyInstance
    beforeEach(() => {
      // Run rAF callbacks synchronously so we don't need fake
      // timers (which can collide with React's scheduler in jest).
      rafSpy = jest
        .spyOn(globalThis, 'requestAnimationFrame')
        .mockImplementation((cb: any) => {
          cb(0)
          return 0 as any
        })
    })
    afterEach(() => {
      rafSpy.mockRestore()
    })

    it('fires onExpand on the collapse-to-expand transition', () => {
      const onExpand = jest.fn()
      const { getByTestId } = render(
        <VoucherTypeExplainerCard type="BOGO" onExpand={onExpand} />,
      )
      // Default collapsed → no fire on initial render.
      expect(onExpand).not.toHaveBeenCalled()
      fireEvent.press(getByTestId('voucher-type-explainer-toggle'))
      // After expand, onExpand fires once with the captured layoutY.
      expect(onExpand).toHaveBeenCalledTimes(1)
      // layoutY default is 0 in the test renderer (no real layout).
      // The contract is that SOMETHING numeric was passed.
      expect(typeof onExpand.mock.calls[0]?.[0]).toBe('number')
    })

    it('does NOT fire onExpand on initial render even when defaultExpanded=true', () => {
      // The effect only fires on a transition; mounting in the
      // expanded state isn't a transition.
      const onExpand = jest.fn()
      render(
        <VoucherTypeExplainerCard type="BOGO" defaultExpanded onExpand={onExpand} />,
      )
      expect(onExpand).not.toHaveBeenCalled()
    })

    it('does NOT fire onExpand when collapsing (expand-to-collapse transition)', () => {
      const onExpand = jest.fn()
      const { getByTestId } = render(
        <VoucherTypeExplainerCard type="BOGO" onExpand={onExpand} />,
      )
      const toggle = getByTestId('voucher-type-explainer-toggle')
      fireEvent.press(toggle)  // expand
      expect(onExpand).toHaveBeenCalledTimes(1)
      fireEvent.press(toggle)  // collapse — no second fire
      expect(onExpand).toHaveBeenCalledTimes(1)
    })
  })
})
