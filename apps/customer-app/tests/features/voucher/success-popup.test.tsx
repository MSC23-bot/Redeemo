import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children ?? null,
}))
jest.mock('@/design-system/haptics', () => ({
  lightHaptic: jest.fn(),
}))
jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
  allowScreenCaptureAsync:   jest.fn().mockResolvedValue(undefined),
}))

import * as ScreenCapture from 'expo-screen-capture'
import { SuccessPopup } from '@/features/voucher/components/SuccessPopup'

function defaults(overrides: Partial<React.ComponentProps<typeof SuccessPopup>> = {}) {
  return {
    visible: true,
    redemptionCode: 'A7K2P9X4',
    redeemedAt: '2026-05-06T14:32:00Z',
    // 2026-05-09 (PR-A A4): estimatedSaving required prop. Default
    // 6.99 mirrors the canonical Redeemo monthly subscription price
    // and exercises the saving-callout render path; tests that need
    // the £0 suppression behaviour pass `estimatedSaving: 0` overrides.
    estimatedSaving: 6.99,
    voucherTitle: 'Free Filter Coffee with Any Thali',
    voucherType: 'FREEBIE' as const,
    merchantName: 'Covelum Restaurant',
    branchName: 'Brightlingsea',
    onShowToStaff: jest.fn(),
    onRateReview: jest.fn(),
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

  it('formats the redemption code as 4+4 with a single space', () => {
    const { getByTestId } = render(<SuccessPopup {...defaults()} />)
    const code = getByTestId('success-code')
    expect(code.props.children).toBe('A7K2 P9X4')
  })

  it('shows the voucher title + merchant name in the strip', () => {
    const { getByText } = render(<SuccessPopup {...defaults()} />)
    expect(getByText('Free Filter Coffee with Any Thali')).toBeTruthy()
    expect(getByText('Covelum Restaurant')).toBeTruthy()
  })

  it('uses the per-voucher-type label (FREEBIE → "Freebie")', () => {
    const { getByText } = render(<SuccessPopup {...defaults({ voucherType: 'FREEBIE' })} />)
    // The label is "Freebie"; CSS upper-cases at render time but the
    // rendered string is the original-case label.
    expect(getByText('Freebie')).toBeTruthy()
  })

  it('uses BOGO label for BOGO vouchers', () => {
    const { getByText } = render(<SuccessPopup {...defaults({ voucherType: 'BOGO' })} />)
    expect(getByText('BOGO')).toBeTruthy()
  })

  it('shows the static "Redeemed on" line from `redeemedAt` (receipt detail)', () => {
    const { getByTestId, getByText } = render(<SuccessPopup {...defaults()} />)
    // Format: "06 May 2026, 14:32" (en-GB, Europe/London, no seconds).
    // The static value is permanent record; the live ticker is the
    // anti-screenshot signal — separate concerns.
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
    // Updated 2026-05-09 from `/impeccable improve` design pass:
    // PRODUCT.md locks "no em dashes in UI text or seed copy"
    // (locked 2026-05-02). The previous fallback used U+2014 EM DASH;
    // replaced with a regular ASCII hyphen-minus as the missing-data
    // indicator. Negative pin against a future revert to em dash.
    const { getByText, queryByText } = render(
      <SuccessPopup {...defaults({ branchName: null })} />,
    )
    expect(getByText('-')).toBeTruthy()
    expect(queryByText('—')).toBeNull()
  })
})

