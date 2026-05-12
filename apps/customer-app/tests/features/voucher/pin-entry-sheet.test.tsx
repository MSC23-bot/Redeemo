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

  it('disclaimer banner reads the locked D2 copy (single Text 2026-05-09)', () => {
    const { getByText } = render(<PinEntrySheet {...defaultProps()} />)
    // Both sentences live in one Text element so RN flows them
    // together; sentence 1 wraps, sentence 2 joins on the wrap-row,
    // no orphan "cycle." on its own line.
    expect(
      getByText(
        "Confirming the correct PIN redeems this voucher for this cycle. Continue when you're ready to use it.",
      ),
    ).toBeTruthy()
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

// ──────────────────────────────────────────────────────────────────
// M5 Task 12 — REUSABLE_COOLDOWN_ACTIVE inline error rendering.
// Spec §4.4, §5.3, §9 (D41).  Sentence-form copy:
//   <1h band : "This voucher is available again in N minutes"
//   ≥1h band : "This voucher is available again at <Hpm> today/tomorrow/<Day>"
// Pill abbreviation uses "From" (intentional surface asymmetry); PIN-
// sheet sentence form uses "at".  Weekday capitalisation: capitalised
// proper-noun form ("at 12pm Wednesday") — mirrors formatDayName's
// "Wednesday" output and the surrounding sentence form.
// ──────────────────────────────────────────────────────────────────

describe('PinEntrySheet — REUSABLE_COOLDOWN_ACTIVE inline error (M5 Task 12, D41)', () => {
  // Pin "now" to a deterministic instant.  All availableAgainAt times in
  // these tests are computed relative to this baseline.
  // 2026-05-12 15:00:00 Europe/London (BST = UTC+1) → UTC 14:00:00Z.
  const FIXED_NOW = new Date('2026-05-12T14:00:00.000Z')

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(FIXED_NOW)
  })
  afterEach(() => { jest.useRealTimers() })

  function reusableCooldownError(availableAgainAtIso: string) {
    return {
      code: 'REUSABLE_COOLDOWN_ACTIVE',
      message: 'Cooldown active',
      statusCode: 400,
      availableAgainAt: availableAgainAtIso,
    } as any
  }

  // ── <1h band ─────────────────────────────────────────────────────────
  it('<1h band — 32 minutes out: "This voucher is available again in 32 minutes"', () => {
    // 32 minutes after FIXED_NOW = 15:32 London.
    const t = new Date(FIXED_NOW.getTime() + 32 * 60_000)
    const { getByText } = render(
      <PinEntrySheet
        {...defaultProps({ error: reusableCooldownError(t.toISOString()) })}
      />,
    )
    expect(getByText('This voucher is available again in 32 minutes')).toBeTruthy()
  })

  it('<1h band — 1 minute out: SINGULAR "in 1 minute" (not "1 minutes")', () => {
    const t = new Date(FIXED_NOW.getTime() + 60_000)
    const { getByText, queryByText } = render(
      <PinEntrySheet
        {...defaultProps({ error: reusableCooldownError(t.toISOString()) })}
      />,
    )
    expect(getByText('This voucher is available again in 1 minute')).toBeTruthy()
    expect(queryByText('This voucher is available again in 1 minutes')).toBeNull()
  })

  // ── ≥1h band — same London day ───────────────────────────────────────
  it('≥1h band — 5pm today: "This voucher is available again at 5pm today"', () => {
    // 2026-05-12 16:00:00 UTC = 17:00 London (BST) → "5pm today".
    const t = new Date('2026-05-12T16:00:00.000Z')
    const { getByText } = render(
      <PinEntrySheet
        {...defaultProps({ error: reusableCooldownError(t.toISOString()) })}
      />,
    )
    expect(getByText('This voucher is available again at 5pm today')).toBeTruthy()
  })

  // ── ≥1h band — next London day ───────────────────────────────────────
  it('≥1h band — 11am tomorrow: "This voucher is available again at 11am tomorrow"', () => {
    // 2026-05-13 10:00:00 UTC = 11:00 London (BST) → "11am tomorrow".
    const t = new Date('2026-05-13T10:00:00.000Z')
    const { getByText } = render(
      <PinEntrySheet
        {...defaultProps({ error: reusableCooldownError(t.toISOString()) })}
      />,
    )
    expect(getByText('This voucher is available again at 11am tomorrow')).toBeTruthy()
  })

  // ── ≥1h band — 2+ London days out: full proper-noun weekday ──────────
  it('≥1h band — 12pm Wednesday: full capitalised weekday name', () => {
    // FIXED_NOW = 2026-05-12 (Tuesday).  Wednesday 12pm London (BST) =
    // 2026-05-13 11:00:00 UTC.  But 13 May 11:00 UTC = 12pm BST on the
    // same date — that's TOMORROW, not "Wednesday".  Use 2026-05-20
    // (Wednesday next week) instead: 2026-05-20 11:00 UTC = 12pm BST.
    const t = new Date('2026-05-20T11:00:00.000Z')
    const { getByText } = render(
      <PinEntrySheet
        {...defaultProps({ error: reusableCooldownError(t.toISOString()) })}
      />,
    )
    expect(getByText('This voucher is available again at 12pm Wednesday')).toBeTruthy()
  })

  // ── Negative pins — surface asymmetry locked at spec §9 footnote ─────
  it('NEVER uses "From" in the sentence form (asymmetry vs merchant card pill)', () => {
    const t = new Date(FIXED_NOW.getTime() + 32 * 60_000)
    const { queryByText } = render(
      <PinEntrySheet
        {...defaultProps({ error: reusableCooldownError(t.toISOString()) })}
      />,
    )
    expect(queryByText(/From \d/)).toBeNull()
  })

  it('NEVER uses internal "cooldown" terminology (spec §9 lock)', () => {
    const t = new Date(FIXED_NOW.getTime() + 32 * 60_000)
    const { queryByText } = render(
      <PinEntrySheet
        {...defaultProps({ error: reusableCooldownError(t.toISOString()) })}
      />,
    )
    expect(queryByText(/cooldown/i)).toBeNull()
  })

  it('NEVER uses the word "wait" (spec §9 voice rule)', () => {
    const t = new Date(FIXED_NOW.getTime() + 32 * 60_000)
    const { queryByText } = render(
      <PinEntrySheet
        {...defaultProps({ error: reusableCooldownError(t.toISOString()) })}
      />,
    )
    expect(queryByText(/wait/i)).toBeNull()
  })

  // ── Container / rendering structure ──────────────────────────────────
  it('renders inside the backend-error banner container (NOT the INVALID_PIN bar)', () => {
    const t = new Date(FIXED_NOW.getTime() + 32 * 60_000)
    const { getByTestId, queryByTestId } = render(
      <PinEntrySheet
        {...defaultProps({ error: reusableCooldownError(t.toISOString()) })}
      />,
    )
    expect(getByTestId('pin-backend-error-banner')).toBeTruthy()
    // INVALID_PIN bar must NOT show — the user's PIN wasn't wrong.
    expect(queryByTestId('pin-error-bar')).toBeNull()
  })

  it('does NOT block sheet rendering when error fires (sheet stays open per §5.3 contract)', () => {
    const t = new Date(FIXED_NOW.getTime() + 32 * 60_000)
    const { getByTestId } = render(
      <PinEntrySheet
        {...defaultProps({ error: reusableCooldownError(t.toISOString()) })}
      />,
    )
    expect(getByTestId('pin-entry-sheet')).toBeTruthy()
  })
})

