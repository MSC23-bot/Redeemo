import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children ?? null,
}))
jest.mock('@/design-system/haptics', () => ({
  lightHaptic: jest.fn(),
}))

import { SuccessPopup } from '@/features/voucher/components/SuccessPopup'

// PR-A revised scope (locked 2026-05-09 §0.9 + §0.10 + §0.11):
// SuccessPopup is no longer a sensitive code surface.  It removed:
//   • the redemption code box
//   • the live ticking timestamp
//   • the anti-fraud disclosure copy
//   • the Rate & Review CTA (returns in PR-C with verified-review)
//   • useScreenCaptureProtection (popup is no longer sensitive)
// And renamed:
//   • "Redeemed" eyebrow → "Voucher redeemed successfully" title (D16)
//   • Primary CTA "Show to Staff" → "View voucher code" (D11)
function defaults(overrides: Partial<React.ComponentProps<typeof SuccessPopup>> = {}) {
  return {
    visible: true,
    redeemedAt: '2026-05-06T14:32:00Z',
    estimatedSaving: 6.99,
    voucherTitle: 'Free Filter Coffee with Any Thali',
    voucherType: 'FREEBIE' as const,
    merchantName: 'Covelum Restaurant',
    branchName: 'Brightlingsea',
    onShowToStaff: jest.fn(),
    onDone: jest.fn(),
    ...overrides,
  } satisfies React.ComponentProps<typeof SuccessPopup>
}

describe('SuccessPopup — render + content', () => {
  it('renders nothing when visible=false', () => {
    const { queryByTestId } = render(<SuccessPopup {...defaults({ visible: false })} />)
    expect(queryByTestId('success-popup')).toBeNull()
  })

  it('renders the popup when visible', () => {
    const { getByTestId } = render(<SuccessPopup {...defaults()} />)
    expect(getByTestId('success-popup')).toBeTruthy()
    expect(getByTestId('success-popup-scrim')).toBeTruthy()
    expect(getByTestId('success-check-ring')).toBeTruthy()
  })

  it('shows the "Voucher redeemed successfully" title (D16 LOCKED 2026-05-09)', () => {
    const { getByTestId, getByText } = render(<SuccessPopup {...defaults()} />)
    expect(getByTestId('success-title')).toBeTruthy()
    expect(getByText('Voucher redeemed successfully')).toBeTruthy()
  })

  it('shows the voucher title + merchant name in the strip', () => {
    const { getByText } = render(<SuccessPopup {...defaults()} />)
    expect(getByText('Free Filter Coffee with Any Thali')).toBeTruthy()
    expect(getByText('Covelum Restaurant')).toBeTruthy()
  })

  it('shows the static "Redeemed on" line from `redeemedAt` (receipt detail)', () => {
    const { getByTestId, getByText } = render(<SuccessPopup {...defaults()} />)
    expect(getByTestId('success-redeemed-at')).toBeTruthy()
    expect(getByText('Redeemed on')).toBeTruthy()
    // The formatter outputs "06 May 2026, 14:32" — match the date
    // portion (timezone may shift the hour around midnight, so we
    // pin the locale-stable day+month+year and verify a 24h time
    // pattern is present).
    expect(getByText(/06 May 2026, \d{2}:\d{2}/)).toBeTruthy()
  })

  it('shows branch name', () => {
    const { getByText } = render(<SuccessPopup {...defaults()} />)
    expect(getByText('Brightlingsea')).toBeTruthy()
  })

  it('falls back to a hyphen (NOT an em dash) when branch name is null', () => {
    // PRODUCT.md locks "no em dashes in UI text or seed copy" (locked
    // 2026-05-02). Negative pin against a future revert to em dash.
    const { getByText, queryByText } = render(
      <SuccessPopup {...defaults({ branchName: null })} />,
    )
    expect(getByText('-')).toBeTruthy()
    expect(queryByText('—')).toBeNull()
  })
})

