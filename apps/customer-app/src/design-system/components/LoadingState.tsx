import React from 'react'
import { View } from 'react-native'
import { Text } from '../Text'
import { spacing } from '../tokens'
import { RedeemoLoader } from '../motion/RedeemoLoader'

export function LoadingState({ label, variant = 'spinner' }: { label?: string; variant?: 'spinner' | 'skeleton' }) {
  return (
    <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', justifyContent: 'center', padding: spacing[6], gap: spacing[3] }}>
      {variant === 'spinner' && <RedeemoLoader size="md" accessibilityLabel={label ?? 'Loading'} />}
      {label && <Text variant="body.sm" color="secondary">{label}</Text>}
    </View>
  )
}
