import React from 'react'
import { render, fireEvent, act } from '@testing-library/react-native'
import { AccessibilityInfo, AppState } from 'react-native'
import { ShowToStaff } from '@/features/voucher/components/ShowToStaff'
import * as motionScale from '@/design-system/useMotionScale'
import * as polling from '@/features/voucher/hooks/useRedemptionPolling'
import * as brightness from '@/features/voucher/hooks/useBrightnessBoost'
import * as autoHide from '@/features/voucher/hooks/useAutoHideTimer'
import * as screenshotGuard from '@/features/voucher/hooks/useScreenshotGuard'

// Hook mocks — we control the building-block contracts directly so
// ShowToStaff tests verify composition + props wiring without
// re-testing the hooks themselves (which have their own suites).
jest.mock('@/features/voucher/hooks/useRedemptionPolling', () => ({
  useRedemptionPolling: jest.fn(),
}))
jest.mock('@/features/voucher/hooks/useBrightnessBoost', () => ({
  useBrightnessBoost: jest.fn(),
}))
jest.mock('@/features/voucher/hooks/useAutoHideTimer', () => ({
  useAutoHideTimer: jest.fn(),
}))
jest.mock('@/features/voucher/hooks/useScreenshotGuard', () => ({
  useScreenshotGuard: jest.fn(),
}))

// QR + Blur stubs from QRCodeBlock pattern.
jest.mock('react-native-qrcode-svg', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: (props: { testID?: string }) =>
      React.createElement(View, { testID: 'qrcode-svg-stub', ...props }),
  }
})
jest.mock('expo-blur', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    BlurView: (props: { testID?: string; children?: React.ReactNode }) =>
      React.createElement(View, { testID: 'blur-stub', ...props }),
  }
})
// expo-linear-gradient — stub as a plain View; we don't visual-test
// gradients in jest (manual device QA covers that per plan).
jest.mock('expo-linear-gradient', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    LinearGradient: (props: { children?: React.ReactNode; testID?: string }) =>
      React.createElement(View, { testID: 'linear-gradient-stub', ...props }),
  }
})

// react-native-safe-area-context — PR-B T1 mounts the surface under
// useSafeAreaInsets() so the cream identity-zone band absorbs the
// notch / Dynamic Island clearance.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}))

// react-native-svg — RedeemoLogo wordmark in the cream identity zone
// uses Svg + Path. Stub as plain Views so the surface renders in jest.
jest.mock('react-native-svg', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(View, null, children),
    Svg: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(View, null, children),
    Path: () => null,
    Circle: () => null,
    Rect: () => null,
    Line: () => null,
    Polyline: () => null,
  }
})

const baseProps = {
  visible: true,
  redemptionCode: 'A7K2P9X4',
  voucherTitle: 'Buy 1 Get 1 Free on All Pizzas',
  voucherType: 'BOGO' as const,
  // PR-B T1 — vertical-receipt props. Description renders a 3-line
  // ellipsis block beneath the title; merchantLogoUrl=null exercises
  // the initials-fallback rendering path.
  voucherDescription: 'Order any 12-inch pizza and get a second one free. Dine-in only, valid Monday to Thursday.',
  merchantName: 'Pizza Palace',
  merchantLogoUrl: null as string | null,
  branchName: 'High Street',
  customerName: '',                     // M3 lock — see Task 16 + §U1.
  redeemedAt: '2026-05-08T10:00:00Z',
  onDone: jest.fn(),
}

function setPolling(state: 'polling' | 'validated') {
  ;(polling.useRedemptionPolling as jest.Mock).mockReturnValue({
    phase: state,
    data: state === 'validated'
      ? {
          code: 'A7K2P9X4', isValidated: true,
          validatedAt: '2026-05-08T10:01:00Z', validationMethod: 'QR_SCAN',
          voucherId: 'v1', merchantName: 'Pizza Palace', branchName: 'High Street',
        }
      : null,
  })
}

