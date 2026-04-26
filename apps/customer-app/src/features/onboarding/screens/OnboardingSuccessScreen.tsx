import React from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { ScreenContainer, Text, Button, GradientBrand, layout, spacing } from '@/design-system'

export function OnboardingSuccessScreen() {
  return (
    <ScreenContainer>
      <GradientBrand style={{ flex: 1 }}>
        <View style={{ flex: 1, padding: layout.screenPaddingH, gap: spacing[4], justifyContent: 'center' }}>
          <Text variant="display.lg" color="inverse">You're all set.</Text>
          <Text variant="body.lg" color="inverse">
            Profile complete. Pick how you want to use Redeemo next.
          </Text>
          <Button variant="secondary" size="lg" onPress={() => router.replace('/(auth)/subscription-prompt')}>
            Continue
          </Button>
        </View>
      </GradientBrand>
    </ScreenContainer>
  )
}
