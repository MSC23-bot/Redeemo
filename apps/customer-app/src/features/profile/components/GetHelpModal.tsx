/**
 * STUB — Sub-PR 2 (support ticket API + backend not yet on main).
 * The full GetHelpModal (ticket list / detail / new form) ships in Sub-PR 2.
 * This stub shows a Coming Soon alert when opened so the profile screen
 * can wire the "Get help" row without depending on Sub-PR 2 APIs.
 */
import React from 'react'
import { Alert } from 'react-native'
import type { SupportTopic } from '@/lib/constants/supportTopics'

interface Props {
  visible: boolean
  onDismiss: () => void
  initialTopic?: SupportTopic
  initialMessage?: string
}

export function GetHelpModal({ visible, onDismiss }: Props) {
  // Each rising edge of `visible` fires the alert at most once. Without
  // this ref, a parent re-render that changes the `onDismiss` identity
  // while `visible` is still true would re-run the effect (deps include
  // onDismiss) and fire a second alert. The ref resets when visible
  // returns to false so the next open fires cleanly.
  const fired = React.useRef(false)
  React.useEffect(() => {
    if (visible && !fired.current) {
      fired.current = true
      Alert.alert('Coming soon', 'In-app support is coming in a future update.')
      onDismiss()
    }
    if (!visible) fired.current = false
  }, [visible, onDismiss])

  return null
}
