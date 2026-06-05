import { useCallback } from 'react'
import type { RefObject } from 'react'
import type { TextInput } from 'react-native'
import { useFocusEffect } from 'expo-router'

// Keyboard-on-tap focus hardening (review fix).
//
// The previous implementation fired a single `setTimeout(focus, 350)` on screen
// focus. If the navigation transition was still animating at the 350ms mark
// (cold start / slow Android), `.focus()` silently no-ops and nothing retries —
// the keyboard never rises. Instead, retry on a short bounded schedule and stop
// the instant the input reports focused (so it can't steal focus later) or the
// attempt bound is hit. Transition-safe without guessing a single magic delay.
export const FOCUS_INITIAL_DELAY_MS = 80
export const FOCUS_RETRY_MS = 150
export const FOCUS_MAX_ATTEMPTS = 5

/**
 * Raise the keyboard whenever the screen gains focus (including tab-to-tab
 * re-entry where the screen stays mounted and a one-shot `autoFocus` wouldn't
 * re-fire), retrying briefly until the input is actually focused.
 *
 * Scope: this is the approved keyboard-on-tap focus plumbing only — it touches
 * nothing about search ranking, matching, query, or scope.
 */
export function useAutofocusKeyboard(ref: RefObject<TextInput | null>): void {
  useFocusEffect(
    useCallback(() => {
      let attempts = 0
      let timer: ReturnType<typeof setTimeout> | undefined

      const attempt = (): void => {
        timer = undefined
        const input = ref.current
        // Done: the screen unmounted, or the keyboard is already up.
        if (!input || input.isFocused?.()) return
        input.focus?.()
        attempts += 1
        if (attempts < FOCUS_MAX_ATTEMPTS) {
          timer = setTimeout(attempt, FOCUS_RETRY_MS)
        }
      }

      timer = setTimeout(attempt, FOCUS_INITIAL_DELAY_MS)
      return () => {
        if (timer) clearTimeout(timer)
      }
    }, [ref]),
  )
}
