import React from 'react'
import { View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { color, layout, spacing } from '../tokens'

type Props = {
  children: React.ReactNode
  scroll?: boolean
  surface?: 'page' | 'tint'
  footer?: React.ReactNode
}

export function ScreenContainer({ children, scroll = true, surface = 'page', footer }: Props) {
  const insets = useSafeAreaInsets()
  const Body = scroll ? ScrollView : View
  // KAV behavior is undefined on iOS so we don't double-compensate with
  // ScrollView's automaticallyAdjustKeyboardInsets — aaki handles iOS
  // focus-into-view natively. Android relies on softwareKeyboardLayoutMode:
  // 'pan' set in app.config.ts.
  return (
    <KeyboardAvoidingView behavior={undefined} style={{ flex: 1, backgroundColor: color.surface[surface] }}>
      <Body
        contentContainerStyle={scroll ? { padding: layout.screenPaddingH, paddingBottom: insets.bottom + spacing[6] } : undefined}
        style={!scroll ? { flex: 1, padding: layout.screenPaddingH, paddingBottom: insets.bottom + spacing[6] } : undefined}
        // Auto-scroll a focused TextInput into view when it would otherwise
        // be hidden by the keyboard (iOS 13+ native behaviour). Only valid
        // on ScrollView, so guarded by the `scroll` prop.
        {...(scroll ? { automaticallyAdjustKeyboardInsets: Platform.OS === 'ios' } : {})}
      >
        {children}
      </Body>
      {footer && <View style={{ paddingHorizontal: layout.screenPaddingH, paddingBottom: insets.bottom + spacing[4], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: color.border.subtle, backgroundColor: color.surface.page }}>{footer}</View>}
    </KeyboardAvoidingView>
  )
}
