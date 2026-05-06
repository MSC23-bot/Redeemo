import React from 'react'
import { render } from '@testing-library/react-native'
import { CouponHeader } from '@/features/voucher/components/CouponHeader'
import { CollapsedHeader } from '@/features/voucher/components/CollapsedHeader'
import { CouponBodyCard } from '@/features/voucher/components/CouponBody'
import { MerchantRow } from '@/features/voucher/components/MerchantRow'

// PR #40 round 7 — stress-test variable voucher content.
//
// Voucher title, description, terms, estimatedSaving, and merchant
// data all come from backend (admin / merchant entry). The UI must
// gracefully handle:
//   • long titles (no overlap with save badge or nav buttons)
//   • long descriptions (wrap, don't collide with body)
//   • large savings (£100, £250, £1,000) without overflowing the
//     circular save badge
//   • long merchant names + long branch names in the same row
//
// We do NOT replace real backend values with fake placeholders. We
// build fixtures that mirror plausible long-content scenarios and
// assert each component renders without crashing + that the
// truncation / adaptive-sizing contracts are in place.

const sharedValue = (v: number) => ({ value: v }) as any

const HIDDEN_OPT = { includeHiddenElements: true } as const

// ── Fixtures — long real-world voucher content ─────────────────────

const FIXTURES = {
  longTitle:
    'Buy One Premium Margherita Pizza, Get a Second of Equal or Lesser Value Completely Free Throughout October',
  longDescription:
    'Choose any pizza from our extensive Italian menu including the artisan stone-baked range, ' +
    'gluten-free options, and our award-winning seafood specialities. Second pizza must be of ' +
    'equal or lesser value. Cannot be combined with other promotions. Valid only at the High ' +
    'Street and Brightlingsea waterfront branches during regular dinner service.',
  longTerms:
    'Valid on dine-in orders only. Second pizza must be of equal or lesser value. ' +
    'Minimum spend of £25 across the full table required. One redemption per monthly ' +
    'subscription cycle. Cannot be combined with other promotions, happy hour pricing, ' +
    'or third-party delivery vouchers. Valid at all eight Pizza Palace branches across ' +
    'Essex, Suffolk, and East London. Subject to merchant availability and may be ' +
    'restricted on bank holidays and other peak dining periods.',
  longMerchant: 'Brightlingsea Waterfront Italian Restaurant & Pizzeria',
  longBranch:   'High Street, Brightlingsea Waterfront — Main Branch',
  largeSaving100:  100,
  largeSaving250:  250.50,
  largeSaving1k:   1000,
  largeSaving1k50: 1050.99,
}

// ── CouponHeader stress tests ──────────────────────────────────────

describe('CouponHeader — long titles and descriptions don\'t overlap save badge', () => {
  const baseProps = {
    type: 'BOGO' as const,
    title: FIXTURES.longTitle,
    description: FIXTURES.longDescription,
    estimatedSaving: 8.99,
    insetTop: 59,
    onBack:  jest.fn(),
    onShare: jest.fn(),
    onFav:   jest.fn(),
    isFavourited: false,
  }

  it('renders without crashing for very long title', () => {
    const { getByTestId } = render(<CouponHeader {...baseProps} />)
    expect(getByTestId('coupon-header')).toBeTruthy()
  })

  it('title Text has numberOfLines=3 and ellipsizeMode=tail to truncate long content', () => {
    const { UNSAFE_getAllByProps } = render(<CouponHeader {...baseProps} />)
    // The title is rendered inside the content column. Find the
    // Text node carrying the long title.
    const titleNodes = UNSAFE_getAllByProps({ children: FIXTURES.longTitle })
    expect(titleNodes.length).toBeGreaterThan(0)
    expect(titleNodes[0]?.props.numberOfLines).toBe(3)
    expect(titleNodes[0]?.props.ellipsizeMode).toBe('tail')
  })

  it('description Text has numberOfLines=3 + ellipsize so long descriptions don\'t flood the hero', () => {
    const { UNSAFE_getAllByProps } = render(<CouponHeader {...baseProps} />)
    const descNodes = UNSAFE_getAllByProps({ children: FIXTURES.longDescription })
    expect(descNodes.length).toBeGreaterThan(0)
    expect(descNodes[0]?.props.numberOfLines).toBe(3)
    expect(descNodes[0]?.props.ellipsizeMode).toBe('tail')
  })

  it('renders without crashing when description is null', () => {
    const { getByTestId } = render(<CouponHeader {...baseProps} description={null} />)
    expect(getByTestId('coupon-header')).toBeTruthy()
  })
})

