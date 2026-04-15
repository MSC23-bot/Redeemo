import React, { useState } from 'react'
import { View } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ScreenContainer } from '@/design-system/components/ScreenContainer'
import { ErrorState } from '@/design-system/components/ErrorState'
import { TextField } from '@/design-system/components/TextField'
import { Button } from '@/design-system/components/Button'
import { Text } from '@/design-system/Text'
import { color, layout, spacing } from '@/design-system/tokens'
import { useResetPassword } from '@/features/auth/hooks/usePasswordReset'
import { passwordSchema } from '@/features/auth/schemas'

function SimpleHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: color.surface.page, borderBottomWidth: 1, borderBottomColor: color.border.subtle, height: layout.appBarHeight + insets.top, justifyContent: 'flex-end', paddingHorizontal: spacing[4], paddingBottom: spacing[3] }}>
      <Text variant="heading.sm">{title}</Text>
    </View>
  )
}

export function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string }>()
  const token = params.token ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const { submit, submitting } = useResetPassword(token)

  if (!token) {
    return (
      <View style={{ flex: 1 }}>
        <SimpleHeader title="Reset password" />
        <ScreenContainer>
          <ErrorState
            title="Link expired"
            description="This reset link has expired or is invalid."
            actionLabel="Request a new reset link"
            onRetry={() => router.replace('/(auth)/forgot-password')}
          />
        </ScreenContainer>
      </View>
    )
  }

  function handleSubmit() {
    const parsed = passwordSchema.safeParse(password)
    if (!parsed.success) {
      setValidationError(parsed.error.errors[0]?.message ?? 'Invalid password')
      return
    }
    if (password !== confirm) {
      setValidationError('Passwords do not match')
      return
    }
    setValidationError(null)
    submit(password)
  }

  return (
    <View style={{ flex: 1 }}>
      <SimpleHeader title="Reset password" />
      <ScreenContainer
        footer={
          <Button variant="primary" fullWidth loading={submitting} onPress={handleSubmit}>
            Reset password
          </Button>
        }
      >
        <View style={{ gap: spacing[4] }}>
          <TextField
            label="New password"
            value={password}
            onChangeText={setPassword}
            secure
            error={validationError ?? undefined}
            textContentType="newPassword"
          />
          <TextField
            label="Confirm new password"
            value={confirm}
            onChangeText={setConfirm}
            secure
            textContentType="newPassword"
          />
        </View>
      </ScreenContainer>
    </View>
  )
}
