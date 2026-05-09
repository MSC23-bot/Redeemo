import React from 'react'
import { render, act } from '@testing-library/react-native'

// ──────────────────────────────────────────────────────────────────
// PR-B T2 — SuccessPopup subtle celebration motion
// (LOCKED 2026-05-09 brief §3.2 + §5.2 + §9.7).
//
// The brief specifies three motion additions on the SuccessPopup
// entrance:
//   (a) Saving amount count-up (0 → £X.XX, 600-1000ms, ease-out-quart)
//   (b) Existing check-ring polish (left as-is — see decision note in
//       SuccessPopup.tsx; the locked "no overshoot" behaviour wins)
//   (c) SparkleRing soft halo around the 22pt check ring
//
// Reduced-motion contract:
//   • Count-up: hook returns target immediately on first render.
//   • SparkleRing: returns null entirely.
//
// This file pins:
//   1. Count-up animates from 0 → target when reduced-motion is OFF
//   2. Count-up snaps to final value when reduced-motion is ON
//   3. Saving amount uses fontVariant: ['tabular-nums']
//   4. Count-up duration capped at 1000ms (large target)
//   5. Count-up duration min 600ms (small target)
//   6. SparkleRing not rendered when reduced-motion is ON
//   7. SparkleRing rendered when reduced-motion is OFF
//   8. Count-up + sparkle do NOT play on the saving callout when
//      estimatedSaving === 0 (saving callout suppressed); the
//      sparkle ring around the CHECK ring still plays regardless
//
// Plus 3 regression pins from the existing 39-case suite:
//   - Top-right close icon still fires onDone
//   - Rate & Review pill still routes (when onRateReview is set)
//   - View voucher code still routes
// ──────────────────────────────────────────────────────────────────

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children ?? null,
}))
jest.mock('@/design-system/haptics', () => ({
  lightHaptic: jest.fn(),
}))

// Per-file module-level reduced-motion flag.  Tests flip this with
// `setReducedMotion(true | false)` between renders to exercise both
// branches of useCountUp + SparkleRing without interfering with
// the global setup.ts mock that other tests rely on.
let mockReducedMotion = false
function setReducedMotion(v: boolean) {
  mockReducedMotion = v
}

// Override the reanimated mock from tests/setup.ts to read the
// per-file flag.  `jest.requireMock('react-native-reanimated')`
// pulls the in-effect mock object (the one set up by the global
// setup), spreads it, and replaces only `useReducedMotion`.  We
// keep all the other stubs (Animated.View, useSharedValue, etc.)
// from the global mock intact.
jest.mock('react-native-reanimated', () => {
  // Self-contained mock so this file owns the useReducedMotion
  // toggle (the global tests/setup.ts mock hardcodes false).
  // Mirrors setup.ts's stubs for everything else; only the
  // useReducedMotion implementation differs.
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: {
      View: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })),
      Text: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })),
      ScrollView: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })),
      createAnimatedComponent: (C: React.ComponentType<unknown>) => C,
    },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withDelay: (_d: number, v: unknown) => v,
    withSequence: (...args: unknown[]) => args[args.length - 1],
    withRepeat: (v: unknown) => v,
    runOnJS: (fn: (...a: unknown[]) => unknown) => fn,
    runOnUI: (fn: (...a: unknown[]) => unknown) => fn,
    cancelAnimation: () => {},
    useEvent: () => () => {},
    useHandler: () => ({ context: {}, doDependenciesDiffer: false }),
    useAnimatedReaction: () => {},
    useAnimatedScrollHandler: () => () => {},
    useAnimatedGestureHandler: () => () => {},
    useReducedMotion: () => mockReducedMotion,
    interpolate: (value: number, _input: number[], output: number[]) =>
      output[0] ?? value,
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    Easing: {
      bezier: () => (x: number) => x,
      inOut: (fn: unknown) => fn,
      out: (fn: unknown) => fn,
      in: (fn: unknown) => fn,
      exp: (x: number) => x,
      cubic: (x: number) => x,
      quad: (x: number) => x,
      linear: (x: number) => x,
    },
    FadeInDown: (() => {
      const c: any = {}
      c.delay = () => c
      c.duration = () => c
      c.springify = () => c
      c.damping = () => c
      c.mass = () => c
      return c
    })(),
    FadeIn: (() => {
      const c: any = {}
      c.delay = () => c
      c.duration = () => c
      c.springify = () => c
      c.damping = () => c
      c.mass = () => c
      return c
    })(),
  }
})