function setAutoHide(state: 'visible' | 'warning' | 'hidden' = 'visible') {
  const resetTimer = jest.fn()
  ;(autoHide.useAutoHideTimer as jest.Mock).mockReturnValue({ state, resetTimer })
  return resetTimer
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(motionScale, 'useMotionScale').mockReturnValue(1) // normal motion
  setPolling('polling')
  setAutoHide('visible')
  ;(brightness.useBrightnessBoost as jest.Mock).mockReturnValue(undefined)
  ;(screenshotGuard.useScreenshotGuard as jest.Mock).mockReturnValue(undefined)
  ;(baseProps.onDone as jest.Mock).mockReset()
})

describe('ShowToStaff — render', () => {
  it('renders the formatted 4+4 code, voucher-type label, merchant + branch identity, and Done button', () => {
    // PR-B T1 — vertical-receipt restructure splits the merchant +
    // branch into two stacked Text nodes (heading.sm + label.lg).
    // The single-line `merchantName · branchName` of the M3 baseline
    // was a presentation detail of the brand-red gradient register
    // and is intentionally retired by the brief §3.1 register shift.
    //
    // PR-B T8f — the X close icon top-right is gone; a full-width
    // "Done" pill at the bottom of the surface is the locked single
    // dismissal affordance.  Both Done press + hardware back call
    // the same onDone handler.
    const { getByText, getAllByText, getByLabelText, getByTestId } = render(<ShowToStaff {...baseProps} />)
    expect(getByText('A7K2 P9X4')).toBeTruthy()
    // voucher-type label still rendered (now in the chip ABOVE the QR card per T8f).
    expect(getAllByText(/Buy one, get one free/i).length).toBeGreaterThanOrEqual(1)
    expect(getByTestId('show-to-staff-merchant-name')).toBeTruthy()
    expect(getByText('Pizza Palace')).toBeTruthy()
    expect(getByText('High Street')).toBeTruthy()
    expect(getByLabelText('Done')).toBeTruthy()
  })

  it('renders the QR code via QRCodeBlock', () => {
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    expect(getByTestId('qrcode-svg-stub')).toBeTruthy()
  })

  it('renders the LIVE badge while polling', () => {
    const { getByText } = render(<ShowToStaff {...baseProps} />)
    expect(getByText(/^LIVE$/i)).toBeTruthy()
  })
})

describe('ShowToStaff — building-block composition', () => {
  it('wires useBrightnessBoost(true) when visible AND app is active (kill-switch ON, default)', () => {
    render(<ShowToStaff {...baseProps} />)
    // Default ships with BRIGHTNESS_BOOST_ENABLED=true. If device QA
    // ever requires shipping with the kill-switch flipped off, the
    // hook receives `false` and the QR/code/polling/auto-hide/AppState
    // wiring all continue to work — see the kill-switch comment at
    // the top of ShowToStaff.tsx.
    expect(brightness.useBrightnessBoost).toHaveBeenCalledWith(true)
  })

  it('brightness-boost is gated through the kill-switch — never called with anything other than booleans', () => {
    render(<ShowToStaff {...baseProps} />)
    // Defensive pin against future bugs that might pass a truthy
    // non-boolean value into the hook (e.g. a number or undefined).
    // The hook contract from Task 11 expects a strict boolean.
    const calls = (brightness.useBrightnessBoost as jest.Mock).mock.calls
    for (const [arg] of calls) {
      expect(typeof arg).toBe('boolean')
    }
  })

  it('wires useRedemptionPolling with enabled=visible + paused=false initially', () => {
    render(<ShowToStaff {...baseProps} />)
    expect(polling.useRedemptionPolling).toHaveBeenCalledWith(
      'A7K2P9X4',
      expect.objectContaining({ enabled: true, paused: false }),
    )
  })

  it('wires useAutoHideTimer with active=true and frozen=false while polling', () => {
    render(<ShowToStaff {...baseProps} />)
    expect(autoHide.useAutoHideTimer).toHaveBeenCalledWith(
      expect.objectContaining({ active: true, frozen: false }),
    )
  })

  it('wires useAutoHideTimer frozen=true when polling phase is validated', () => {
    setPolling('validated')
    render(<ShowToStaff {...baseProps} />)
    expect(autoHide.useAutoHideTimer).toHaveBeenCalledWith(
      expect.objectContaining({ frozen: true }),
    )
  })
})

