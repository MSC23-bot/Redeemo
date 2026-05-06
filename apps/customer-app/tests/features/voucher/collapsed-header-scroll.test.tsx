import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { CollapsedHeader } from '@/features/voucher/components/CollapsedHeader'

// PR #40 round 11 — CollapsedHeader contract tests.
//
// Round 11 minimalist redesign: only back button + merchant name +
// branch name. No SAVE chip, no voucher title, no type stripe.
// Solid cream bg matching the merchant profile's CollapsedHeader.

const sharedValue = (v: number) => ({ value: v }) as any

const baseProps = {
  merchantName: 'Covelum Restaurant',
  branchName: 'Covelum — Brightlingsea',  // full backend value
  logoUrl: 'https://example.com/logo.png',
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
  it('renders the wrapper + logo + merchant + branch testIDs', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} isActive={false} />)
    expect(getByTestId('collapsed-header-root', HIDDEN_OPT)).toBeTruthy()
    expect(getByTestId('collapsed-header-logo', HIDDEN_OPT)).toBeTruthy()
    expect(getByTestId('collapsed-header-merchant', HIDDEN_OPT)).toBeTruthy()
    expect(getByTestId('collapsed-header-branch', HIDDEN_OPT)).toBeTruthy()
  })

  it('wrapper is non-tappable + a11y-hidden when inactive', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} isActive={false} />)
    const root = getByTestId('collapsed-header-root', HIDDEN_OPT)
    expect(root.props.pointerEvents).toBe('none')
    expect(root.props.accessibilityElementsHidden).toBe(true)
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('renders logo + merchant + branch only — no SAVE chip, no title, no type stripe', () => {
    const { queryByTestId } = render(<CollapsedHeader {...baseProps} />)
    // Round-11 removed elements stay removed:
    expect(queryByTestId('collapsed-header-save-chip', HIDDEN_OPT)).toBeNull()
    expect(queryByTestId('collapsed-header-title', HIDDEN_OPT)).toBeNull()
  })

  it('renders the logo box with a placeholder when logoUrl is null', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} logoUrl={null} />)
    // Logo box still renders (layout stable) — just shows the
    // placeholder fill instead of an Image.
    expect(getByTestId('collapsed-header-logo', HIDDEN_OPT)).toBeTruthy()
  })
})

describe('CollapsedHeader — branch prefix stripping', () => {
  it('strips the merchant prefix from "Covelum — Brightlingsea" -> "Brightlingsea"', () => {
    const { getByTestId } = render(
      <CollapsedHeader {...baseProps} branchName="Covelum — Brightlingsea" />,
    )
    expect(getByTestId('collapsed-header-branch', HIDDEN_OPT).props.children).toBe('Brightlingsea')
  })

  it('handles en-dash separator ("Covelum – Brightlingsea")', () => {
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
    // Merchant still renders.
    expect(getByTestId('collapsed-header-merchant', HIDDEN_OPT).props.children).toBe('Covelum Restaurant')
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

describe('CollapsedHeader — overflow protection', () => {
  it('merchant + branch Texts have numberOfLines=1 + ellipsizeMode=tail', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} />)
    for (const id of ['collapsed-header-merchant', 'collapsed-header-branch']) {
      const node = getByTestId(id, HIDDEN_OPT)
      expect(node.props.numberOfLines).toBe(1)
      expect(node.props.ellipsizeMode).toBe('tail')
    }
  })

  it('merchant uses adjustsFontSizeToFit so long names shrink before truncating', () => {
    const { getByTestId } = render(<CollapsedHeader {...baseProps} />)
    expect(getByTestId('collapsed-header-merchant', HIDDEN_OPT).props.adjustsFontSizeToFit).toBe(true)
  })
})
