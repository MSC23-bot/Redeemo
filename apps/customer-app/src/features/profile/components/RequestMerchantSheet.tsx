/**
 * STUB — Sub-PR 2 (backend merchant-request routes not yet on main).
 * When tapped, shows a "Coming soon" alert instead of the real sheet.
 */
import React from 'react'
import { Alert } from 'react-native'

interface Props {
  visible: boolean
  onDismiss: () => void
  onSuccess?: () => void
}

export function RequestMerchantSheet({ visible, onDismiss }: Props) {
  // Each rising edge of `visible` fires the alert at most once. Without
  // this ref, a parent re-render that changes the `onDismiss` identity
  // while `visible` is still true would re-run the effect and fire a
  // second alert. The ref resets when visible returns to false so the
  // next open fires cleanly.
  const fired = React.useRef(false)
  React.useEffect(() => {
    if (visible && !fired.current) {
      fired.current = true
      Alert.alert('Coming soon', 'Merchant requests are coming in a future update.')
      onDismiss()
    }
    if (!visible) fired.current = false
  }, [visible, onDismiss])

  return null
}
