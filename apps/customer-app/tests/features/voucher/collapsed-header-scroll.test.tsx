import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { CollapsedHeader } from '@/features/voucher/components/CollapsedHeader'

// PR #40 round 9 — CollapsedHeader contract tests.
//
// Round-9 redesign: 2-line text stack (title primary, merchant·branch
// secondary) per owner direction that the round-8 title was
// unreadably small. Save chip texts now use textAlign='center' to
// fix the round-8 visual off-center.
//
// `accessibilityElementsHidden` makes the inactive subtree invisible
// to default queries — pass `{ includeHiddenElements: true }` to
// inspect it.

const sharedValue = (v: number) => ({ value: v }) as any

const baseProps = {
  title: 'Free Filter Coffee with Any Thali',
  type: 'FREEBIE' as const,
  estimatedSaving: 2.5,
  merchantName: 'Covelum Restaurant',
  branchName: 'Brightlingsea',
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
  it('renders the wrapper + title + context line testIDs', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} isActive={false} />)
    expect(getByTestId('collapsed-header-root', HIDDEN_OPT)).toBeTruthy()
    expect(getByTestId('collapsed-header-title', HIDDEN_OPT)).toBeTruthy()
    expect(getByTestId('collapsed-header-context', HIDDEN_OPT)).toBeTruthy()
  })

  it('wrapper is non-tappable + a11y-hidden when inactive', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} isActive={false} />)
    const root = getByTestId('collapsed-header-root', HIDDEN_OPT)
    expect(root.props.pointerEvents).toBe('none')
    expect(root.props.accessibilityElementsHidden).toBe(true)
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('renders title as primary + merchant·branch combined as context', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} />)
    expect(getByTestId('collapsed-header-title', HIDDEN_OPT).props.children)
      .toBe('Free Filter Coffee with Any Thali')
    expect(getByTestId('collapsed-header-context', HIDDEN_OPT).props.children)
      .toBe('Covelum Restaurant · Brightlingsea')
  })
})

describe('CollapsedHeader — scrolled-past-hero state (isActive=true)', () => {
  it('wrapper becomes tappable + a11y-visible when active', () => {
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

  it('does NOT render share/favourite controls (identity-only chrome)', () => {
    const { queryByLabelText } = render(<CollapsedHeader {...baseProps} isActive={true} />)
    expect(queryByLabelText('Share voucher')).toBeNull()
    expect(queryByLabelText('Add to favourites')).toBeNull()
    expect(queryByLabelText('Remove from favourites')).toBeNull()
  })
})

describe('CollapsedHeader — branch handling on the context line', () => {
  it('combines merchant + branch with " · " separator when both present', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} merchantName="A Merchant" branchName="B Branch" />)
    expect(getByTestId('collapsed-header-context', HIDDEN_OPT).props.children).toBe('A Merchant · B Branch')
  })

  it('shows just the merchant when branchName is null (no fabricated copy, no trailing separator)', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} merchantName="A Merchant" branchName={null} />)
    expect(getByTestId('collapsed-header-context', HIDDEN_OPT).props.children).toBe('A Merchant')
  })

  it('still renders the title even when branchName is null', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} branchName={null} />)
    expect(getByTestId('collapsed-header-title', HIDDEN_OPT).props.children)
      .toBe('Free Filter Coffee with Any Thali')
  })
})

describe('CollapsedHeader — SAVE chip', () => {
  it('renders the chip', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} />)
    expect(getByTestId('collapsed-header-save-chip', HIDDEN_OPT)).toBeTruthy()
  })

  it('chip survives large amounts (£100 / £1000) without crashing', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} estimatedSaving={1000} />)
    expect(getByTestId('collapsed-header-save-chip', HIDDEN_OPT)).toBeTruthy()
  })
})

describe('CollapsedHeader — overflow protection', () => {
  it('title has numberOfLines=1 + ellipsizeMode=tail + adjustsFontSizeToFit', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} />)
    const node = getByTestId('collapsed-header-title', HIDDEN_OPT)
    expect(node.props.numberOfLines).toBe(1)
    expect(node.props.ellipsizeMode).toBe('tail')
    expect(node.props.adjustsFontSizeToFit).toBe(true)
  })

  it('context line has numberOfLines=1 + ellipsizeMode=tail', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} />)
    const node = getByTestId('collapsed-header-context', HIDDEN_OPT)
    expect(node.props.numberOfLines).toBe(1)
    expect(node.props.ellipsizeMode).toBe('tail')
  })
})
