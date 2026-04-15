import React from 'react'
import { View } from 'react-native'
import { Text } from '../Text'
import { spacing } from '../tokens'

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <View style={{ alignItems: 'center', padding: spacing[6], gap: spacing[2] }}>
      <Text variant="heading.sm" align="center">{title}</Text>
      {description && <Text variant="body.md" color="secondary" align="center">{description}</Text>}
    </View>
  )
}
