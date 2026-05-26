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
  // Trigger the alert once when visible flips to true
  React.useEffect(() => {
    if (visible) {
      Alert.alert('Coming soon', 'Merchant requests are coming in a future update.')
      onDismiss()
    }
  }, [visible, onDismiss])

  return null
}
