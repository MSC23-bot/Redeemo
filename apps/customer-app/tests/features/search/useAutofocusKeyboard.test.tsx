import React from 'react'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import type { TextInput } from 'react-native'
import type { RefObject } from 'react'
import {
  useAutofocusKeyboard,
  FOCUS_INITIAL_DELAY_MS,
  FOCUS_RETRY_MS,
  FOCUS_MAX_ATTEMPTS,
} from '@/features/search/hooks/useAutofocusKeyboard'

// Run useFocusEffect like a mount effect (runs the callback, honours cleanup
// on unmount) so the bounded-retry timer logic can be exercised with fake
// timers — without pulling in a real navigator.
jest.mock('expo-router', () => {
  const ReactLib = require('react')
  return {
    useFocusEffect: (cb: () => undefined | (() => void)) => {
      ReactLib.useEffect(cb, [])
    },
  }
})

type FakeInput = { focus: jest.Mock; isFocused: jest.Mock }
const refOf = (input: FakeInput) => ({ current: input }) as unknown as RefObject<TextInput | null>

function Harness({ inputRef }: { inputRef: RefObject<TextInput | null> }) {
  useAutofocusKeyboard(inputRef)
  return <Text>harness</Text>
}

describe('useAutofocusKeyboard', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('does not focus before the initial delay, then focuses once', () => {
    const input: FakeInput = { focus: jest.fn(), isFocused: jest.fn(() => false) }
    render(<Harness inputRef={refOf(input)} />)
    expect(input.focus).not.toHaveBeenCalled()
    jest.advanceTimersByTime(FOCUS_INITIAL_DELAY_MS)
    expect(input.focus).toHaveBeenCalledTimes(1)
  })

  it('retries until the input reports focused, then stops', () => {
    let focused = false
    const input: FakeInput = { focus: jest.fn(), isFocused: jest.fn(() => focused) }
    render(<Harness inputRef={refOf(input)} />)

    jest.advanceTimersByTime(FOCUS_INITIAL_DELAY_MS) // attempt 1 (not yet focused) → focus()
    expect(input.focus).toHaveBeenCalledTimes(1)

    focused = true // keyboard rose
    jest.advanceTimersByTime(FOCUS_RETRY_MS) // attempt 2 sees focused → returns before focus()
    expect(input.focus).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(FOCUS_RETRY_MS * 5) // no further attempts scheduled
    expect(input.focus).toHaveBeenCalledTimes(1)
  })

  it('stops after FOCUS_MAX_ATTEMPTS when focus never takes', () => {
    const input: FakeInput = { focus: jest.fn(), isFocused: jest.fn(() => false) }
    render(<Harness inputRef={refOf(input)} />)
    jest.advanceTimersByTime(FOCUS_INITIAL_DELAY_MS + FOCUS_RETRY_MS * (FOCUS_MAX_ATTEMPTS + 3))
    expect(input.focus).toHaveBeenCalledTimes(FOCUS_MAX_ATTEMPTS)
  })

  it('clears the pending timer on unmount (no focus after unmount)', () => {
    const input: FakeInput = { focus: jest.fn(), isFocused: jest.fn(() => false) }
    const { unmount } = render(<Harness inputRef={refOf(input)} />)
    unmount()
    jest.advanceTimersByTime(FOCUS_INITIAL_DELAY_MS + FOCUS_RETRY_MS * 5)
    expect(input.focus).not.toHaveBeenCalled()
  })
})