describe('ShowToStaff — validated transition', () => {
  it('flips visible UI to "Verified by staff" when polling phase = validated', () => {
    setPolling('validated')
    const { getByText } = render(<ShowToStaff {...baseProps} branchName="High Street" />)
    expect(getByText(/Verified by staff/i)).toBeTruthy()
  })

  it('auto-dismisses ~2s after validated transition under normal motion', () => {
    jest.useFakeTimers()
    setPolling('validated')
    const onDone = jest.fn()
    render(<ShowToStaff {...baseProps} onDone={onDone} />)

    // Should NOT have called onDone immediately.
    expect(onDone).not.toHaveBeenCalled()
    act(() => { jest.advanceTimersByTime(2_000) })
    expect(onDone).toHaveBeenCalledTimes(1)
    jest.useRealTimers()
  })

  it('reduced motion: validated transition calls onDone instantly (no 2s wait)', () => {
    jest.spyOn(motionScale, 'useMotionScale').mockReturnValue(0)
    setPolling('validated')
    const onDone = jest.fn()
    render(<ShowToStaff {...baseProps} onDone={onDone} />)
    // No fake timers needed — reduced-motion path skips the setTimeout.
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})

describe('ShowToStaff — Done button + customer info row', () => {
  it('Done button calls onDone (PR-B T8f — bottom full-width pill is the locked single dismissal affordance; X close icon removed per owner direction)', () => {
    const onDone = jest.fn()
    const { getByLabelText } = render(<ShowToStaff {...baseProps} onDone={onDone} />)
    fireEvent.press(getByLabelText('Done'))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('M3 lock — suppresses the Customer info row when customerName is empty (§U1)', () => {
    const { queryByText } = render(<ShowToStaff {...baseProps} />)
    expect(queryByText(/^Customer$/)).toBeNull()
  })

  it('forward-compat — renders the Customer info row when a name is provided', () => {
    const { getByText } = render(<ShowToStaff {...baseProps} customerName="John D." />)
    expect(getByText(/^Customer$/)).toBeTruthy()
    expect(getByText('John D.')).toBeTruthy()
  })

  it('renders the voucher-type label + split Date/Time receipt rows (PR-B T8g — replaced the single "Redeemed" line with two rows so staff can scan date and time independently)', () => {
    // PR-B T8f — QR card content discipline: only LIVE + QR + code
    // + live clock live INSIDE the animated brand-rose border.  The
    // voucher-type chip moved to the upper info zone (above the QR
    // card) and the receipt-detail rows moved to the footer info zone
    // (below the QR card).
    //
    // PR-B T8g — the previous combined "Redeemed: <date>, <time>" line
    // is split into two rows: Date + Time (with seconds).  Pin both
    // labels so a regression that re-merges them fails this assertion.
    const { getByText, getAllByText, getByTestId } = render(<ShowToStaff {...baseProps} />)
    // Voucher-type chip — outside the QR card now.
    expect(getByTestId('show-to-staff-type-chip')).toBeTruthy()
    expect(getAllByText(/Buy one, get one free/i).length).toBeGreaterThanOrEqual(1)
    // Receipt-detail rows — outside the QR card.
    expect(getByTestId('show-to-staff-redeemed-row')).toBeTruthy()
    expect(getByTestId('show-to-staff-redeemed-date-row')).toBeTruthy()
    expect(getByTestId('show-to-staff-redeemed-time-row')).toBeTruthy()
    expect(getByText(/^Date Redeemed$/)).toBeTruthy()
    expect(getByText(/^Time Redeemed$/)).toBeTruthy()
  })
})

describe('ShowToStaff — backgrounding (AppState pause)', () => {
  it('flips paused=true on AppState background and back to paused=false on active', () => {
    let appStateHandler: ((s: 'active' | 'background' | 'inactive') => void) | null = null
    const removeSpy = jest.fn()
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_: string, cb: any) => {
        appStateHandler = cb
        return { remove: removeSpy } as any
      })

    render(<ShowToStaff {...baseProps} />)

    // Initial: paused=false, brightness boost active=true
    const initialPollingArgs = (polling.useRedemptionPolling as jest.Mock).mock.calls[0][1]
    expect(initialPollingArgs).toEqual(expect.objectContaining({ paused: false }))
    const initialBrightness = (brightness.useBrightnessBoost as jest.Mock).mock.calls[0][0]
    expect(initialBrightness).toBe(true)

    // Background: paused=true, brightness off
    act(() => { appStateHandler?.('background') })
    const lastPollingArgs = (polling.useRedemptionPolling as jest.Mock).mock.calls.slice(-1)[0][1]
    expect(lastPollingArgs).toEqual(expect.objectContaining({ paused: true }))
    const lastBrightness = (brightness.useBrightnessBoost as jest.Mock).mock.calls.slice(-1)[0][0]
    expect(lastBrightness).toBe(false)

    // Foreground: paused=false again
    act(() => { appStateHandler?.('active') })
    const finalPollingArgs = (polling.useRedemptionPolling as jest.Mock).mock.calls.slice(-1)[0][1]
    expect(finalPollingArgs).toEqual(expect.objectContaining({ paused: false }))
    const finalBrightness = (brightness.useBrightnessBoost as jest.Mock).mock.calls.slice(-1)[0][0]
    expect(finalBrightness).toBe(true)
  })

  it('cleans up the AppState listener on unmount', () => {
    const removeSpy = jest.fn()
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(() => ({ remove: removeSpy } as any))

    const { unmount } = render(<ShowToStaff {...baseProps} />)
    unmount()
    expect(removeSpy).toHaveBeenCalled()
  })
})

describe('ShowToStaff — visible=false', () => {
  it('does not boost brightness or run polling when visible is false', () => {
    render(<ShowToStaff {...baseProps} visible={false} />)
    expect(brightness.useBrightnessBoost).toHaveBeenCalledWith(false)
    expect(polling.useRedemptionPolling).toHaveBeenCalledWith(
      'A7K2P9X4',
      expect.objectContaining({ enabled: false }),
    )
  })
})

describe('ShowToStaff — screenshot guard wiring (Task 15)', () => {
  it('wires useScreenshotGuard with active=true while visible AND app is active', () => {
    render(<ShowToStaff {...baseProps} />)
    expect(screenshotGuard.useScreenshotGuard).toHaveBeenCalledWith(
      'A7K2P9X4',
      expect.objectContaining({ active: true }),
    )
  })

  it('wires useScreenshotGuard with active=false when visible=false', () => {
    render(<ShowToStaff {...baseProps} visible={false} />)
    expect(screenshotGuard.useScreenshotGuard).toHaveBeenCalledWith(
      'A7K2P9X4',
      expect.objectContaining({ active: false }),
    )
  })

  it('blurs the QR + shows the screenshot banner when onBannerShown fires', () => {
    let onBannerShown: () => void = () => {}
    ;(screenshotGuard.useScreenshotGuard as jest.Mock).mockImplementation(
      (_code: string, opts: { onBannerShown: () => void }) => {
        onBannerShown = opts.onBannerShown
      },
    )

    const { queryByText, getByText, queryByTestId, getByLabelText } = render(<ShowToStaff {...baseProps} />)

    // Initial: no banner, QR is visible (qrcode-svg-stub renders).
    expect(queryByText(/Screenshot detected/i)).toBeNull()
    expect(queryByTestId('qrcode-svg-stub')).toBeTruthy()

    act(() => { onBannerShown() })

    // Banner now visible.
    expect(getByText(/Screenshot detected/i)).toBeTruthy()
    // QR is now hidden behind the BlurView — qrcode-svg-stub is gone;
    // the blurred wrapper is a Pressable with the tap-to-show label.
    expect(queryByTestId('qrcode-svg-stub')).toBeNull()
    expect(getByLabelText(/Code hidden\. Tap to show again\./i)).toBeTruthy()
  })

  it('tapping the blurred QR clears blur + hides the banner (tap-to-show)', () => {
    let onBannerShown: () => void = () => {}
    ;(screenshotGuard.useScreenshotGuard as jest.Mock).mockImplementation(
      (_code: string, opts: { onBannerShown: () => void }) => {
        onBannerShown = opts.onBannerShown
      },
    )

    const { queryByText, getByLabelText, getByTestId } = render(<ShowToStaff {...baseProps} />)

    act(() => { onBannerShown() })
    expect(queryByText(/Screenshot detected/i)).toBeTruthy()

    fireEvent.press(getByLabelText(/Code hidden\. Tap to show again\./i))

    // Banner gone, QR re-rendered.
    expect(queryByText(/Screenshot detected/i)).toBeNull()
    expect(getByTestId('qrcode-svg-stub')).toBeTruthy()
  })

  it('hides the screenshot banner when the polling phase becomes validated', () => {
    let onBannerShown: () => void = () => {}
    ;(screenshotGuard.useScreenshotGuard as jest.Mock).mockImplementation(
      (_code: string, opts: { onBannerShown: () => void }) => {
        onBannerShown = opts.onBannerShown
      },
    )

    const { queryByText, rerender } = render(<ShowToStaff {...baseProps} />)
    act(() => { onBannerShown() })
    expect(queryByText(/Screenshot detected/i)).toBeTruthy()

    // Validated transition — even if the user hasn't dismissed the
    // banner, the validated state takes precedence.
    setPolling('validated')
    rerender(<ShowToStaff {...baseProps} />)
    expect(queryByText(/Screenshot detected/i)).toBeNull()
  })

  it('passes only booleans into the screenshot guard active prop (defensive)', () => {
    render(<ShowToStaff {...baseProps} />)
    const calls = (screenshotGuard.useScreenshotGuard as jest.Mock).mock.calls
    for (const [, opts] of calls) {
      expect(typeof opts.active).toBe('boolean')
    }
  })
})

describe('ShowToStaff — auto-hide blur (PR #49 review fix)', () => {
  it('blurs the QR + shows the auto-hide banner when useAutoHideTimer reaches "hidden"', () => {
    setAutoHide('hidden')
    const { queryByText, queryByTestId, getByLabelText } = render(<ShowToStaff {...baseProps} />)

    // Auto-hide banner copy is distinct from the screenshot banner.
    expect(queryByText(/QR hidden after 2 minutes of inactivity/i)).toBeTruthy()
    expect(queryByText(/Screenshot detected/i)).toBeNull()
    // The QR child is gone — only the blurred wrapper (Pressable) remains.
    expect(queryByTestId('qrcode-svg-stub')).toBeNull()
    expect(getByLabelText(/Code hidden\. Tap to show again\./i)).toBeTruthy()
  })

  it('does NOT blur the QR while useAutoHideTimer is in "warning" state', () => {
    setAutoHide('warning')
    const { getByText, getByTestId } = render(<ShowToStaff {...baseProps} />)

    // Warning shows the inline hint above the Done button.
    expect(getByText(/QR will hide in 10 seconds/i)).toBeTruthy()
    // QR is still visible.
    expect(getByTestId('qrcode-svg-stub')).toBeTruthy()
  })

  it('tapping the blurred QR clears the blur AND resets the auto-hide timer', () => {
    setAutoHide('hidden')
    const resetTimer = jest.fn()
    ;(autoHide.useAutoHideTimer as jest.Mock).mockReturnValue({ state: 'hidden', resetTimer })

    const { getByLabelText, queryByText } = render(<ShowToStaff {...baseProps} />)
    expect(queryByText(/QR hidden after 2 minutes/i)).toBeTruthy()

    fireEvent.press(getByLabelText(/Code hidden\. Tap to show again\./i))

    // Banner gone (blurReason cleared) + timer reset.
    expect(queryByText(/QR hidden after 2 minutes/i)).toBeNull()
    expect(resetTimer).toHaveBeenCalledTimes(1)
  })

  it('hides the auto-hide banner when polling phase becomes validated', () => {
    setAutoHide('hidden')
    const { queryByText, rerender } = render(<ShowToStaff {...baseProps} />)
    expect(queryByText(/QR hidden after 2 minutes/i)).toBeTruthy()

    setPolling('validated')
    rerender(<ShowToStaff {...baseProps} />)
    expect(queryByText(/QR hidden after 2 minutes/i)).toBeNull()
  })
})
