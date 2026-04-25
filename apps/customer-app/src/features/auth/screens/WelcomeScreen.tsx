import React from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '@/design-system/components/Button'
import { GradientBrand } from '@/design-system/components/GradientBrand'
import { Text } from '@/design-system/Text'
import { spacing, layout } from '@/design-system/tokens'

export function WelcomeScreen() {
  const insets = useSafeAreaInsets()

  return (
    <View style={{ flex: 1 }}>
      <GradientBrand style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top }}>
        <Text variant="display.lg" color="inverse">Redeemo</Text>
        <Text variant="body.lg" color="inverse" align="center" style={{ marginTop: spacing[3] }}>
          Exclusive local deals, just for you.
        </Text>
      </GradientBrand>
      <View
        style={{
          paddingHorizontal: layout.screenPaddingH,
          paddingBottom: insets.bottom + spacing[6],
          paddingTop: spacing[6],
          gap: spacing[3],
        }}
      >
        <Button variant="primary" fullWidth onPress={() => router.push('/(auth)/register')}>
          Create account
        </Button>
        <Button variant="ghost" fullWidth onPress={() => router.push('/(auth)/login')}>
          I already have an account
        </Button>
      </View>
    </View>
  )
}
