import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { CollapsedHeader } from '@/features/voucher/components/CollapsedHeader'

// PR #40 round 8 — CollapsedHeader contract tests.
//
// What this pins:
//   • At "top of page" state (`isActive=false`): collapsed header
//     renders with pointerEvents='none' so it does NOT intercept
//     taps intended for the hero NavRow underneath, and is hidden
//     from the accessibility tree (`accessibilityElementsHidden`).
//   • At "scrolled past hero" state (`isActive=true`): collapsed
//     header has pointerEvents='box-none' and the back-button
//     callback fires when tapped.
//   • Three-line text stack (round-8 redesign): merchant / branch
//     / title rendered with their own testIDs. Branch line drops
//     gracefully when `branchName` is null.
//   • SAVE chip renders with the formatted amount.
//
// We use `getByTestId` (not getByText) because the wrapper sets
// `accessibilityElementsHidden={!isActive}`. Pass
// `{ includeHiddenElements: true }` to inspect the inactive subtree.

const sharedValue = (v: number) => ({ value: v }) as any

const baseProps = {
  title: 'Buy 1 Get 1 Free on All Pizzas',
  type: 'BOGO' as const,
  estimatedSaving: 8.99,
  merchantName: 'Pizza Palace',
  branchName: 'High Street',
  insetTop: 59,
  scrollY: sharedValue(0),
  fadeStart: 100,
  fadeEnd: 240,
  isActive: false,
  onBack: jest.fn(),
}

beforeEach(() => {
  baseProps.onBack = jest.fn()
})

const HIDDEN_OPT = { includeHiddenElements: true } as const

describe('CollapsedHeader — top-of-page state (isActive=false)', () => {
  it('renders the wrapper + the three text-stack nodes', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} isActive={false} />)
    expect(getByTestId('collapsed-header-root', HIDDEN_OPT)).toBeTruthy()
    expect(getByTestId('collapsed-header-merchant', HIDDEN_OPT)).toBeTruthy()
    expect(getByTestId('collapsed-header-branch', HIDDEN_OPT)).toBeTruthy()
    expect(getByTestId('collapsed-header-title', HIDDEN_OPT)).toBeTruthy()
  })

  it('wrapper has pointerEvents="none" + accessibilityElementsHidden=true', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} isActive={false} />)
    const root = getByTestId('collapsed-header-root', HIDDEN_OPT)
    expect(root.props.pointerEvents).toBe('none')
    expect(root.props.accessibilityElementsHidden).toBe(true)
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('renders the voucher content in the documented order — merchant / branch / title', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} isActive={false} />)
    expect(getByTestId('collapsed-header-merchant', HIDDEN_OPT).props.children).toBe('Pizza Palace')
    expect(getByTestId('collapsed-header-branch', HIDDEN_OPT).props.children).toBe('High Street')
    expect(getByTestId('collapsed-header-title', HIDDEN_OPT).props.children).toBe('Buy 1 Get 1 Free on All Pizzas')
  })
})

describe('CollapsedHeader — scrolled-past-hero state (isActive=true)', () => {
  it('wrapper has pointerEvents="box-none" + accessibilityElementsHidden=false', () => {
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

  it('does NOT render share/favourite controls (per round-8 owner direction — identity-only chrome)', () => {
    const { queryByLabelText } = render(<CollapsedHeader {...baseProps} isActive={true} />)
    expect(queryByLabelText('Share voucher')).toBeNull()
    expect(queryByLabelText('Add to favourites')).toBeNull()
    expect(queryByLabelText('Remove from favourites')).toBeNull()
  })
})

describe('CollapsedHeader — branch line conditional rendering', () => {
  it('renders the branch line when branchName is provided', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} branchName="High Street" />)
    expect(getByTestId('collapsed-header-branch', HIDDEN_OPT).props.children).toBe('High Street')
  })

  it('omits the branch line when branchName is null (no fabricated copy)', () => {
    const { queryByTestId, getByTestId } = render(<CollapsedHeader {...baseProps} branchName={null} />)
    expect(queryByTestId('collapsed-header-branch', HIDDEN_OPT)).toBeNull()
    // Merchant + title still render.
    expect(getByTestId('collapsed-header-merchant', HIDDEN_OPT).props.children).toBe('Pizza Palace')
    expect(getByTestId('collapsed-header-title', HIDDEN_OPT).props.children).toBe('Buy 1 Get 1 Free on All Pizzas')
  })
})

describe('CollapsedHeader — SAVE chip', () => {
  it('renders the chip with the formatted amount', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} estimatedSaving={2.5} />)
    expect(getByTestId('collapsed-header-save-chip', HIDDEN_OPT)).toBeTruthy()
  })

  it('chip survives large amounts (£100, £1000) without crashing', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} estimatedSaving={1000} />)
    expect(getByTestId('collapsed-header-save-chip', HIDDEN_OPT)).toBeTruthy()
  })
})

describe('CollapsedHeader — overflow protection (impeccable + ui-ux-pro-max law: nothing leaks)', () => {
  it('all three text Texts have numberOfLines=1 + ellipsizeMode=tail', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} />)
    const merchant = getByTestId('collapsed-header-merchant', HIDDEN_OPT)
    const branch   = getByTestId('collapsed-header-branch',   HIDDEN_OPT)
    const title    = getByTestId('collapsed-header-title',    HIDDEN_OPT)
    for (const node of [merchant, branch, title]) {
      expect(node.props.numberOfLines).toBe(1)
      expect(node.props.ellipsizeMode).toBe('tail')
    }
  })

  it('merchant + title use adjustsFontSizeToFit so long content shrinks before truncating', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} />)
    const merchant = getByTestId('collapsed-header-merchant', HIDDEN_OPT)
    const title    = getByTestId('collapsed-header-title',    HIDDEN_OPT)
    expect(merchant.props.adjustsFontSizeToFit).toBe(true)
    expect(title.props.adjustsFontSizeToFit).toBe(true)
  })
})