describe('CouponHeader — save badge adapts to large amounts', () => {
  const baseProps = {
    type: 'BOGO' as const,
    title: 'Test',
    description: null,
    insetTop: 59,
    onBack:  jest.fn(),
    onShare: jest.fn(),
    onFav:   jest.fn(),
    isFavourited: false,
  }

  it.each([
    ['£100',     FIXTURES.largeSaving100],
    ['£250.50',  FIXTURES.largeSaving250],
    ['£1000',    FIXTURES.largeSaving1k],
    ['£1050.99', FIXTURES.largeSaving1k50],
  ])('renders save badge with %s without crashing (large amount)', (_label, amount) => {
    const { getByTestId } = render(<CouponHeader {...baseProps} estimatedSaving={amount} />)
    expect(getByTestId('coupon-header')).toBeTruthy()
  })

  it('save amount Text has adjustsFontSizeToFit + numberOfLines=1 + minimumFontScale for large values', () => {
    const { UNSAFE_getAllByProps } = render(<CouponHeader {...baseProps} estimatedSaving={1000} />)
    // formatPounds(1000) -> "£1000". Find the rendered amount Text.
    const amountNodes = UNSAFE_getAllByProps({ children: '£1000' })
    expect(amountNodes.length).toBeGreaterThan(0)
    expect(amountNodes[0]?.props.adjustsFontSizeToFit).toBe(true)
    expect(amountNodes[0]?.props.numberOfLines).toBe(1)
    expect(amountNodes[0]?.props.minimumFontScale).toBeGreaterThan(0)
    expect(amountNodes[0]?.props.minimumFontScale).toBeLessThan(1)
  })
})

// ── CollapsedHeader stress tests ───────────────────────────────────

describe('CollapsedHeader — long content doesn\'t break layout', () => {
  const baseProps = {
    title: FIXTURES.longTitle,
    type: 'BOGO' as const,
    estimatedSaving: 8.99,
    merchantName: FIXTURES.longMerchant,
    branchName: FIXTURES.longBranch,
    insetTop: 59,
    scrollY: sharedValue(300),
    fadeStart: 100,
    fadeEnd: 240,
    isActive: true,
    onBack: jest.fn(),
  }

  it('renders without crashing for long title + long merchant + long branch', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} />)
    expect(getByTestId('collapsed-header-root', HIDDEN_OPT)).toBeTruthy()
    expect(getByTestId('collapsed-header-merchant', HIDDEN_OPT)).toBeTruthy()
    expect(getByTestId('collapsed-header-branch', HIDDEN_OPT)).toBeTruthy()
    expect(getByTestId('collapsed-header-title', HIDDEN_OPT)).toBeTruthy()
  })

  it('collapsed title has numberOfLines=1 + ellipsize tail (single-line truncation)', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} />)
    const titleNode = getByTestId('collapsed-header-title', HIDDEN_OPT)
    expect(titleNode.props.numberOfLines).toBe(1)
    expect(titleNode.props.ellipsizeMode).toBe('tail')
  })

  it('save chip on collapsed header adapts to large amounts', () => {
    const { getByTestId, UNSAFE_getAllByProps } = render(
      <CollapsedHeader {...baseProps} estimatedSaving={FIXTURES.largeSaving1k50} />
    )
    expect(getByTestId('collapsed-header-save-chip', HIDDEN_OPT)).toBeTruthy()
    const amountNodes = UNSAFE_getAllByProps({ children: '£1050.99' })
    expect(amountNodes.length).toBeGreaterThan(0)
    expect(amountNodes[0]?.props.adjustsFontSizeToFit).toBe(true)
    expect(amountNodes[0]?.props.numberOfLines).toBe(1)
  })
})

// ── CouponBodyCard stress tests ────────────────────────────────────

describe('CouponBodyCard — long terms don\'t crash, render bullets', () => {
  it('renders without crashing for long paragraph terms', () => {
    const { getByText } = render(
      <CouponBodyCard type="BOGO" terms={FIXTURES.longTerms} />
    )
    // First sentence of the long terms appears as the first bullet.
    expect(getByText(/Valid on dine-in orders only/)).toBeTruthy()
  })

  it('renders without crashing when terms are null', () => {
    const { getByText } = render(<CouponBodyCard type="BOGO" terms={null} />)
    // Fair Use Policy still renders even without terms.
    expect(getByText(/Fair Use Policy/)).toBeTruthy()
  })
})

// ── MerchantRow stress tests ───────────────────────────────────────

describe('MerchantRow — long names don\'t break the card', () => {
  it('renders without crashing for long merchant name + long branch + far distance', () => {
    const { getByTestId } = render(
      <MerchantRow
        merchantName={FIXTURES.longMerchant}
        merchantLogoUrl={null}
        merchantDescriptor="Italian · Food & Drink · Family-friendly"
        branchName={FIXTURES.longBranch}
        branchDistanceMeters={5_134_567}  // 3,190 mi — distance hide threshold
        isMultiBranch={true}
        onChangeBranch={jest.fn()}
        onPress={jest.fn()}
      />
    )
    expect(getByTestId('merchant-row')).toBeTruthy()
  })

  it('hides distance label for absurd distances (>= 200 mi) so the row stays single-line', () => {
    // 5_134_567 metres ≈ 3,190 mi → distance returns null and the
    // branch line shows just the branch name without an overflowing
    // "3190 mi" suffix.
    const { queryByText } = render(
      <MerchantRow
        merchantName="Test"
        merchantLogoUrl={null}
        merchantDescriptor={null}
        branchName="Test Branch"
        branchDistanceMeters={5_134_567}
        isMultiBranch={false}
      />
    )
    expect(queryByText(/3190 mi/)).toBeNull()
    expect(queryByText(/3,190 mi/)).toBeNull()
  })
})
