import React, { useState } from 'react'
import { View, ScrollView, Pressable } from 'react-native'
import { ScreenContainer, AppBar, Text, Button, StepIndicator, layout, spacing, color, radius, haptics } from '@/design-system'
import { useUpdateInterests } from '@/hooks/useUpdateInterests'
import { useInterestsCatalogue } from '@/hooks/useInterestsCatalogue'
import { useProfileCompletion } from '@/features/profile-completion/hooks/useProfileCompletion'

export function PC3InterestsScreen() {
  const { markStepComplete, dismiss, totalSteps } = useProfileCompletion()
  const update = useUpdateInterests()
  const { data, isLoading } = useInterestsCatalogue()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    void haptics.selection()
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function onSave() {
    try {
      await update.mutateAsync(Array.from(selected))
      await markStepComplete('pc3')
    } catch { /* toast handled by global error boundary */ }
  }

  return (
    <ScreenContainer>
      <AppBar title="Your interests" />
      <ScrollView contentContainerStyle={{ padding: layout.screenPaddingH, gap: spacing[4] }}>
        <StepIndicator current={3} total={totalSteps} />
        <Text variant="display.sm">What are you into?</Text>
        <Text variant="body.md" color="secondary">
          We&apos;ll personalise your discoveries based on your interests.
        </Text>
        {isLoading ? null : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {(data?.interests ?? []).map((interest) => {
              const sel = selected.has(interest.id)
              return (
                <Pressable
                  key={interest.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: sel }}
                  accessibilityLabel={interest.name}
                  onPress={() => toggle(interest.id)}
                  style={{
                    paddingHorizontal: spacing[4], paddingVertical: spacing[2],
                    borderRadius: radius.pill,
                    backgroundColor: sel ? color.navy : color.surface.subtle,
                    borderWidth: 1, borderColor: sel ? color.navy : color.border.default,
                  }}
                >
                  <Text variant="label.lg" color={sel ? 'inverse' : 'primary'}>{interest.name}</Text>
                </Pressable>
              )
            })}
          </View>
        )}
        <Button variant="primary" size="lg" loading={update.isPending} onPress={onSave}>Continue</Button>
        <Button variant="ghost" size="md" onPress={() => markStepComplete('pc3')}>Skip for now</Button>
        <Button variant="ghost" size="sm" onPress={dismiss}>Exit setup</Button>
      </ScrollView>
    </ScreenContainer>
  )
}
