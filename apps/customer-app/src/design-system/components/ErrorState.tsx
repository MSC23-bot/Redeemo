import React from 'react'
import { View } from 'react-native'
// eslint-disable-next-line tokens/no-raw-tokens
import { AlertCircle } from 'lucide-react-native'
import { Text } from '../Text'
import { Button } from './Button'
import { color, spacing } from '../tokens'

export function ErrorState({ title, description, actionLabel, onRetry }: { title: string; description?: string; actionLabel?: string; onRetry?: () => void }) {
  return (
    <View accessibilityRole="alert" style={{ alignItems: 'center', padding: spacing[6], gap: spacing[3] }}>
      <AlertCircle size={28} color={color.danger} />
      <Text variant="heading.sm" align="center">{title}</Text>
      {description && <Text variant="body.md" color="secondary" align="center">{description}</Text>}
      {actionLabel && onRetry && <Button variant="secondary" onPress={onRetry}>{actionLabel}</Button>}
    </View>
  )
}