import { SuccessPopup } from '@/features/voucher/components/SuccessPopup'
import { useCountUp } from '@/features/voucher/utils/useCountUp'

function defaults(
  overrides: Partial<React.ComponentProps<typeof SuccessPopup>> = {},
) {
  return {
    visible: true,
    redeemedAt: '2026-05-06T14:32:00Z',
    estimatedSaving: 6.99,
    voucherTitle: 'Free Filter Coffee with Any Thali',
    merchantName: 'Covelum Restaurant',
    merchantLogoUrl: null,
    branchName: 'Brightlingsea',
    onShowToStaff: jest.fn(),
    onDone: jest.fn(),
    ...overrides,
  } satisfies React.ComponentProps<typeof SuccessPopup>
}

beforeEach(() => {
  setReducedMotion(false)
})

afterEach(() => {
  jest.useRealTimers()
})

describe('SuccessPopup — celebration motion (PR-B T2)', () => {
  it('saving amount renders with count-up motion ON when reduced-motion is OFF', () => {
    setReducedMotion(false)
    jest.useFakeTimers()
    const { getByTestId } = render(
      <SuccessPopup {...defaults({ estimatedSaving: 6.99 })} />,
    )

    // First render: useState initialises to 0 (reduced-motion OFF
    // path).  Asserts the count-up STARTS BELOW the final value —
    // the data-driven motion is in flight.
    const initialText = getByTestId('success-saving-amount').props.children.join('')
    expect(initialText).toBe('£0.00')

    // Advance just enough for at least one tick (16ms).  The hook
    // setInterval fires; the eased value lifts off zero but does
    // NOT yet equal the target.  Pin: intermediate < final.
    act(() => {
      jest.advanceTimersByTime(48)
    })
    const midText = getByTestId('success-saving-amount').props.children.join('')
    expect(midText).not.toBe('£6.99') // still climbing
    expect(midText).not.toBe('£0.00') // but lifted off zero

    // Advance well past the duration cap (1000ms) — the hook lands
    // on the target value.
    act(() => {
      jest.advanceTimersByTime(2000)
    })
    expect(getByTestId('success-saving-amount').props.children.join('')).toBe('£6.99')
  })

  it('saving amount renders SNAPPED to final value when reduced-motion is ON', () => {
    setReducedMotion(true)
    const { getByTestId } = render(
      <SuccessPopup {...defaults({ estimatedSaving: 6.99 })} />,
    )
    // Reduced-motion path: useState initialises to target on first
    // render; no setInterval is started.  Synchronous assert reads
    // the final value immediately.
    expect(getByTestId('success-saving-amount').props.children.join('')).toBe('£6.99')
  })

  it('saving amount uses tabular-nums fontVariant', () => {
    setReducedMotion(true)
    const { getByTestId } = render(<SuccessPopup {...defaults()} />)
    const styleProp = getByTestId('success-saving-amount').props.style
    // The style prop is an array (variant + savingAmount overrides).
    // Flatten and look for fontVariant: ['tabular-nums'].
    const styles = (Array.isArray(styleProp) ? styleProp : [styleProp])
      .filter(Boolean)
    const merged = Object.assign({}, ...styles)
    expect(merged.fontVariant).toEqual(['tabular-nums'])
  })

  it('count-up duration capped at 1000ms regardless of large target', () => {
    setReducedMotion(false)
    jest.useFakeTimers()
    // useCountUp wired with the same Math.min/max formula the
    // SuccessPopup uses.  Here we exercise the hook directly via a
    // tiny harness component to introspect duration semantics.
    let captured: number | null = null
    function Probe({ target }: { target: number }) {
      const dur = Math.min(1000, Math.max(600, target * 100))
      const v = useCountUp(target, dur)
      captured = v
      return null
    }
    render(<Probe target={999.99} />)
    // Advance just past the cap.  The setInterval ticks at ~16ms;
    // landing the final value can take one extra tick AFTER the
    // duration boundary.  Pin against 1100ms — well past the
    // 1000ms cap, before any reasonable larger duration would
    // finish.  If duration were uncapped at target * 100 (=
    // 99,999ms) the eased value would still be far below target.
    act(() => {
      jest.advanceTimersByTime(1100)
    })
    expect(captured).toBe(999.99)
  })

  it('count-up duration min 600ms regardless of small target', () => {
    setReducedMotion(false)
    jest.useFakeTimers()
    let captured: number | null = null
    function Probe({ target }: { target: number }) {
      const dur = Math.min(1000, Math.max(600, target * 100))
      const v = useCountUp(target, dur)
      captured = v
      return null
    }
    render(<Probe target={0.5} />)
    // Advance only 100ms — far less than the floor of 600ms.
    // The eased value MUST still be below the target since the
    // hook's duration must clamp at 600 ms (not target * 100 = 50).
    act(() => {
      jest.advanceTimersByTime(100)
    })
    expect(captured).not.toBe(0.5)
    expect(captured).toBeLessThan(0.5)

    // Advance to past 600ms — value should now have landed.
    // Allow a tick beyond the boundary for setInterval to fire.
    act(() => {
      jest.advanceTimersByTime(700)
    })
    expect(captured).toBe(0.5)
  })

  it('SparkleRing does NOT render when reduced-motion is ON', () => {
    setReducedMotion(true)
    const { queryByTestId } = render(<SuccessPopup {...defaults()} />)
    expect(queryByTestId('success-popup-sparkle-ring')).toBeNull()
  })

  it('SparkleRing renders when reduced-motion is OFF', () => {
    setReducedMotion(false)
    const { getByTestId } = render(<SuccessPopup {...defaults()} />)
    expect(getByTestId('success-popup-sparkle-ring')).toBeTruthy()
  })

  it('count-up + sparkle do NOT play on saving callout when zero saving (REUSABLE)', () => {
    // Saving callout suppressed entirely (existing D9 contract);
    // the count-up amount Text is unmounted.  The SparkleRing on
    // the CHECK RING still plays regardless of saving — sparkle
    // sits on the always-rendered check-ring slot.
    setReducedMotion(false)
    const { queryByTestId, getByTestId } = render(
      <SuccessPopup {...defaults({ estimatedSaving: 0 })} />,
    )
    expect(queryByTestId('success-saving-callout')).toBeNull()
    expect(queryByTestId('success-saving-amount')).toBeNull()
    // Check ring + sparkle still mount even with zero saving.
    expect(getByTestId('success-check-ring')).toBeTruthy()
    expect(getByTestId('success-popup-sparkle-ring')).toBeTruthy()
  })
})

