import React from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { ScreenContainer, AppBar, Text, Button, layout, spacing } from '@/design-system'

export function SubscribeSoonScreen() {
  return (
    <ScreenContainer>
      <AppBar title="Subscribe" />
      <View style={{ flex: 1, padding: layout.screenPaddingH, gap: spacing[4], justifyContent: 'center', alignItems: 'center' }}>
        <Text variant="display.sm">Subscription coming soon</Text>
        <Text variant="body.md" color="secondary">
          In-app subscriptions are launching shortly. Stay tuned!
        </Text>
        <Button variant="primary" size="lg" onPress={() => router.back()}>
          Go back
        </Button>
      </View>
    </ScreenContainer>
  )
}
