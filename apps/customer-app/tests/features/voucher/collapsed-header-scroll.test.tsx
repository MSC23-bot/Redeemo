import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { CollapsedHeader } from '@/features/voucher/components/CollapsedHeader'

// PR #40 round 10 — CollapsedHeader contract tests.
//
// Round 10 redesigns the collapsed chrome to match the merchant
// profile's collapsed style (solid cream bg, no BlurView) and
// reorders the text stack so merchant + branch sit at top (next to
// the back button — back returns to merchant profile, so merchant
// context next to back is correct), with the voucher title on the
// third line as voucher-specific context.
//
// Branch is stripped of the merchant prefix via `branchShortName()`
// — same helper the merchant profile uses, so "Covelum —
// Brightlingsea" displays as "Brightlingsea".

const sharedValue = (v: number) => ({ value: v }) as any

const baseProps = {
  title: 'Free Filter Coffee with Any Thali',
  type: 'FREEBIE' as const,
  estimatedSaving: 2.5,
  merchantName: 'Covelum Restaurant',
  branchName: 'Covelum — Brightlingsea',  // full backend value
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
  it('renders the wrapper + merchant + branch + title testIDs', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} isActive={false} />)
    expect(getByTestId('collapsed-header-root', HIDDEN_OPT)).toBeTruthy()
    expect(getByTestId('collapsed-header-merchant', HIDDEN_OPT)).toBeTruthy()
    expect(getByTestId('collapsed-header-branch', HIDDEN_OPT)).toBeTruthy()
    expect(getByTestId('collapsed-header-title', HIDDEN_OPT)).toBeTruthy()
  })

  it('wrapper is non-tappable + a11y-hidden when inactive', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} isActive={false} />)
    const root = getByTestId('collapsed-header-root', HIDDEN_OPT)
    expect(root.props.pointerEvents).toBe('none')
    expect(root.props.accessibilityElementsHidden).toBe(true)
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('reordered: merchant first (next to back button), branch second, title third', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} />)
    expect(getByTestId('collapsed-header-merchant', HIDDEN_OPT).props.children)
      .toBe('Covelum Restaurant')
    expect(getByTestId('collapsed-header-title', HIDDEN_OPT).props.children)
      .toBe('Free Filter Coffee with Any Thali')
  })
})

describe('CollapsedHeader — branch prefix stripping', () => {
  it('strips the "Covelum — " merchant prefix from "Covelum — Brightlingsea" -> "Brightlingsea"', () => {
    const { getByTestId } = render(
      <CollapsedHeader {...baseProps} branchName="Covelum — Brightlingsea" />,
    )
    expect(getByTestId('collapsed-header-branch', HIDDEN_OPT).props.children).toBe('Brightlingsea')
  })

  it('handles en-dash separator too ("Covelum – Brightlingsea")', () => {
    const { getByTestId } = render(
      <CollapsedHeader {...baseProps} branchName="Covelum – Brightlingsea" />,
    )
    expect(getByTestId('collapsed-header-branch', HIDDEN_OPT).props.children).toBe('Brightlingsea')
  })

  it('handles hyphen-with-spaces separator ("Pizza Palace - High Street")', () => {
    const { getByTestId } = render(
      <CollapsedHeader {...baseProps} branchName="Pizza Palace - High Street" />,
    )
    expect(getByTestId('collapsed-header-branch', HIDDEN_OPT).props.children).toBe('High Street')
  })

  it('passes branch through unchanged when no separator is present', () => {
    const { getByTestId } = render(
      <CollapsedHeader {...baseProps} branchName="High Street" />,
    )
    expect(getByTestId('collapsed-header-branch', HIDDEN_OPT).props.children).toBe('High Street')
  })

  it('omits the branch line entirely when branchName is null (no fabricated copy)', () => {
    const { queryByTestId, getByTestId } = render(
      <CollapsedHeader {...baseProps} branchName={null} />,
    )
    expect(queryByTestId('collapsed-header-branch', HIDDEN_OPT)).toBeNull()
    // Merchant + title still render.
    expect(getByTestId('collapsed-header-merchant', HIDDEN_OPT).props.children).toBe('Covelum Restaurant')
    expect(getByTestId('collapsed-header-title', HIDDEN_OPT).props.children)
      .toBe('Free Filter Coffee with Any Thali')
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
  it('all text Texts have numberOfLines=1 + ellipsizeMode=tail', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} />)
    for (const id of ['collapsed-header-merchant', 'collapsed-header-branch', 'collapsed-header-title']) {
      const node = getByTestId(id, HIDDEN_OPT)
      expect(node.props.numberOfLines).toBe(1)
      expect(node.props.ellipsizeMode).toBe('tail')
    }
  })

  it('merchant + title use adjustsFontSizeToFit so long content shrinks before truncating', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} />)
    expect(getByTestId('collapsed-header-merchant', HIDDEN_OPT).props.adjustsFontSizeToFit).toBe(true)
    expect(getByTestId('collapsed-header-title', HIDDEN_OPT).props.adjustsFontSizeToFit).toBe(true)
  })
})
