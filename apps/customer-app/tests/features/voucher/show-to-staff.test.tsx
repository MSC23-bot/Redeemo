import React from 'react'
import { render, fireEvent, act } from '@testing-library/react-native'
import { AccessibilityInfo, AppState } from 'react-native'
import { ShowToStaff } from '@/features/voucher/components/ShowToStaff'
import * as motionScale from '@/design-system/useMotionScale'
import * as polling from '@/features/voucher/hooks/useRedemptionPolling'
import * as brightness from '@/features/voucher/hooks/useBrightnessBoost'
import * as autoHide from '@/features/voucher/hooks/useAutoHideTimer'

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

const baseProps = {
  visible: true,
  redemptionCode: 'A7K2P9X4',
  voucherTitle: 'Buy 1 Get 1 Free on All Pizzas',
  voucherType: 'BOGO' as const,
  merchantName: 'Pizza Palace',
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
  ;(baseProps.onDone as jest.Mock).mockReset()
})

describe('ShowToStaff — render', () => {
  it('renders the formatted 4+4 code, voucher type strip, merchant·branch line, and Done button', () => {
    const { getByText, getAllByText, getByLabelText } = render(<ShowToStaff {...baseProps} />)
    expect(getByText('A7K2 P9X4')).toBeTruthy()
    // voucher-type label appears twice: in the type strip + the info card row.
    expect(getAllByText(/Buy one, get one free/i).length).toBeGreaterThanOrEqual(1)
    expect(getByText(/Pizza Palace · High Street/)).toBeTruthy()
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
  it('wires useBrightnessBoost(true) when visible AND app is active', () => {
    render(<ShowToStaff {...baseProps} />)
    expect(brightness.useBrightnessBoost).toHaveBeenCalledWith(true)
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
  it('Done button calls onDone', () => {
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

  it('renders the Voucher Type and Redeemed info rows always', () => {
    const { getByText } = render(<ShowToStaff {...baseProps} />)
    expect(getByText(/Voucher Type/i)).toBeTruthy()
    expect(getByText(/Redeemed/i)).toBeTruthy()
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
