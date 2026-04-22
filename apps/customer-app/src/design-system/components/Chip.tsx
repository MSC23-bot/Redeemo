import React from 'react'
import { Pressable } from 'react-native'
import { Text } from '../Text'
import { color, radius, spacing } from '../tokens'
import { haptics } from '../haptics'

type Props = { label: string; selected?: boolean; onToggle?: () => void; accessibilityLabel?: string }

export function Chip({ label, selected, onToggle, accessibilityLabel }: Props) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={async () => { await haptics.selection(); onToggle?.() }}
      style={{
        paddingHorizontal: spacing[4], paddingVertical: spacing[2],
        borderRadius: radius.pill,
        backgroundColor: selected ? color.navy : color.surface.subtle,
        borderWidth: 1, borderColor: selected ? color.navy : color.border.default,
      }}
    >
      <Text variant="label.lg" color={selected ? 'inverse' : 'primary'}>{label}</Text>
    </Pressable>
  )
}
