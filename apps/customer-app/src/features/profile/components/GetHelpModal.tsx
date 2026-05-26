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
  React.useEffect(() => {
    if (visible) {
      Alert.alert('Coming soon', 'In-app support is coming in a future update.')
      onDismiss()
    }
  }, [visible, onDismiss])

  return null
}
