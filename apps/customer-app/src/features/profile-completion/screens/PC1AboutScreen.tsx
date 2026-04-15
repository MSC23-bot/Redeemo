import React from 'react'
import { View } from 'react-native'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ScreenContainer, AppBar, Text, TextField, Button, StepIndicator, layout, spacing } from '@/design-system'
import { useUpdateProfile } from '@/hooks/useUpdateProfile'
import { useProfileCompletion } from '@/features/profile-completion/hooks/useProfileCompletion'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use format YYYY-MM-DD').or(z.literal('')),
  gender: z.string().max(30).or(z.literal('')),
})
type FormInput = z.infer<typeof schema>

export function PC1AboutScreen() {
  const { markStepComplete, dismiss, totalSteps } = useProfileCompletion()
  const update = useUpdateProfile()
  const { control, handleSubmit } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', dateOfBirth: '', gender: '' },
  })

  async function onSave(v: FormInput) {
    try {
      await update.mutateAsync({ name: v.name, ...(v.dateOfBirth ? { dateOfBirth: v.dateOfBirth } : {}), ...(v.gender ? { gender: v.gender } : {}) })
      await markStepComplete('pc1')
    } catch { /* toast handled by global error boundary */ }
  }

  return (
    <ScreenContainer>
      <AppBar title="About you" />
      <View style={{ padding: layout.screenPaddingH, gap: spacing[4] }}>
        <StepIndicator current={1} total={totalSteps} />
        <Text variant="display.sm">Tell us a little about you</Text>
        <Controller control={control} name="name" render={({ field, fieldState }) => (
          <TextField label="First name" value={field.value} onChangeText={field.onChange} {...(fieldState.error?.message ? { error: fieldState.error.message } : {})} />
        )} />
        <Controller control={control} name="dateOfBirth" render={({ field, fieldState }) => (
          <TextField label="Date of birth (YYYY-MM-DD)" value={field.value} onChangeText={field.onChange} {...(fieldState.error?.message ? { error: fieldState.error.message } : {})} />
        )} />
        <Controller control={control} name="gender" render={({ field }) => (
          <TextField label="Gender (optional)" value={field.value} onChangeText={field.onChange} />
        )} />
        <Button variant="primary" size="lg" loading={update.isPending} onPress={handleSubmit(onSave)}>Continue</Button>
        <Button variant="ghost" size="md" onPress={() => markStepComplete('pc1')}>Skip for now</Button>
        <Button variant="ghost" size="sm" onPress={dismiss}>Exit setup</Button>
      </View>
    </ScreenContainer>
  )
}
