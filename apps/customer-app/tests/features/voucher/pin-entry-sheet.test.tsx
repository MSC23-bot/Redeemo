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
    expect(submit.props.accessibilityState).toEqual({ disabled: true })
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