describe('PinEntrySheet — PR-B T8m visual contract (impeccable pass)', () => {
  // The impeccable pass on this sheet aligns five concerns to
  // PRODUCT.md + DESIGN.md:
  //   1. Title is Mustica Pro Semibold display.sm 22pt (was heading.md
  //      Lato Semibold 18 + fontWeight 800).  Mustica-for-Display Rule.
  //   2. PIN boxes use surface.tint bg + border.subtle border + 1.5px
  //      border weight + radius.md (12).  Cream-for-Identity Rule
  //      drove the bg swap; the border + radius come from token
  //      alignment.
  //   3. Disclaimer card bg color.cream → color.surface.tint per
  //      Cream-for-Identity Rule.
  //   4. Submit borderRadius radius.md (12) (was lg/16) per DESIGN.md
  //      "Buttons Shape: rounded-md on every variant"; shadow softened
  //      to 0.20 / 18 (was 0.30 / 24) per Glow-is-the-CTA Rule.
  //   5. Spurious fontWeight: '800' overrides on Lato Semibold variants
  //      removed (the override doesn't synthesize cleanly on iOS Lato).

  function flat(node: any): Record<string, any> {
    const s = node?.props?.style
    if (!s) return {}
    if (Array.isArray(s)) return Object.assign({}, ...s.flat(Infinity).filter(Boolean))
    return s
  }

  it('title uses Mustica Pro Semibold display.sm 22pt with -0.3 tight tracking (Mustica-for-Display Rule)', () => {
    const { getByText } = render(<PinEntrySheet {...defaultProps()} />)
    const title = getByText('Enter Branch PIN')
    const style = flat(title)
    expect(style.fontFamily).toBe('MusticaPro-SemiBold')
    expect(style.fontSize).toBe(22)
    expect(style.letterSpacing).toBe(-0.3)
    // Negative pin: the previous `fontWeight: '800'` override on the
    // Lato Semibold variant MUST NOT resurface (doesn't synthesize
    // cleanly on iOS).
    expect(style.fontWeight).not.toBe('800')
  })

  it('PIN boxes use surface.tint warm cream (NOT identity-zone cream) + token border + 1.5px weight + radius.md', () => {
    const { getByTestId } = render(<PinEntrySheet {...defaultProps()} />)
    // pin-box-0 is in `active` state when no digits are entered
    // (`i === digits.length === 0`); active state intentionally
    // overrides the idle bg to surface.raised white.  Pin the IDLE
    // contract on pin-box-1 (or any unfilled, non-active box).
    const idleBox = getByTestId('pin-box-1')
    const style = flat(idleBox)
    // surface-tint = '#FEF6F5'.  The previous identity-cream
    // `#FFF9F5` MUST NOT resurface (Cream-for-Identity Rule).
    expect(style.backgroundColor).toBe('#FEF6F5')
    expect(style.backgroundColor).not.toBe('#FFF9F5')
    // Border weight + radius: the previous 2px / radius.lg (16) MUST
    // NOT resurface; the impeccable contract is 1.5px / radius.md (12).
    expect(style.borderWidth).toBe(1.5)
    expect(style.borderWidth).not.toBe(2)
    expect(style.borderRadius).toBe(12)
    expect(style.borderRadius).not.toBe(16)
    // Border colour comes from a token (not the previous hardcoded
    // `#E8E2DC`).  We pin negatively here — any non-token value
    // would be a regression.
    expect(style.borderColor).not.toBe('#E8E2DC')
  })

  it('disclaimer banner bg uses surface.tint (NOT identity-zone cream) per Cream-for-Identity Rule', () => {
    const { getByText } = render(<PinEntrySheet {...defaultProps()} />)
    // The disclaimer card carries the locked D2 copy.  Walk up from
    // the text to the wrapping View whose style holds backgroundColor.
    const disclaimerText = getByText(/Confirming the correct PIN redeems this voucher/)
    let n: any = disclaimerText
    let foundSurfaceTint = false
    let foundIdentityCream = false
    while (n) {
      const s = flat(n)
      if (s.backgroundColor === '#FEF6F5') foundSurfaceTint = true
      if (s.backgroundColor === '#FFF9F5') foundIdentityCream = true
      n = n.parent
    }
    expect(foundSurfaceTint).toBe(true)
    // Negative pin: the previous identity-cream MUST NOT resurface
    // as the disclaimer bg.
    expect(foundIdentityCream).toBe(false)
  })

  it('submit CTA uses borderRadius 12 (radius.md) per DESIGN.md button-primary-lg spec', () => {
    const { getByTestId } = render(<PinEntrySheet {...defaultProps()} />)
    const cta = getByTestId('pin-submit')
    const style = flat(cta)
    expect(style.borderRadius).toBe(12)
    expect(style.borderRadius).not.toBe(16)
  })

  it('submit CTA shadow softened to 0.20 / 18 (was 0.30 / 24) per Glow-is-the-CTA Rule', () => {
    const { getByTestId } = render(<PinEntrySheet {...defaultProps()} />)
    const cta = getByTestId('pin-submit')
    const style = flat(cta)
    expect(style.shadowOpacity).toBe(0.20)
    expect(style.shadowRadius).toBe(18)
    // Negative pins: the louder previous values MUST NOT resurface.
    expect(style.shadowOpacity).not.toBe(0.30)
    expect(style.shadowRadius).not.toBe(24)
  })
})
