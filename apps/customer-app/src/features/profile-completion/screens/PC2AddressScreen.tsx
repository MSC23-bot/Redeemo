import React, { useEffect } from 'react'
import { View } from 'react-native'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ScreenContainer, AppBar, Text, TextField, Button, StepIndicator, layout, spacing } from '@/design-system'
import { useUpdateProfile } from '@/hooks/useUpdateProfile'
import { useProfileCompletion } from '@/features/profile-completion/hooks/useProfileCompletion'
import { useLocationAssist } from '@/lib/location'

const schema = z.object({
  addressLine1: z.string().max(100).or(z.literal('')),
  addressLine2: z.string().max(100).or(z.literal('')),
  city: z.string().max(60).or(z.literal('')),
  postcode: z.string().max(10).or(z.literal('')),
})
type FormInput = z.infer<typeof schema>

export function PC2AddressScreen() {
  const { markStepComplete, dismiss, totalSteps } = useProfileCompletion()
  const update = useUpdateProfile()
  const assist = useLocationAssist()
  const { control, handleSubmit, setValue } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { addressLine1: '', addressLine2: '', city: '', postcode: '' },
  })

  useEffect(() => {
    if (assist.address) {
      if (assist.address.city) setValue('city', assist.address.city)
      if (assist.address.postcode) setValue('postcode', assist.address.postcode)
      if (assist.address.addressLine1) setValue('addressLine1', assist.address.addressLine1)
      if (assist.address.addressLine2) setValue('addressLine2', assist.address.addressLine2)
    }
  }, [assist.address, setValue])

  async function onSave(v: FormInput) {
    try {
      await update.mutateAsync({
        ...(v.addressLine1 ? { addressLine1: v.addressLine1 } : {}),
        ...(v.addressLine2 ? { addressLine2: v.addressLine2 } : {}),
        ...(v.city ? { city: v.city } : {}),
        ...(v.postcode ? { postcode: v.postcode } : {}),
      })
      await markStepComplete('pc2')
    } catch { /* toast handled by global error boundary */ }
  }

  return (
    <ScreenContainer>
      <AppBar title="Your address" />
      <View style={{ padding: layout.screenPaddingH, gap: spacing[4] }}>
        <StepIndicator current={2} total={totalSteps} />
        <Text variant="display.sm">Where are you based?</Text>
        <Button variant="secondary" size="md" loading={assist.loading} onPress={assist.request}>
          Use my location
        </Button>
        <Controller control={control} name="addressLine1" render={({ field, fieldState }) => (
          <TextField label="Address line 1" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
        )} />
        <Controller control={control} name="addressLine2" render={({ field }) => (
          <TextField label="Address line 2 (optional)" value={field.value} onChangeText={field.onChange} />
        )} />
        <Controller control={control} name="city" render={({ field, fieldState }) => (
          <TextField label="City" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
        )} />
        <Controller control={control} name="postcode" render={({ field, fieldState }) => (
          <TextField label="Postcode" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
        )} />
        <Button variant="primary" size="lg" loading={update.isPending} onPress={handleSubmit(onSave)}>Continue</Button>
        <Button variant="ghost" size="md" onPress={() => markStepComplete('pc2')}>Skip for now</Button>
        <Button variant="ghost" size="sm" onPress={dismiss}>Exit setup</Button>
      </View>
    </ScreenContainer>
  )
}
