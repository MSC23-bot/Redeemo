import React, { useState } from 'react'
import { Alert, View } from 'react-native'
import { router } from 'expo-router'
import { ScreenContainer, Text, Button, GradientBrand, layout, spacing } from '@/design-system'
import { useAuthStore } from '@/stores/auth'

export function SubscribePromptScreen() {
  const markSubscriptionPromptSeenNow = useAuthStore((s) => s.markSubscriptionPromptSeenNow)
  const [busy, setBusy] = useState(false)

  function handlePremiumChoice() {
    Alert.alert(
      'Coming soon',
      'Subscriptions are not available yet — we\'ll let you know as soon as they go live. For now you can continue with free access.',
    )
  }

  async function handleFreeChoice() {
    if (busy) return
    setBusy(true)
    try {
      await markSubscriptionPromptSeenNow()
      router.replace('/(app)/')
    } catch {
      // Re-enable so the user can retry; the prompt stays in place either way.
      setBusy(false)
    }
  }

  return (
    <ScreenContainer>
      <GradientBrand style={{ flex: 1 }}>
        <View style={{ flex: 1, padding: layout.screenPaddingH, gap: spacing[4], justifyContent: 'center' }}>
          <Text variant="display.lg" color="inverse">Unlock every reward.</Text>
          <Text variant="body.lg" color="inverse">
            Subscribe to access exclusive vouchers from local businesses near you.
          </Text>
          <Button variant="secondary" size="lg" onPress={handlePremiumChoice} disabled={busy}>
            Explore full access
          </Button>
          <Button variant="ghost" size="md" onPress={handleFreeChoice} loading={busy}>
            Start with free access
          </Button>
        </View>
      </GradientBrand>
    </ScreenContainer>
  )
}
