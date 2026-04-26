import React, { useState } from 'react'
import { View } from 'react-native'
import { ScreenContainer } from '@/design-system/components/ScreenContainer'
import { AppBar } from '@/design-system/components/AppBar'
import { TextField } from '@/design-system/components/TextField'
import { Button } from '@/design-system/components/Button'
import { Text } from '@/design-system/Text'
import { spacing } from '@/design-system/tokens'
import { useForgotPassword } from '@/features/auth/hooks/usePasswordReset'

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const { submit, submitting, sent } = useForgotPassword()

  if (sent) {
    return (
      <>
        <AppBar title="Reset password" />
        <ScreenContainer>
          <View style={{ gap: spacing[4] }}>
            <Text variant="heading.md">Check your email</Text>
            <Text variant="body.md" color="secondary">
              If an account exists for {email}, we've sent a reset link. Check your inbox and spam folder.
            </Text>
          </View>
        </ScreenContainer>
      </>
    )
  }

  return (
    <>
      <AppBar title="Reset password" />
      <ScreenContainer
        footer={
          <Button variant="primary" fullWidth loading={submitting} onPress={() => submit(email)}>
            Send reset link
          </Button>
        }
      >
        <View style={{ gap: spacing[4] }}>
          <Text variant="body.md" color="secondary">
            Enter your email and we'll send you a link to reset your password.
          </Text>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            textContentType="emailAddress"
          />
        </View>
      </ScreenContainer>
    </>
  )
}
