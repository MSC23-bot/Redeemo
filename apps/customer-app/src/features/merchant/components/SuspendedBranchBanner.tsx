import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { AlertTriangle, X } from '@/design-system/icons'
import { Text } from '@/design-system/Text'

type Props = { visible: boolean; onDismiss: () => void }

export function SuspendedBranchBanner({ visible, onDismiss }: Props) {
  if (!visible) return null
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <AlertTriangle size={16} color="#92400E" />
      <Text variant="body.sm" style={styles.text}>
        This branch is temporarily unavailable. Showing nearest active branch.
      </Text>
      <Pressable accessibilityLabel="Dismiss banner" onPress={onDismiss} style={styles.close}>
        <X size={14} color="#92400E" />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF3C7', borderColor: '#FCD34D', borderWidth: 1,
    paddingVertical: 10, paddingHorizontal: 12,
    marginHorizontal: 16, marginBottom: 8, borderRadius: 8,
  },
  text:  { flex: 1, fontSize: 12, color: '#92400E' },
  close: { padding: 4 },
})
