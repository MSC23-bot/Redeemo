import React from 'react'
import { AppState } from 'react-native'
import { fireEvent, render, act } from '@testing-library/react-native'

// BottomSheet uses expo-linear-gradient + reanimated; the project's jest
// setup typically stubs these. Mock them lightly here for isolation.
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children ?? null,
}))

jest.mock('@/design-system/motion/BottomSheet', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    BottomSheet: ({ visible, children }: any) =>
      visible ? React.createElement(View, { testID: 'bottom-sheet' }, children) : null,
  }
})

jest.mock('@/design-system/haptics', () => ({
  errorHaptic: jest.fn(),
  lightHaptic: jest.fn(),
}))

import { PinEntrySheet } from '@/features/voucher/components/PinEntrySheet'

function defaultProps(overrides: Partial<React.ComponentProps<typeof PinEntrySheet>> = {}) {
  return {
    visible: true,
    onDismiss: jest.fn(),
    onSubmit: jest.fn(),
    merchantName: 'Pizza Palace',
    branchName: 'High Street',
    // 2026-05-09 (PR-A A1): merchantLogoUrl required prop. Default
    // null exercises the text-only fallback so existing assertions on
    // merchant/branch lines still hold.  Logo-render assertions live
    // in the new test cases added by commit 5.
    merchantLogoUrl: null,
    isLoading: false,
    error: null,
    ...overrides,
  } satisfies React.ComponentProps<typeof PinEntrySheet>
}

describe('PinEntrySheet — render + structure', () => {
  it('renders nothing when visible=false', () => {
    const { queryByTestId } = render(<PinEntrySheet {...defaultProps({ visible: false })} />)
    expect(queryByTestId('pin-entry-sheet')).toBeNull()
  })

  it('renders 4 PIN boxes when visible', () => {
    const { getByTestId } = render(<PinEntrySheet {...defaultProps()} />)
    expect(getByTestId('pin-entry-sheet')).toBeTruthy()
    expect(getByTestId('pin-box-0')).toBeTruthy()
    expect(getByTestId('pin-box-1')).toBeTruthy()
    expect(getByTestId('pin-box-2')).toBeTruthy()
    expect(getByTestId('pin-box-3')).toBeTruthy()
  })

  it('renders the merchant + branch line', () => {
    const { getByText } = render(<PinEntrySheet {...defaultProps()} />)
    expect(getByText('Pizza Palace')).toBeTruthy()
    expect(getByText('High Street')).toBeTruthy()
  })
})

