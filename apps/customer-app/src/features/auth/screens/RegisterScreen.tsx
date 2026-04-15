import React, { useState } from 'react'
import { View } from 'react-native'
import { ScreenContainer } from '@/design-system/components/ScreenContainer'
import { AppBar } from '@/design-system/components/AppBar'
import { TextField } from '@/design-system/components/TextField'
import { Button } from '@/design-system/components/Button'
import { Text } from '@/design-system/Text'
import { spacing } from '@/design-system/tokens'
import { useRegisterFlow } from '@/features/auth/hooks/useRegisterFlow'

export function RegisterScreen() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')

  const { submit, submitting, fieldErrors } = useRegisterFlow()

  return (
    <>
      <AppBar title="Create account" />
      <ScreenContainer
        footer={
          <Button
            variant="primary"
            fullWidth
            loading={submitting}
            onPress={() => submit({ firstName, lastName, email, password, phone })}
          >
            Create account
          </Button>
        }
      >
        <View style={{ gap: spacing[4] }}>
          <Text variant="body.md" color="secondary">
            Join Redeemo to unlock exclusive local deals.
          </Text>
          <TextField
            label="First name"
            value={firstName}
            onChangeText={setFirstName}
            error={fieldErrors.firstName}
            autoCapitalize="words"
            textContentType="givenName"
          />
          <TextField
            label="Last name"
            value={lastName}
            onChangeText={setLastName}
            error={fieldErrors.lastName}
            autoCapitalize="words"
            textContentType="familyName"
          />
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            error={fieldErrors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            textContentType="emailAddress"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            error={fieldErrors.password}
            secure
            textContentType="newPassword"
          />
          <TextField
            label="Phone number (e.g. +447700900000)"
            value={phone}
            onChangeText={setPhone}
            error={fieldErrors.phone}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
          />
        </View>
      </ScreenContainer>
    </>
  )
}
