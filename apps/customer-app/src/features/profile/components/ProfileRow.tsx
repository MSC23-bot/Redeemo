import React from 'react'
import { Pressable, View, Text, StyleSheet } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import { haptics } from '@/design-system/haptics'

interface Props {
  label:        string
  preview?:     string
  onPress?:     () => void
  leftIcon?:    React.ReactNode
  rightContent?: React.ReactNode
  destructive?: boolean
  disabled?:    boolean
  isFirst?:     boolean
}

export function ProfileRow({
  label, preview, onPress, leftIcon, rightContent, destructive, disabled, isFirst,
}: Props) {
  const rowContent = (
    <View style={[styles.row, !isFirst && styles.divider, disabled && styles.dimmed]}>
      {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
      <Text
        style={[styles.label, destructive && styles.destructive]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View style={styles.right}>
        {rightContent ?? (
          <>
            {preview && (
              <Text style={styles.preview} numberOfLines={1}>{preview}</Text>
            )}
            {onPress && !disabled && (
              <ChevronRight size={16} color="#9CA3AF" />
            )}
          </>
        )}
      </View>
    </View>
  )

  if (!onPress || disabled) return rowContent

  return (
    <Pressable
      onPress={() => { void haptics.touch.light(); onPress() }}
      style={({ pressed }) => pressed ? styles.pressed : undefined}
      accessibilityRole="button"
    >
      {rowContent}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, minHeight: 52, paddingVertical: 8,
  },
  divider:   { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F3F4F6' },
  dimmed:    { opacity: 0.45 },
  pressed:   { opacity: 0.7 },
  leftIcon:  { marginRight: 10 },
  label:     { flex: 1, fontSize: 15, fontWeight: '500', color: '#010C35' },
  destructive: { color: '#DC2626' },
  right:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  preview:   { fontSize: 12, color: 'rgba(1,12,53,0.5)', maxWidth: 160 },
})