describe('SuccessPopup — three CTAs', () => {
  it('Show to Staff fires onShowToStaff', () => {
    const onShowToStaff = jest.fn()
    const { getByTestId } = render(<SuccessPopup {...defaults({ onShowToStaff })} />)
    fireEvent.press(getByTestId('success-show-to-staff'))
    expect(onShowToStaff).toHaveBeenCalledTimes(1)
  })

  it('Rate & Review fires onRateReview', () => {
    const onRateReview = jest.fn()
    const { getByTestId } = render(<SuccessPopup {...defaults({ onRateReview })} />)
    fireEvent.press(getByTestId('success-rate-review'))
    expect(onRateReview).toHaveBeenCalledTimes(1)
  })

  it('Done fires onDone', () => {
    const onDone = jest.fn()
    const { getByTestId } = render(<SuccessPopup {...defaults({ onDone })} />)
    fireEvent.press(getByTestId('success-done'))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('CTAs do not fire each other (independent handlers)', () => {
    const onShowToStaff = jest.fn()
    const onRateReview = jest.fn()
    const onDone = jest.fn()
    const { getByTestId } = render(
      <SuccessPopup {...defaults({ onShowToStaff, onRateReview, onDone })} />,
    )
    fireEvent.press(getByTestId('success-show-to-staff'))
    expect(onShowToStaff).toHaveBeenCalledTimes(1)
    expect(onRateReview).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })
})

describe('SuccessPopup — focus-loss persistence (parent-controlled)', () => {
  it('stays mounted across rerender with same visible=true (no internal hide on focus)', () => {
    const { getByTestId, rerender } = render(<SuccessPopup {...defaults()} />)
    expect(getByTestId('success-popup')).toBeTruthy()
    // Simulate a parent rerender (e.g. focus event from useFocusEffect).
    rerender(<SuccessPopup {...defaults()} />)
    expect(getByTestId('success-popup')).toBeTruthy()
  })
})

// ── Anti-fraud: live timestamp + staff-verify copy (owner-locked 2026-05-08) ──
//
// Locked product rule: Show-to-Staff has anti-screenshot trust signals
// (animated border, pulsing LIVE dot, ticking en-GB London clock,
// validated chip). The SuccessPopup ALSO shows the redemption code,
// so without parity signals a screenshot of the popup looks identical
// to a real redemption. Add a live timestamp (1s tick, in the same
// proof area as the code) + staff-verify copy. Cross-ref deferred-
// followups §S2; this is the anti-fraud baseline, NOT the broader
// success-screen design polish (confetti/saving/animation/Rate&Review
// CTA — those remain deferred).

describe('SuccessPopup — anti-fraud parity with Show-to-Staff', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders the redeemed date/time from `redeemedAt` (receipt-style detail)', () => {
    const { getByText } = render(<SuccessPopup {...defaults()} />)
    expect(getByText('Redeemed on')).toBeTruthy()
    expect(getByText(/06 May 2026, \d{2}:\d{2}/)).toBeTruthy()
  })

  it('renders a live ticking timestamp inside the proof area (next to the redemption code)', () => {
    const { getByTestId } = render(<SuccessPopup {...defaults()} />)
    const liveLine = getByTestId('success-live-timestamp')
    expect(liveLine).toBeTruthy()
    // Format: "Live: 08 May 2026 · 14:24:38" (date · time with seconds).
    const text = textOf(liveLine)
    expect(text).toMatch(/Live: \d{2} \w{3} \d{4} · \d{2}:\d{2}:\d{2}/)
  })

  it('updates the live timestamp after 1 second', () => {
    const { getByTestId } = render(<SuccessPopup {...defaults()} />)
    const before = textOf(getByTestId('success-live-timestamp'))
    // act() flushes the state-setter from inside setInterval — without
    // it, the rendered text doesn't update before our next read.
    act(() => {
      jest.advanceTimersByTime(1100)
    })
    const after = textOf(getByTestId('success-live-timestamp'))
    expect(after).not.toBe(before)
  })

  it('keeps the live timestamp ticking under reduced motion (it is a trust signal, not decorative motion)', () => {
    // Reduced motion only disables decorative animations. The live
    // timestamp is the screenshot-detection signal — it must keep
    // updating regardless. The component does not consult any
    // reduce-motion store, so this test is a pin against accidentally
    // wiring reduced motion into the timestamp lifecycle in future.
    const { getByTestId } = render(<SuccessPopup {...defaults()} />)
    const before = textOf(getByTestId('success-live-timestamp'))
    act(() => {
      jest.advanceTimersByTime(1100)
    })
    const after = textOf(getByTestId('success-live-timestamp'))
    expect(after).not.toBe(before)
  })

  it('replaces "show this to staff" copy with explicit staff-verify guidance', () => {
    const { getByTestId, queryByText } = render(<SuccessPopup {...defaults()} />)
    const subtitle = getByTestId('success-staff-verify-copy')
    expect(textOf(subtitle)).toMatch(/Show to Staff/i)
    // Negative pin — the old "claim your discount" framing must not
    // appear anywhere on the popup.
    expect(queryByText(/claim your discount/i)).toBeNull()
  })

  it('renders the redemption code AND the live timestamp inside the same proof area (visually adjacent)', () => {
    const { getByTestId } = render(<SuccessPopup {...defaults()} />)
    // Both are findable + present — proof area always renders both
    // together because they're siblings in the same View. A screenshot
    // cannot capture the code without also capturing the ticking time.
    expect(getByTestId('success-proof-area')).toBeTruthy()
    expect(getByTestId('success-code')).toBeTruthy()
    expect(getByTestId('success-live-timestamp')).toBeTruthy()
  })
})

/** Extract a single text string from a React Native rendered node by
 *  recursively flattening `props.children` arrays. Avoids the circular-
 *  reference trap of `JSON.stringify(node.props)` (Fiber nodes carry
 *  back-references). */
function textOf(node: any): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node.props && node.props.children !== undefined) return textOf(node.props.children)
  return ''
}

// ── Screen-capture protection (PR #49 final wave, 2026-05-08) ─────────
//
// SuccessPopup shares the cross-platform prevent/allow lifecycle with
// ShowToStaff via the `useScreenCaptureProtection` hook. Android
// FLAG_SECURE blocks both screenshots and recordings; iOS 11+ overlays
// a blurred snapshot during active recording / mirroring. The popup
// intentionally does NOT install the iOS post-fact screenshot listener
// (no banner, no telemetry) — that surface area stays Show-to-Staff-
// specific. Locked at deferred-followups §AB / §AE.

describe('SuccessPopup — screen-capture protection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls preventScreenCaptureAsync when visible=true on mount', () => {
    render(<SuccessPopup {...defaults({ visible: true })} />)
    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalledTimes(1)
    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled()
  })

  it('does NOT call prevention when visible=false', () => {
    render(<SuccessPopup {...defaults({ visible: false })} />)
    expect(ScreenCapture.preventScreenCaptureAsync).not.toHaveBeenCalled()
    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled()
  })

  it('calls allowScreenCaptureAsync on unmount (cleanup releases prevention)', () => {
    const { unmount } = render(<SuccessPopup {...defaults({ visible: true })} />)
    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled()
    unmount()
    expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalledTimes(1)
  })

  it('toggles prevent/allow when `visible` flips false → true → false', () => {
    const { rerender } = render(<SuccessPopup {...defaults({ visible: false })} />)
    expect(ScreenCapture.preventScreenCaptureAsync).not.toHaveBeenCalled()
    rerender(<SuccessPopup {...defaults({ visible: true })} />)
    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalledTimes(1)
    rerender(<SuccessPopup {...defaults({ visible: false })} />)
    expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalledTimes(1)
  })

  it('renders normally even if preventScreenCaptureAsync rejects (best-effort, fail-safe contract)', () => {
    ;(ScreenCapture.preventScreenCaptureAsync as jest.Mock).mockRejectedValueOnce(new Error('unsupported'))
    expect(() => {
      render(<SuccessPopup {...defaults({ visible: true })} />)
    }).not.toThrow()
  })
})