describe('SuccessPopup — visibility + CTA + close-icon (PR-B T2 regression)', () => {
  // These pins cross-reference the existing 39-case suite.  They
  // re-assert the existing locked behaviour from a file that runs
  // the count-up + sparkle live (no useCountUp stub), so a future
  // motion regression that breaks the underlying CTA wiring would
  // surface here.

  it('top-right close icon still fires onDone (regression pin)', () => {
    setReducedMotion(true)
    const onDone = jest.fn()
    const { getByTestId } = render(
      <SuccessPopup {...defaults({ onDone })} />,
    )
    const { fireEvent } = require('@testing-library/react-native')
    fireEvent.press(getByTestId('success-close'))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('Rate & Review pill still routes when onRateReview is provided (regression pin)', () => {
    setReducedMotion(true)
    const onRateReview = jest.fn()
    const { getByTestId } = render(
      <SuccessPopup {...defaults({ onRateReview })} />,
    )
    const { fireEvent } = require('@testing-library/react-native')
    fireEvent.press(getByTestId('success-rate-review'))
    expect(onRateReview).toHaveBeenCalledTimes(1)
  })

  it('View voucher code still routes (regression pin)', () => {
    setReducedMotion(true)
    const onShowToStaff = jest.fn()
    const { getByTestId } = render(
      <SuccessPopup {...defaults({ onShowToStaff })} />,
    )
    const { fireEvent } = require('@testing-library/react-native')
    fireEvent.press(getByTestId('success-show-to-staff'))
    expect(onShowToStaff).toHaveBeenCalledTimes(1)
  })
})
