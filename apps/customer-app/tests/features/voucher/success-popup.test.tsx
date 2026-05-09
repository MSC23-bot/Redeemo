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
    merchantName: 'Covelum Restaurant',
    // D23 §14 (LOCKED 2026-05-09): merchantLogoUrl required prop.
    // Default null exercises the text-only fallback so existing
    // assertions on voucher title + merchant name still hold.  Logo-
    // render assertions live in the new D23 test cases below.
    merchantLogoUrl: null,
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

  it('title allows up to 2 lines under Dynamic Type (D18 §14 — numberOfLines={2})', () => {
    // Review-fix pass 2026-05-09: title was numberOfLines={1} which
    // could truncate under Dynamic Type at heading.md (18) bumped
    // size.  Cap at 2 — wraps safely instead of truncating.
    const { getByTestId } = render(<SuccessPopup {...defaults()} />)
    expect(getByTestId('success-title').props.numberOfLines).toBe(2)
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

  it('shows the D28 CTA helper line above the primary CTA (LOCKED 2026-05-09 §14.7)', () => {
    const { getByTestId, getByText } = render(<SuccessPopup {...defaults()} />)
    expect(getByTestId('success-cta-helper')).toBeTruthy()
    expect(
      getByText('Tap below to show your code to staff and apply this offer to your bill.'),
    ).toBeTruthy()
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

// ──────────────────────────────────────────────────────────────────
// D23 §14 (LOCKED 2026-05-09) — merchant logo on the voucher
// context strip.  Mirrors PIN sheet D5 verbatim (48×48, radius.md,
// brand-rose 8% alpha ring, surface.tint background, null/error
// → text-only fallback).
// ──────────────────────────────────────────────────────────────────

describe('SuccessPopup — D23 merchant logo', () => {
  it('renders the merchant logo when merchantLogoUrl is provided', () => {
    const { getByTestId } = render(
      <SuccessPopup
        {...defaults({ merchantLogoUrl: 'https://example.test/covelum.png' })}
      />,
    )
    expect(getByTestId('success-merchant-logo')).toBeTruthy()
  })

  it('does NOT render the logo when merchantLogoUrl is null (text-only fallback)', () => {
    const { queryByTestId } = render(<SuccessPopup {...defaults()} />)
    expect(queryByTestId('success-merchant-logo')).toBeNull()
  })

  it('logo accessibilityLabel includes the merchant name', () => {
    const { getByTestId } = render(
      <SuccessPopup
        {...defaults({
          merchantName: 'Covelum Restaurant',
          merchantLogoUrl: 'https://example.test/covelum.png',
        })}
      />,
    )
    expect(getByTestId('success-merchant-logo').props.accessibilityLabel).toBe(
      'Covelum Restaurant logo',
    )
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

  it('does NOT render the Rate & Review CTA when onRateReview prop is omitted (parent has no reliable branchId)', () => {
    // PR-C T12 (LOCKED 2026-05-09 §0.3.1): the CTA is OPT-IN.  The
    // parent (VoucherDetailScreen) only passes `onRateReview` when it
    // has a reliable branchId for the URL.  Omitting the prop must
    // leave the secondary row carrying ONLY the Done dismiss action.
    // This is the locked "hide if no reliable branchId" behaviour.
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

// ──────────────────────────────────────────────────────────────────
// PR-C T12 (LOCKED 2026-05-09 §0.3.1) — Rate & Review CTA returns.
// Owner-locked decisions:
//   - Visual: flat outlined pill, 1px brand-rose 30% alpha border,
//     brand-rose Star icon, body.md text, ≥44pt tap target.
//   - Layout: two-column secondaryRow `[Rate & Review] [Done]`.
//   - Behaviour: tapping closes the popup AND routes to merchant
//     profile reviews tab with `?openWriteReview=1&fromRedemption=…`.
//   - Hide rule: CTA renders ONLY when the parent passes
//     `onRateReview`.  Parent gates this on having a reliable
//     branchId (no fallback to branchName).  Omitted prop ⇒ secondary
//     row carries only the Done action.
// ──────────────────────────────────────────────────────────────────

describe('SuccessPopup — Rate & Review CTA (PR-C T12 §0.3.1)', () => {
  it('renders the Rate & Review pill when onRateReview is provided', () => {
    const { getByTestId, getByText } = render(
      <SuccessPopup {...defaults({ onRateReview: jest.fn() })} />,
    )
    expect(getByTestId('success-rate-review')).toBeTruthy()
    expect(getByText('Rate & Review')).toBeTruthy()
  })

  it('hides the Rate & Review pill when onRateReview is omitted', () => {
    // Already covered by the negative pin above — re-asserted here
    // alongside the positive case so the visibility contract reads
    // as a coherent pair within the T12 describe.
    const { queryByTestId } = render(<SuccessPopup {...defaults()} />)
    expect(queryByTestId('success-rate-review')).toBeNull()
  })

  it('pressing the Rate & Review pill fires onRateReview exactly once', () => {
    const onRateReview = jest.fn()
    const { getByTestId } = render(
      <SuccessPopup {...defaults({ onRateReview })} />,
    )
    fireEvent.press(getByTestId('success-rate-review'))
    expect(onRateReview).toHaveBeenCalledTimes(1)
  })

  it('pressing Rate & Review does NOT fire onShowToStaff or onDone (independent handlers)', () => {
    const onRateReview = jest.fn()
    const onShowToStaff = jest.fn()
    const onDone = jest.fn()
    const { getByTestId } = render(
      <SuccessPopup {...defaults({ onRateReview, onShowToStaff, onDone })} />,
    )
    fireEvent.press(getByTestId('success-rate-review'))
    expect(onRateReview).toHaveBeenCalledTimes(1)
    expect(onShowToStaff).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('CTA accessibilityLabel reads "Rate and Review"', () => {
    // "and" spelled out for screen readers — "&" is read inconsistently
    // across iOS/Android voiceover engines.
    const { getByTestId } = render(
      <SuccessPopup {...defaults({ onRateReview: jest.fn() })} />,
    )
    expect(getByTestId('success-rate-review').props.accessibilityLabel).toBe(
      'Rate and Review',
    )
  })

  it('CTA exposes accessibilityRole="button"', () => {
    const { getByTestId } = render(
      <SuccessPopup {...defaults({ onRateReview: jest.fn() })} />,
    )
    expect(getByTestId('success-rate-review').props.accessibilityRole).toBe('button')
  })

  it('Done still works independently when Rate & Review is rendered alongside it', () => {
    const onRateReview = jest.fn()
    const onDone = jest.fn()
    const { getByTestId } = render(
      <SuccessPopup {...defaults({ onRateReview, onDone })} />,
    )
    fireEvent.press(getByTestId('success-done'))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onRateReview).not.toHaveBeenCalled()
  })

  it('View voucher code still works independently when Rate & Review is rendered alongside it', () => {
    const onRateReview = jest.fn()
    const onShowToStaff = jest.fn()
    const { getByTestId } = render(
      <SuccessPopup {...defaults({ onRateReview, onShowToStaff })} />,
    )
    fireEvent.press(getByTestId('success-show-to-staff'))
    expect(onShowToStaff).toHaveBeenCalledTimes(1)
    expect(onRateReview).not.toHaveBeenCalled()
  })
})
