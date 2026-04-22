import React from 'react'
import { ActivityIndicator, View } from 'react-native'
import { Text } from '../Text'
import { color, spacing } from '../tokens'

export function LoadingState({ label, variant = 'spinner' }: { label?: string; variant?: 'spinner' | 'skeleton' }) {
  return (
    <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', justifyContent: 'center', padding: spacing[6], gap: spacing[3] }}>
      {variant === 'spinner' && <ActivityIndicator color={color.navy} />}
      {label && <Text variant="body.sm" color="secondary">{label}</Text>}
    </View>
  )
}
