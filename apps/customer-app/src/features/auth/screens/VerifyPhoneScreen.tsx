import React, { useState } from 'react'
import { View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/lib/api/auth'
import { ScreenContainer } from '@/design-system/components/ScreenContainer'
import { AppBar } from '@/design-system/components/AppBar'
import { OtpField } from '@/design-system/components/OtpField'
import { Button } from '@/design-system/components/Button'
import { Text } from '@/design-system/Text'
import { spacing } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'
import { usePhoneVerify } from '@/features/auth/hooks/usePhoneVerify'

const RESEND_COOLDOWN = 60_000

export function VerifyPhoneScreen() {
  const user = useAuthStore((s) => s.user)
  const { verify, resend, busy, error, shakeKey } = usePhoneVerify()
  const motionScale = useMotionScale()
  const [lastResent, setLastResent] = useState<number | null>(null)
  const [resending, setResending] = useState(false)

  const cooldownActive = lastResent !== null && Date.now() - lastResent < RESEND_COOLDOWN

  const shakeX = useSharedValue(0)
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }))

  React.useEffect(() => {
    if (shakeKey === 0) return
    if (motionScale === 0) return
    shakeX.value = withSequence(
      withTiming(-8, { duration: 60 }),
      withTiming(8, { duration: 60 }),
      withTiming(-6, { duration: 60 }),
      withTiming(6, { duration: 60 }),
      withTiming(0, { duration: 60 }),
    )
  }, [shakeKey, motionScale, shakeX])

  async function handleResend() {
    setResending(true)
    await resend()
    setLastResent(Date.now())
    setResending(false)
  }

  return (
    <>
      <AppBar title="Verify phone" showBack={false} />
      <ScreenContainer>
        <View style={{ gap: spacing[5] }}>
          <Text variant="heading.md">Enter the code</Text>
          <Text variant="body.md" color="secondary">
            We sent a 6-digit code to {user?.phone ?? 'your phone'}.
          </Text>
          <Animated.View style={shakeStyle}>
            <OtpField onComplete={verify} error={error ?? undefined} disabled={busy} />
          </Animated.View>
          <Button
            variant="secondary"
            fullWidth
            loading={resending}
            disabled={cooldownActive}
            onPress={handleResend}
          >
            Resend code
          </Button>
        </View>
      </ScreenContainer>
    </>
  )
}
