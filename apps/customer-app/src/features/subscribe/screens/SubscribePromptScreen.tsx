import React from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { ScreenContainer, Text, Button, GradientBrand, layout, spacing } from '@/design-system'

export function SubscribePromptScreen() {
  return (
    <ScreenContainer>
      <GradientBrand style={{ flex: 1 }}>
        <View style={{ flex: 1, padding: layout.screenPaddingH, gap: spacing[4], justifyContent: 'center' }}>
          <Text variant="display.lg" color="inverse">Unlock every reward.</Text>
          <Text variant="body.lg" color="inverse">
            Subscribe to access exclusive vouchers from local businesses near you.
          </Text>
          <Button variant="secondary" size="lg" onPress={() => router.push('/(auth)/subscribe-soon')}>
            See plans
          </Button>
          <Button variant="ghost" size="md" onPress={() => router.replace('/(app)/')}>
            Maybe later
          </Button>
        </View>
      </GradientBrand>
    </ScreenContainer>
  )
}
