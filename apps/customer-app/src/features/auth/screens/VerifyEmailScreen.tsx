import React, { useState } from 'react'
import { View, Pressable, ActivityIndicator, Text as RNText } from 'react-native'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/lib/api/auth'
import { useToast } from '@/design-system/motion/Toast'
import { mapError } from '@/lib/errors'
import { ScreenContainer } from '@/design-system/components/ScreenContainer'
import { AppBar } from '@/design-system/components/AppBar'
import { Button } from '@/design-system/components/Button'
import { Text } from '@/design-system/Text'
import { color, spacing, radius, opacity as opacityTokens, typography } from '@/design-system/tokens'
import { useVerifyEmail } from '@/features/auth/hooks/useVerifyEmail'

const RESEND_COOLDOWN = 60_000

export function VerifyEmailScreen() {
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const toast = useToast()
  const [resending, setResending] = useState(false)
  const [lastResent, setLastResent] = useState<number | null>(null)

  useVerifyEmail()

  const cooldownActive = lastResent !== null && Date.now() - lastResent < RESEND_COOLDOWN
  const isDisabled = resending || cooldownActive

  async function handleResend() {
    try {
      setResending(true)
      await authApi.resendEmailVerification()
      setLastResent(Date.now())
      toast.show('Email sent! Check your inbox.', 'success')
    } catch (e) {
      toast.show(mapError(e).message, 'danger')
    } finally {
      setResending(false)
    }
  }

  return (
    <>
      <AppBar title="Verify email" showBack={false} />
      <ScreenContainer>
        <View style={{ gap: spacing[5] }}>
          <Text variant="heading.md">Check your inbox</Text>
          <Text variant="body.md" color="secondary">
            We sent a verification link to {user?.email ?? 'your email'}.
            Tap it to confirm your address.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isDisabled, busy: resending }}
            disabled={isDisabled}
            onPress={handleResend}
            style={{
              minHeight: 48,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: color.navy,
              backgroundColor: color.surface.page,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: isDisabled ? opacityTokens.disabled : 1,
              paddingHorizontal: spacing[5],
            }}
          >
            {resending ? (
              <ActivityIndicator color={color.navy} />
            ) : (
              <RNText
                accessibilityState={{ disabled: isDisabled }}
                style={{ ...typography['label.lg'], color: color.text.primary }}
              >
                Resend email
              </RNText>
            )}
          </Pressable>
          <Button variant="ghost" fullWidth onPress={() => signOut()}>
            Use a different account
          </Button>
        </View>
      </ScreenContainer>
    </>
  )
}
