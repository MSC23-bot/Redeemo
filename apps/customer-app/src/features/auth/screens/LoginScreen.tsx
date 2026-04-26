import React, { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { ScreenContainer } from '@/design-system/components/ScreenContainer'
import { AppBar } from '@/design-system/components/AppBar'
import { TextField } from '@/design-system/components/TextField'
import { Button } from '@/design-system/components/Button'
import { spacing } from '@/design-system/tokens'
import { useLoginFlow } from '@/features/auth/hooks/useLoginFlow'

export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { submit, submitting, fieldErrors } = useLoginFlow()

  return (
    <>
      <AppBar title="Sign in" />
      <ScreenContainer
        footer={
          <Button
            variant="primary"
            fullWidth
            loading={submitting}
            onPress={() => submit({ email, password })}
          >
            Sign in
          </Button>
        }
      >
        <View style={{ gap: spacing[4] }}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            {...(fieldErrors.email ? { error: fieldErrors.email } : {})}
            keyboardType="email-address"
            autoCapitalize="none"
            textContentType="emailAddress"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            {...(fieldErrors.password ? { error: fieldErrors.password } : {})}
            secure
            textContentType="password"
          />
          <Button variant="ghost" onPress={() => router.push('/(auth)/forgot-password')}>
            Forgot password?
          </Button>
        </View>
      </ScreenContainer>
    </>
  )
}
