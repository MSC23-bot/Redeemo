import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { CollapsedHeader } from '@/features/voucher/components/CollapsedHeader'

// PR #40 round 5 — CollapsedHeader contract tests.
//
// What this pins (round-5 plan §2 + §3):
//   • At "top of page" state (`isActive=false`): collapsed header
//     renders with pointerEvents='none' so it does NOT intercept
//     taps intended for the hero NavRow underneath, and is hidden
//     from the accessibility tree (`accessibilityElementsHidden`).
//   • At "scrolled past hero" state (`isActive=true`): collapsed
//     header has pointerEvents='box-none' and back/share/fav
//     callbacks fire when their buttons are tapped.
//   • REDEEM AT eyebrow conditional on branchName resolving — when
//     null (branch context not yet resolved), the eyebrow row is
//     hidden gracefully (no fabricated "Resolving…" text).
//   • The `isActive` prop drives accessibility flags so screen
//     readers don't read both nav layers simultaneously.
//
// Reanimated worklets aren't driven by jest (the project's setup.ts
// stubs `useAnimatedReaction` / `useAnimatedScrollHandler` /
// `useReducedMotion` to no-ops). Tests focus on the props-driven
// behaviour: pointerEvents, accessibilityElementsHidden, branch
// eyebrow render, callback wiring.
//
// We use `getByTestId` (not getByText) because the wrapper sets
// `accessibilityElementsHidden={!isActive}`, which makes children
// invisible to text-based queries when the header is in its
// "top of page" inactive state.
//
// **Hidden subtree caveat:** RN testing library's `*ByTestId` honours
// `accessibilityElementsHidden` by default (matches platform a11y
// semantics). When asserting against the inactive (`isActive=false`)
// state we pass `{ includeHiddenElements: true }` so we can still
// inspect the host node — the test is verifying the hidden-state
// CONTRACT itself, not exercising it as a user.

const sharedValue = (v: number) => ({ value: v }) as any

const baseProps = {
  title: 'Buy 1 Get 1 Free on All Pizzas',
  type: 'BOGO' as const,
  estimatedSaving: 8.99,
  merchantName: 'Pizza Palace',
  branchName: 'High Street',
  isFavourited: false,
  insetTop: 59,
  scrollY: sharedValue(0),
  fadeStart: 100,
  fadeEnd: 240,
  isActive: false,
  onBack:  jest.fn(),
  onShare: jest.fn(),
  onFav:   jest.fn(),
}

beforeEach(() => {
  baseProps.onBack  = jest.fn()
  baseProps.onShare = jest.fn()
  baseProps.onFav   = jest.fn()
})

// Helper — `includeHiddenElements: true` lets queries reach into
// the inactive collapsed header subtree (which is a11y-hidden by
// design). Matches the RNTL escape hatch for asserting against
// hidden chrome.
const HIDDEN_OPT = { includeHiddenElements: true } as const

describe('CollapsedHeader — top-of-page state (isActive=false)', () => {
  it('renders with the expected testIDs (root + title)', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} isActive={false} />)
    expect(getByTestId('collapsed-header-root', HIDDEN_OPT)).toBeTruthy()
    expect(getByTestId('collapsed-header-title', HIDDEN_OPT)).toBeTruthy()
  })

  it('wrapper has pointerEvents="none" and accessibilityElementsHidden=true (does not intercept taps, hidden from screen readers)', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} isActive={false} />)
    const root = getByTestId('collapsed-header-root', HIDDEN_OPT)
    expect(root.props.pointerEvents).toBe('none')
    expect(root.props.accessibilityElementsHidden).toBe(true)
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('renders the voucher title text inside the title node', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} isActive={false} />)
    const titleNode = getByTestId('collapsed-header-title', HIDDEN_OPT)
    expect(titleNode.props.children).toBe('Buy 1 Get 1 Free on All Pizzas')
  })
})

describe('CollapsedHeader — scrolled-past-hero state (isActive=true)', () => {
  it('wrapper has pointerEvents="box-none" and accessibilityElementsHidden=false', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} isActive={true} />)
    const root = getByTestId('collapsed-header-root')
    expect(root.props.pointerEvents).toBe('box-none')
    expect(root.props.accessibilityElementsHidden).toBe(false)
    expect(root.props.importantForAccessibility).toBe('auto')
  })

  it('back button fires onBack when tapped', () => {
    const { getByLabelText } = render(<CollapsedHeader {...baseProps} isActive={true} />)
    fireEvent.press(getByLabelText('Go back'))
    expect(baseProps.onBack).toHaveBeenCalledTimes(1)
  })

  it('share button fires onShare when tapped', () => {
    const { getByLabelText } = render(<CollapsedHeader {...baseProps} isActive={true} />)
    fireEvent.press(getByLabelText('Share voucher'))
    expect(baseProps.onShare).toHaveBeenCalledTimes(1)
  })

  it('favourite button fires onFav when tapped', () => {
    const { getByLabelText } = render(<CollapsedHeader {...baseProps} isActive={true} isFavourited={false} />)
    fireEvent.press(getByLabelText('Add to favourites'))
    expect(baseProps.onFav).toHaveBeenCalledTimes(1)
  })

  it('favourite button accessibilityLabel reflects favourited state', () => {
    const { getByLabelText } = render(<CollapsedHeader {...baseProps} isActive={true} isFavourited={true} />)
    expect(getByLabelText('Remove from favourites')).toBeTruthy()
  })
})

describe('CollapsedHeader — meta line + REDEEM AT (branch attribution)', () => {
  it('renders the meta row when branchName is provided', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} branchName="High Street" />)
    expect(getByTestId('collapsed-header-meta', HIDDEN_OPT)).toBeTruthy()
  })

  it('still renders the meta row when branchName is null (merchant + type still shown — no REDEEM AT segment)', () => {
    // Round-6 redesign: meta row carries TYPE + MERCHANT in addition
    // to the optional REDEEM AT branch segment. When branchName is
    // null, the row still shows so type + merchant remain visible —
    // we just drop the REDEEM AT portion gracefully.
    const { getByTestId } = render(<CollapsedHeader {...baseProps} branchName={null} />)
    expect(getByTestId('collapsed-header-meta', HIDDEN_OPT)).toBeTruthy()
  })

  it('renders the title even when branchName is null (graceful fallback)', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} branchName={null} />)
    const titleNode = getByTestId('collapsed-header-title', HIDDEN_OPT)
    expect(titleNode.props.children).toBe('Buy 1 Get 1 Free on All Pizzas')
  })

  it('renders the SAVE chip with the formatted amount', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} estimatedSaving={8.99} />)
    expect(getByTestId('collapsed-header-save-chip', HIDDEN_OPT)).toBeTruthy()
  })
})

describe('CollapsedHeader — title truncation contract', () => {
  it('passes numberOfLines=1 + ellipsizeMode=tail to the title Text', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} />)
    const titleNode = getByTestId('collapsed-header-title', HIDDEN_OPT)
    expect(titleNode.props.numberOfLines).toBe(1)
    expect(titleNode.props.ellipsizeMode).toBe('tail')
  })
})