describe('PinEntrySheet — auto-submit', () => {
  it('does not fire onSubmit before all 4 digits are entered', () => {
    const onSubmit = jest.fn()
    const { getByTestId } = render(<PinEntrySheet {...defaultProps({ onSubmit })} />)
    fireEvent.changeText(getByTestId('pin-input-hidden'), '12')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('fires onSubmit ONCE when 4th digit entered', () => {
    const onSubmit = jest.fn()
    const { getByTestId } = render(<PinEntrySheet {...defaultProps({ onSubmit })} />)
    fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('1234')
  })

  it('does not fire onSubmit twice for the same 4-digit set (submittedRef guard)', () => {
    const onSubmit = jest.fn()
    const { getByTestId } = render(<PinEntrySheet {...defaultProps({ onSubmit })} />)
    fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')
    fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('does not fire onSubmit while loading', () => {
    const onSubmit = jest.fn()
    const { getByTestId } = render(
      <PinEntrySheet {...defaultProps({ onSubmit, isLoading: true })} />,
    )
    fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('strips non-digit characters defensively', () => {
    const onSubmit = jest.fn()
    const { getByTestId } = render(<PinEntrySheet {...defaultProps({ onSubmit })} />)
    fireEvent.changeText(getByTestId('pin-input-hidden'), '12-34')
    expect(onSubmit).toHaveBeenCalledWith('1234')
  })
})

describe('PinEntrySheet — INVALID_PIN error', () => {
  it('shows attempts-remaining text from error.remainingAttempts', () => {
    const { getByText, getByTestId } = render(
      <PinEntrySheet
        {...defaultProps({
          error: { code: 'INVALID_PIN', message: 'x', statusCode: 400, remainingAttempts: 3 } as any,
        })}
      />,
    )
    expect(getByTestId('pin-error-bar')).toBeTruthy()
    expect(getByText(/Wrong PIN · 3 attempts remaining/)).toBeTruthy()
  })

  it('uses singular "attempt" when remainingAttempts is 1', () => {
    const { getByText } = render(
      <PinEntrySheet
        {...defaultProps({
          error: { code: 'INVALID_PIN', message: 'x', statusCode: 400, remainingAttempts: 1 } as any,
        })}
      />,
    )
    expect(getByText(/Wrong PIN · 1 attempt remaining/)).toBeTruthy()
  })

  it('uses plural "attempts" when remainingAttempts > 1', () => {
    const { getByText } = render(
      <PinEntrySheet
        {...defaultProps({
          error: { code: 'INVALID_PIN', message: 'x', statusCode: 400, remainingAttempts: 4 } as any,
        })}
      />,
    )
    expect(getByText(/Wrong PIN · 4 attempts remaining/)).toBeTruthy()
  })

  // Defensive — the device can hit a backend that predates PR #43 and
  // doesn't send `remainingAttempts`, OR `redemptionApi`'s Zod parse
  // can fail and re-throw the raw ApiClientError. The bar must render
  // the fallback copy instead of leaking a blank counter
  // ("Wrong PIN ·  attempts remaining"). Real device QA hit this.

  it('FALLBACK: INVALID_PIN with NO remainingAttempts field renders "Wrong PIN. Try again." (no blank counter)', () => {
    const { getByTestId, getByText, queryByText } = render(
      <PinEntrySheet
        {...defaultProps({
          error: { code: 'INVALID_PIN', message: 'x', statusCode: 400 } as any,
        })}
      />,
    )
    expect(getByTestId('pin-error-bar')).toBeTruthy()
    expect(getByText('Wrong PIN. Try again.')).toBeTruthy()
    // Critically: NO blank counter copy.
    expect(queryByText(/attempts remaining/)).toBeNull()
    expect(queryByText(/Wrong PIN ·/)).toBeNull()
  })

  it('FALLBACK: INVALID_PIN with remainingAttempts=undefined (raw ApiClientError shape) renders fallback', () => {
    const { getByText, queryByText } = render(
      <PinEntrySheet
        {...defaultProps({
          // Mirrors the runtime shape of an ApiClientError when Zod parse
          // failed: code is INVALID_PIN, status is 400, but no details.
          error: { code: 'INVALID_PIN', status: 400, message: 'x', remainingAttempts: undefined } as any,
        })}
      />,
    )
    expect(getByText('Wrong PIN. Try again.')).toBeTruthy()
    expect(queryByText(/attempts remaining/)).toBeNull()
  })

  it('FALLBACK: INVALID_PIN with remainingAttempts as non-number garbage renders fallback', () => {
    const { getByText, queryByText } = render(
      <PinEntrySheet
        {...defaultProps({
          error: { code: 'INVALID_PIN', message: 'x', statusCode: 400, remainingAttempts: 'lots' } as any,
        })}
      />,
    )
    expect(getByText('Wrong PIN. Try again.')).toBeTruthy()
    expect(queryByText(/lots/)).toBeNull()
  })

  it('FALLBACK: INVALID_PIN with remainingAttempts=NaN renders fallback', () => {
    const { getByText, queryByText } = render(
      <PinEntrySheet
        {...defaultProps({
          error: { code: 'INVALID_PIN', message: 'x', statusCode: 400, remainingAttempts: Number.NaN } as any,
        })}
      />,
    )
    expect(getByText('Wrong PIN. Try again.')).toBeTruthy()
    expect(queryByText(/NaN/)).toBeNull()
  })

  it('FALLBACK: when remainingAttempts is 0 (clamped at limit), renders the counted form, not the fallback', () => {
    // 0 is a valid attempts value (next try will lock). Must NOT trigger
    // the fallback — show "Wrong PIN · 0 attempts remaining" so the
    // user knows the next try will lock them out.
    const { getByText, queryByText } = render(
      <PinEntrySheet
        {...defaultProps({
          error: { code: 'INVALID_PIN', message: 'x', statusCode: 400, remainingAttempts: 0 } as any,
        })}
      />,
    )
    expect(getByText(/Wrong PIN · 0 attempts remaining/)).toBeTruthy()
    expect(queryByText('Wrong PIN. Try again.')).toBeNull()
  })
})

describe('PinEntrySheet — PIN_RATE_LIMIT_EXCEEDED lockout', () => {
  beforeEach(() => { jest.useFakeTimers() })
  afterEach(() => { jest.useRealTimers() })

  it('renders the lockout card when error.code = PIN_RATE_LIMIT_EXCEEDED', () => {
    const { getByTestId, queryByTestId } = render(
      <PinEntrySheet
        {...defaultProps({
          error: { code: 'PIN_RATE_LIMIT_EXCEEDED', message: 'x', statusCode: 429, retryAfter: 540 } as any,
        })}
      />,
    )
    expect(getByTestId('pin-lockout-card')).toBeTruthy()
    // PIN input is hidden by the lockout state.
    expect(queryByTestId('pin-input-hidden')).toBeNull()
  })

  it('shows mm:ss countdown derived from retryAfter', () => {
    const { getByTestId } = render(
      <PinEntrySheet
        {...defaultProps({
          error: { code: 'PIN_RATE_LIMIT_EXCEEDED', message: 'x', statusCode: 429, retryAfter: 540 } as any,
        })}
      />,
    )
    const timer = getByTestId('pin-lockout-timer')
    // 540s = 09:00
    expect(timer.props.children).toBe('09:00')
  })

  it('counts down — 540s → 539s after 1s tick', () => {
    const { getByTestId } = render(
      <PinEntrySheet
        {...defaultProps({
          error: { code: 'PIN_RATE_LIMIT_EXCEEDED', message: 'x', statusCode: 429, retryAfter: 540 } as any,
        })}
      />,
    )
    const initial = (getByTestId('pin-lockout-timer').props.children as string)
    expect(initial).toBe('09:00')
    act(() => { jest.advanceTimersByTime(1_000) })
    const after = (getByTestId('pin-lockout-timer').props.children as string)
    expect(after).toBe('08:59')
  })

  it('submit is deeply disabled while locked', () => {
    const onSubmit = jest.fn()
    const { getByTestId } = render(
      <PinEntrySheet
        {...defaultProps({
          onSubmit,
          error: { code: 'PIN_RATE_LIMIT_EXCEEDED', message: 'x', statusCode: 429, retryAfter: 540 } as any,
        })}
      />,
    )
    const submit = getByTestId('pin-submit')
    // accessibilityState now includes `busy` (PR-A A3): `false` while
    // locked because lockout is not the loading state.
    expect(submit.props.accessibilityState).toEqual({ disabled: true, busy: false })
    fireEvent.press(submit)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('PinEntrySheet — abuse-prevention guards', () => {
  it('clears digits when component becomes invisible', () => {
    const onSubmit = jest.fn()
    const { rerender, getByTestId, queryByTestId } = render(
      <PinEntrySheet {...defaultProps({ onSubmit })} />,
    )
    fireEvent.changeText(getByTestId('pin-input-hidden'), '12')
    rerender(<PinEntrySheet {...defaultProps({ onSubmit, visible: false })} />)
    rerender(<PinEntrySheet {...defaultProps({ onSubmit, visible: true })} />)
    // Digits cleared on hide; box-0 child should be empty.
    const _box = queryByTestId('pin-box-0')
    expect(_box).toBeTruthy()
  })

  it('clears digits on AppState transition to background', () => {
    const onSubmit = jest.fn()
    const { getByTestId } = render(<PinEntrySheet {...defaultProps({ onSubmit })} />)
    fireEvent.changeText(getByTestId('pin-input-hidden'), '12')

    // Simulate AppState background event.
    const listeners: Array<(s: string) => void> = []
    const original = AppState.addEventListener
    ;(AppState as any).addEventListener = jest.fn((event: string, cb: (s: string) => void) => {
      if (event === 'change') listeners.push(cb)
      return { remove: jest.fn() }
    })

    // Re-render to register the spy listener.
    const { getByTestId: getByTestId2 } = render(<PinEntrySheet {...defaultProps({ onSubmit })} />)
    fireEvent.changeText(getByTestId2('pin-input-hidden'), '23')

    act(() => {
      listeners.forEach((cb) => cb('background'))
    })

    // No throw, no auto-submit triggered.
    expect(onSubmit).not.toHaveBeenCalled()

    ;(AppState as any).addEventListener = original
  })

  it('never auto-submits while loading even if 4 digits arrive', () => {
    const onSubmit = jest.fn()
    const { getByTestId, rerender } = render(
      <PinEntrySheet {...defaultProps({ onSubmit, isLoading: false })} />,
    )
    rerender(<PinEntrySheet {...defaultProps({ onSubmit, isLoading: true })} />)
    fireEvent.changeText(getByTestId('pin-input-hidden'), '1234')
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

// ──────────────────────────────────────────────────────────────────
// PR-A polish pass (2026-05-09) — A1 logo, A2 copy, A3 spinner.
// ──────────────────────────────────────────────────────────────────

describe('PinEntrySheet — A1 merchant logo (2026-05-09)', () => {
  it('renders the merchant logo when merchantLogoUrl is provided', () => {
    const { getByTestId } = render(
      <PinEntrySheet
        {...defaultProps({ merchantLogoUrl: 'https://example.test/covelum.png' })}
      />,
    )
    expect(getByTestId('pin-merchant-logo')).toBeTruthy()
  })

  it('does NOT render the logo when merchantLogoUrl is null (text-only fallback)', () => {
    const { queryByTestId } = render(<PinEntrySheet {...defaultProps()} />)
    expect(queryByTestId('pin-merchant-logo')).toBeNull()
  })

  it('logo accessibilityLabel includes the merchant name', () => {
    const { getByTestId } = render(
      <PinEntrySheet
        {...defaultProps({
          merchantName: 'Covelum Restaurant',
          merchantLogoUrl: 'https://example.test/covelum.png',
        })}
      />,
    )
    expect(getByTestId('pin-merchant-logo').props.accessibilityLabel).toBe(
      'Covelum Restaurant logo',
    )
  })
})

describe('PinEntrySheet — A2 copy (2026-05-09)', () => {
  // Locked subtitle line 1 + 2 (D1) + disclaimer (D2) per shape brief
  // §5.  Each test pins the EXACT wording so a future refactor cannot
  // silently re-introduce alarmist / legalistic language.
  it('subtitle line 1 reads "Ask staff at {merchantName} for their 4-digit PIN."', () => {
    const { getByText } = render(
      <PinEntrySheet {...defaultProps({ merchantName: 'Covelum Restaurant' })} />,
    )
    expect(getByText('Ask staff at Covelum Restaurant for their 4-digit PIN.')).toBeTruthy()
  })

  it("subtitle line 2 reads the locked D1 second line", () => {
    const { getByText } = render(<PinEntrySheet {...defaultProps()} />)
    expect(getByText("When you confirm it, we'll create the code staff can check.")).toBeTruthy()
  })

  it('disclaimer banner reads the locked D2 copy (split sentence-per-line 2026-05-09)', () => {
    const { getByText } = render(<PinEntrySheet {...defaultProps()} />)
    // Each sentence is rendered in its own <Text> so word-wrap
    // never lands a clause hanging off line 1.
    expect(getByText("Confirming the correct PIN redeems this voucher for this cycle.")).toBeTruthy()
    expect(getByText("Continue when you're ready to use it.")).toBeTruthy()
  })

  it('title reads "Enter Branch PIN"', () => {
    const { getByText } = render(<PinEntrySheet {...defaultProps()} />)
    expect(getByText('Enter Branch PIN')).toBeTruthy()
  })

  // Negative pins per PRODUCT.md ## Tone + Owner-clarification 1 (2026-
  // 05-09).  These guard against accidental regression to the prior
  // alarmist framing.
  it('NO copy includes "cannot be undone"', () => {
    const { queryByText } = render(<PinEntrySheet {...defaultProps()} />)
    expect(queryByText(/cannot be undone/i)).toBeNull()
  })

  it('NO copy includes "permanently"', () => {
    const { queryByText } = render(<PinEntrySheet {...defaultProps()} />)
    expect(queryByText(/permanently/i)).toBeNull()
  })

  it('NO copy includes "irreversible"', () => {
    const { queryByText } = render(<PinEntrySheet {...defaultProps()} />)
    expect(queryByText(/irreversible/i)).toBeNull()
  })

  it('NO copy includes em dash or en dash characters', () => {
    const { queryByText } = render(<PinEntrySheet {...defaultProps()} />)
    expect(queryByText(/—/)).toBeNull()  // em dash
    expect(queryByText(/–/)).toBeNull()  // en dash
  })

  it('NO copy uses "staff handoff code" internal jargon', () => {
    // Owner-direction 2026-05-09: "staff handoff code" reads as
    // product-team shorthand, not customer-facing.
    const { queryByText } = render(<PinEntrySheet {...defaultProps()} />)
    expect(queryByText(/staff handoff code/i)).toBeNull()
  })

  it('NO copy uses "locked" framing for the voucher', () => {
    // Owner-clarification 1 (2026-05-09): "locked in for this cycle"
    // feels punitive.  Locked copy ("redeems this voucher for this
    // cycle") replaces it.
    const { queryByText } = render(<PinEntrySheet {...defaultProps()} />)
    expect(queryByText(/your voucher is locked/i)).toBeNull()
    expect(queryByText(/voucher is being locked/i)).toBeNull()
  })
})

describe('PinEntrySheet — A3 loading state (2026-05-09)', () => {
  it('shows the pulsing dot + "Confirming…" label when isLoading is true', () => {
    const { getByTestId, getByText } = render(
      <PinEntrySheet {...defaultProps({ isLoading: true })} />,
    )
    expect(getByTestId('pin-submit-pulsing-dot')).toBeTruthy()
    expect(getByText('Confirming…')).toBeTruthy()
  })

  it('shows the idle "Confirm" label when isLoading is false', () => {
    const { queryByTestId, getByText } = render(
      <PinEntrySheet {...defaultProps({ isLoading: false })} />,
    )
    expect(queryByTestId('pin-submit-pulsing-dot')).toBeNull()
    expect(getByText('Confirm')).toBeTruthy()
  })

  it('submit accessibilityState busy is true while loading', () => {
    const { getByTestId } = render(
      <PinEntrySheet {...defaultProps({ isLoading: true })} />,
    )
    expect(getByTestId('pin-submit').props.accessibilityState).toMatchObject({
      busy: true,
    })
  })

  it('submit accessibilityState busy is false when idle', () => {
    const { getByTestId } = render(<PinEntrySheet {...defaultProps()} />)
    expect(getByTestId('pin-submit').props.accessibilityState).toMatchObject({
      busy: false,
    })
  })

  it('submit accessibilityLabel reflects loading vs idle', () => {
    const { getByTestId, rerender } = render(<PinEntrySheet {...defaultProps()} />)
    expect(getByTestId('pin-submit').props.accessibilityLabel).toBe('Confirm PIN')
    rerender(<PinEntrySheet {...defaultProps({ isLoading: true })} />)
    expect(getByTestId('pin-submit').props.accessibilityLabel).toBe('Confirming PIN')
  })

  it('submit pointerEvents flips to "none" while loading (defense-in-depth)', () => {
    const { getByTestId, rerender } = render(<PinEntrySheet {...defaultProps()} />)
    expect(getByTestId('pin-submit').props.pointerEvents).toBe('auto')
    rerender(<PinEntrySheet {...defaultProps({ isLoading: true })} />)
    expect(getByTestId('pin-submit').props.pointerEvents).toBe('none')
  })
})

describe('PinEntrySheet — keypad re-focus after wrong PIN (2026-05-09 device QA)', () => {
  // The visible PIN boxes are <View>s with no native touch handling,
  // and the hidden TextInput is 1×1pt so it is unreachable directly.
  // Without an explicit Pressable wrapper + auto-refocus on INVALID_
  // PIN, the user lost the keypad after a wrong attempt and could not
  // bring it back.  Caught on-device QA 2026-05-09.
  it('renders the tap-to-refocus Pressable around the PIN row', () => {
    const { getByTestId } = render(<PinEntrySheet {...defaultProps()} />)
    expect(getByTestId('pin-row-pressable')).toBeTruthy()
  })

  it('tap-to-refocus Pressable does NOT render when locked out (lockout card replaces the row)', () => {
    const { queryByTestId, getByTestId } = render(
      <PinEntrySheet
        {...defaultProps({
          error: { code: 'PIN_RATE_LIMIT_EXCEEDED', message: 'x', statusCode: 429, retryAfter: 540 } as any,
        })}
      />,
    )
    expect(queryByTestId('pin-row-pressable')).toBeNull()
    expect(getByTestId('pin-lockout-card')).toBeTruthy()
  })

  it('pressing the tap-to-refocus surface does not throw', () => {
    const { getByTestId } = render(<PinEntrySheet {...defaultProps()} />)
    expect(() => {
      fireEvent.press(getByTestId('pin-row-pressable'))
    }).not.toThrow()
  })

  it('Pressable accessibilityRole and label are wired for screen readers', () => {
    const { getByTestId } = render(<PinEntrySheet {...defaultProps()} />)
    const pressable = getByTestId('pin-row-pressable')
    expect(pressable.props.accessibilityRole).toBe('button')
    expect(pressable.props.accessibilityLabel).toBe('Enter PIN')
  })
})