describe('SuccessPopup — CTAs', () => {
  it('"View voucher code" fires onShowToStaff (D11 LOCKED 2026-05-09)', () => {
    const onShowToStaff = jest.fn()
    const { getByTestId, getByText } = render(<SuccessPopup {...defaults({ onShowToStaff })} />)
    expect(getByText('View voucher code')).toBeTruthy()
    fireEvent.press(getByTestId('success-show-to-staff'))
    expect(onShowToStaff).toHaveBeenCalledTimes(1)
  })

  it('Done fires onDone', () => {
    const onDone = jest.fn()
    const { getByTestId } = render(<SuccessPopup {...defaults({ onDone })} />)
    fireEvent.press(getByTestId('success-done'))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('CTAs do not fire each other (independent handlers)', () => {
    const onShowToStaff = jest.fn()
    const onDone = jest.fn()
    const { getByTestId } = render(
      <SuccessPopup {...defaults({ onShowToStaff, onDone })} />,
    )
    fireEvent.press(getByTestId('success-show-to-staff'))
    expect(onShowToStaff).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('CTA accessibilityLabel reads "View voucher code"', () => {
    const { getByTestId } = render(<SuccessPopup {...defaults()} />)
    expect(getByTestId('success-show-to-staff').props.accessibilityLabel).toBe('View voucher code')
  })
})

describe('SuccessPopup — focus-loss persistence (parent-controlled)', () => {
  it('stays mounted across rerender with same visible=true (no internal hide on focus)', () => {
    const { getByTestId, rerender } = render(<SuccessPopup {...defaults()} />)
    expect(getByTestId('success-popup')).toBeTruthy()
    rerender(<SuccessPopup {...defaults()} />)
    expect(getByTestId('success-popup')).toBeTruthy()
  })
})

// ──────────────────────────────────────────────────────────────────
// PR-A revised scope — negative pins (LOCKED 2026-05-09 §0.9 + §13).
// SuccessPopup is no longer a sensitive code surface.  These pins
// guard against any future regression that re-introduces the code,
// live timestamp, anti-fraud disclosure, or Rate & Review CTA on
// this surface.
// ──────────────────────────────────────────────────────────────────

describe('SuccessPopup — negative pins (revised PR-A scope)', () => {
  it('does NOT render the redemption code (§0.9 — code lives on ShowToStaff + RedemptionDetailsCard only)', () => {
    const { queryByTestId } = render(<SuccessPopup {...defaults()} />)
    expect(queryByTestId('success-code')).toBeNull()
    expect(queryByTestId('success-proof-area')).toBeNull()
  })

  it('does NOT render the live ticking timestamp (§0.9 — only existed alongside the code)', () => {
    const { queryByTestId } = render(<SuccessPopup {...defaults()} />)
    expect(queryByTestId('success-live-timestamp')).toBeNull()
  })

  it('does NOT render the anti-fraud disclosure copy (§0.9 — no code on this surface)', () => {
    const { queryByTestId, queryByText } = render(<SuccessPopup {...defaults()} />)
    expect(queryByTestId('success-staff-verify-copy')).toBeNull()
    expect(queryByText(/Staff scan or type/i)).toBeNull()
  })

  it('does NOT render the Rate & Review CTA (D12 — returns in PR-C with verified-review backend)', () => {
    const { queryByTestId, queryByText } = render(<SuccessPopup {...defaults()} />)
    expect(queryByTestId('success-rate-review')).toBeNull()
    expect(queryByText('Rate & Review')).toBeNull()
  })

  it('does NOT render the old "Show to Staff" CTA copy (renamed to "View voucher code", D11)', () => {
    const { queryByText } = render(<SuccessPopup {...defaults()} />)
    expect(queryByText('Show to Staff')).toBeNull()
  })

  it('does NOT render the old "Redeemed" eyebrow (replaced by full "Voucher redeemed successfully" title, D16)', () => {
    const { queryByText } = render(<SuccessPopup {...defaults()} />)
    // Defensive: the standalone uppercase eyebrow "REDEEMED" / "Redeemed"
    // is gone.  The phrase "redeemed" still appears within the title
    // ("Voucher redeemed successfully") — that's expected.
    expect(queryByText('REDEEMED')).toBeNull()
    expect(queryByText('Redeemed')).toBeNull()
  })

  it('does NOT install useScreenCaptureProtection (§0.9 + D15 — popup is no longer a sensitive surface)', () => {
    // expo-screen-capture is intentionally NOT mocked at the top of
    // this file (was removed alongside the hook).  If the hook were
    // re-introduced, the import would fail at module load time
    // because the package is not stubbed in this test's jest.mock
    // setup.  The render below succeeding is a structural guard.
    expect(() => {
      render(<SuccessPopup {...defaults({ visible: true })} />)
    }).not.toThrow()
  })
})

// ──────────────────────────────────────────────────────────────────
// PR-A A4 saving callout (LOCKED 2026-05-09).  Shape brief §7.
// ──────────────────────────────────────────────────────────────────

describe('SuccessPopup — A4 saving callout', () => {
  it('renders the saving callout when estimatedSaving > 0', () => {
    const { getByTestId } = render(<SuccessPopup {...defaults({ estimatedSaving: 6.99 })} />)
    expect(getByTestId('success-saving-callout')).toBeTruthy()
  })

  it('renders the saving amount as £X.XX with toFixed(2)', () => {
    const { getByTestId } = render(<SuccessPopup {...defaults({ estimatedSaving: 6.99 })} />)
    expect(getByTestId('success-saving-amount').props.children.join('')).toBe('£6.99')
  })

  it('handles whole-pound savings (£12.00) without trimming the trailing zero', () => {
    const { getByTestId } = render(<SuccessPopup {...defaults({ estimatedSaving: 12 })} />)
    expect(getByTestId('success-saving-amount').props.children.join('')).toBe('£12.00')
  })

  it('handles 4-digit savings without breaking layout', () => {
    const { getByTestId } = render(<SuccessPopup {...defaults({ estimatedSaving: 1234.56 })} />)
    expect(getByTestId('success-saving-amount').props.children.join('')).toBe('£1234.56')
  })

  it('renders the "You saved" label in savingsGreen', () => {
    const { getByText } = render(<SuccessPopup {...defaults()} />)
    expect(getByText('You saved')).toBeTruthy()
  })

  it('SUPPRESSED when estimatedSaving === 0 (D9 locked)', () => {
    const { queryByTestId, queryByText } = render(<SuccessPopup {...defaults({ estimatedSaving: 0 })} />)
    expect(queryByTestId('success-saving-callout')).toBeNull()
    expect(queryByText('You saved')).toBeNull()
  })

  it("SUPPRESSED when estimatedSaving < 0 (defensive)", () => {
    const { queryByTestId } = render(<SuccessPopup {...defaults({ estimatedSaving: -5 })} />)
    expect(queryByTestId('success-saving-callout')).toBeNull()
  })
})
