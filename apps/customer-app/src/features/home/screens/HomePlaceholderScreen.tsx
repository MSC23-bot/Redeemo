import React from 'react'
import { View } from 'react-native'
import { ScreenContainer, Text, layout, spacing } from '@/design-system'

export function HomePlaceholderScreen() {
  return (
    <ScreenContainer>
      <View style={{ padding: layout.screenPaddingH, gap: spacing[4] }}>
        <Text variant="display.md">Welcome to Redeemo</Text>
        <Text variant="body.md" color="secondary">Discovery is coming in the next phase.</Text>
      </View>
    </ScreenContainer>
  )
}
