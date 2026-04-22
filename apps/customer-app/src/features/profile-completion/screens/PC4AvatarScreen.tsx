import React, { useState } from 'react'
import { View, Switch } from 'react-native'
import { ScreenContainer, AppBar, Text, Button, StepIndicator, Image, layout, spacing, color, radius } from '@/design-system'
import { useUpdateAvatar } from '@/hooks/useUpdateAvatar'
import { useUpdateProfile } from '@/hooks/useUpdateProfile'
import { useAvatarPicker } from '@/features/profile-completion/hooks/useAvatarPicker'
import { useProfileCompletion } from '@/features/profile-completion/hooks/useProfileCompletion'

export function PC4AvatarScreen() {
  const { markStepComplete, dismiss, totalSteps } = useProfileCompletion()
  const updateAvatar = useUpdateAvatar()
  const updateProfile = useUpdateProfile()
  const picker = useAvatarPicker()
  const [newsletterConsent, setNewsletterConsent] = useState(false)

  async function onSave() {
    try {
      if (picker.dataUrl) {
        await updateAvatar.mutateAsync(picker.dataUrl)
      }
      await updateProfile.mutateAsync({ newsletterConsent })
      await markStepComplete('pc4')
    } catch { /* toast handled by global error boundary */ }
  }

  const isPending = updateAvatar.isPending || updateProfile.isPending

  return (
    <ScreenContainer>
      <AppBar title="Your profile" />
      <View style={{ padding: layout.screenPaddingH, gap: spacing[4] }}>
        <StepIndicator current={4} total={totalSteps} />
        <Text variant="display.sm">Add a photo</Text>
        <View style={{ alignItems: 'center', gap: spacing[3] }}>
          {picker.uri ? (
            <Image
              source={{ uri: picker.uri }}
              width={96}
              height={96}
              rounded="pill"
            />
          ) : (
            <View style={{
              width: 96, height: 96, borderRadius: radius.pill,
              backgroundColor: color.surface.subtle,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: color.border.default,
            }}>
              <Text variant="display.md" color="secondary">?</Text>
            </View>
          )}
          <Button variant="secondary" size="md" onPress={picker.pick}>
            {picker.uri ? 'Change photo' : 'Upload photo'}
          </Button>
          {picker.error ? (
            <Text variant="label.md" color="danger" accessibilityLiveRegion="polite">{picker.error}</Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <Switch
            value={newsletterConsent}
            onValueChange={setNewsletterConsent}
            trackColor={{ false: color.border.default, true: color.brandRose }}
            thumbColor={color.surface.page}
            accessibilityLabel="Sign me up for Redeemo news and offers"
          />
          <Text variant="body.sm" color="secondary" style={{ flex: 1 }}>
            Sign me up for Redeemo news and offers
          </Text>
        </View>
        <Button variant="primary" size="lg" loading={isPending} onPress={onSave}>Finish setup</Button>
        <Button variant="ghost" size="md" onPress={() => markStepComplete('pc4')}>Skip for now</Button>
        <Button variant="ghost" size="sm" onPress={dismiss}>Exit setup</Button>
      </View>
    </ScreenContainer>
  )
}
