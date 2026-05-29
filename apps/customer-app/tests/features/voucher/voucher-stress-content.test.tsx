import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CouponHeader } from '@/features/voucher/components/CouponHeader'
import { CollapsedHeader } from '@/features/voucher/components/CollapsedHeader'
import { CouponBodyCard } from '@/features/voucher/components/CouponBody'
import { MerchantRow } from '@/features/voucher/components/MerchantRow'

// Phase 3C.1g M2.10 — CouponHeader embeds `<FavouriteHeart>` which
// calls `useFavourite()` → `useQueryClient()`.  Wrap render here so
// existing test bodies stay untouched.
function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
  return rtlRender(node, { wrapper: Wrapper })
}

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
    voucherId: 'v-1',
    voucherIsFavourited: false,
    isRedeemedThisCycle: false,
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
    voucherId: 'v-1',
    voucherIsFavourited: false,
    isRedeemedThisCycle: false,
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

describe('CouponHeader — dimmed prop applies to visual layer ONLY, never the nav buttons (PR-B T8h)', () => {
  // Owner-reported device QA: when the redeemed seal renders, the
  // back / share / favourite buttons in the hero NavRow read as
  // washed-out because the previous `<View style={heroDimmed}>`
  // wrapper applied opacity 0.55 to the entire CouponHeader subtree.
  // T8h moves the dim INTO CouponHeader as a `dimmed` prop applied
  // selectively to gradient + content + saveBadge.  These pins guard
  // the contract: action controls stay full opacity, voucher visuals
  // get the stamp-effect dim.

  const baseProps = {
    type: 'BOGO' as const,
    title: 'Test voucher',
    description: 'Test description',
    estimatedSaving: 8.99,
    insetTop: 59,
    onBack:  jest.fn(),
    onShare: jest.fn(),
    voucherId: 'v-1',
    voucherIsFavourited: false,
    isRedeemedThisCycle: false,
  }

  function flat(node: any): Record<string, any> {
    const s = node?.props?.style
    if (!s) return {}
    if (Array.isArray(s)) return Object.assign({}, ...s.flat(Infinity).filter(Boolean))
    return s
  }

  it('default (dimmed omitted) — gradient, content, and save badge are NOT dimmed', () => {
    const { getByTestId } = render(<CouponHeader {...baseProps} />)
    expect(flat(getByTestId('coupon-header-gradient')).opacity).toBeUndefined()
    expect(flat(getByTestId('coupon-header-content')).opacity).toBeUndefined()
    expect(flat(getByTestId('coupon-header-save-badge')).opacity).toBeUndefined()
  })

  it('dimmed=true — gradient + content + saveBadge get opacity 0.55 (T8i revert: the approved Voucher Detail hero treatment is the flat-opacity dim, NOT the cream gradient wash overlay that briefly shipped at T8h)', () => {
    const { getByTestId } = render(<CouponHeader {...baseProps} dimmed />)
    expect(flat(getByTestId('coupon-header-gradient')).opacity).toBe(0.55)
    expect(flat(getByTestId('coupon-header-content')).opacity).toBe(0.55)
    expect(flat(getByTestId('coupon-header-save-badge')).opacity).toBe(0.55)
  })

  it('dimmed=true — back / share / favourite nav buttons keep full opacity (NEVER washed out alongside the visual layer)', () => {
    const { getByLabelText } = render(<CouponHeader {...baseProps} dimmed />)
    // Walk up from each nav button to its nearest opacity-bearing
    // ancestor (any wrapping View styled with opacity).  The contract
    // is: NO ancestor in the navRow path ever carries opacity 0.55.
    const buttons = [
      getByLabelText('Go back'),
      getByLabelText('Share voucher'),
      getByLabelText('Add to favourites'),
    ]
    for (const btn of buttons) {
      let n: any = btn
      while (n) {
        const s = flat(n)
        // The only opacity allowed in the nav button's ancestry is the
        // pressed-state 0.85 (only present mid-tap; not in baseline
        // render) or the navAnimStyle scroll fade (1 at scrollY=0).
        // 0.55 is the dim's signature value — must NEVER appear here.
        expect(s.opacity).not.toBe(0.55)
        n = n.parent
      }
    }
  })

  it('dimmed=true — favourite button keeps full opacity when voucherIsFavourited toggles', () => {
    // Phase 3C.1g M2.10 — old `isFavourited` prop is now
    // `voucherIsFavourited`.  Heart label still flips via the same
    // FavouriteHeart a11y contract.
    const { getByLabelText } = render(<CouponHeader {...baseProps} dimmed voucherIsFavourited />)
    let n: any = getByLabelText('Remove from favourites')
    while (n) {
      expect(flat(n).opacity).not.toBe(0.55)
      n = n.parent
    }
  })

  it('dimmed=true — does NOT mount the cream gradient wash overlay (T8i revert pin: the wash overlay was an experiment from T8h applied to the wrong surface; the approved Voucher Detail hero behaviour is the flat-opacity dim ONLY)', () => {
    const { queryByTestId } = render(<CouponHeader {...baseProps} dimmed />)
    expect(queryByTestId('coupon-header-wash-overlay')).toBeNull()
  })
})

// ── CollapsedHeader stress tests ───────────────────────────────────

describe('CollapsedHeader — long content doesn\'t break layout', () => {
  const baseProps = {
    merchantName: FIXTURES.longMerchant,
    branchName: FIXTURES.longBranch,
    logoUrl: null,
    insetTop: 59,
    scrollY: sharedValue(300),
    fadeStart: 100,
    fadeEnd: 240,
    isActive: true,
    onBack: jest.fn(),
  }

  it('renders without crashing for long merchant + long branch', () => {
    // Round-11: collapsed chrome carries only merchant + branch.
    const { getByTestId } = render(<CollapsedHeader {...baseProps} />)
    expect(getByTestId('collapsed-header-root', HIDDEN_OPT)).toBeTruthy()
    expect(getByTestId('collapsed-header-merchant', HIDDEN_OPT)).toBeTruthy()
    expect(getByTestId('collapsed-header-branch', HIDDEN_OPT)).toBeTruthy()
  })

  it('merchant Text has numberOfLines=1 + ellipsizeMode=tail', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} />)
    const node = getByTestId('collapsed-header-merchant', HIDDEN_OPT)
    expect(node.props.numberOfLines).toBe(1)
    expect(node.props.ellipsizeMode).toBe('tail')
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
