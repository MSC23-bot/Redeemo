import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'

type Props = {
  state: 'open' | 'closing-soon' | 'closed'
  label: 'Open' | 'Closing soon' | 'Closed'
}

const STYLE_MAP = {
  'open':         { bg: 'rgba(22,163,74,0.10)',  text: '#16A34A', dot: '#16A34A' },
  'closing-soon': { bg: 'rgba(245,158,11,0.12)', text: '#B45309', dot: '#F59E0B' },
  'closed':       { bg: 'rgba(185,28,28,0.08)',  text: '#B91C1C', dot: '#B91C1C' },
} as const

export function StatusPill({ state, label }: Props) {
  const s = STYLE_MAP[state]
  return (
    <View
      style={[styles.pill, { backgroundColor: s.bg }]}
      accessibilityRole="text"
      accessibilityLabel={`Status: ${label}`}
    >
      <View style={[styles.dot, { backgroundColor: s.dot }]} />
      <Text variant="label.md" style={[styles.text, { color: s.text }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10 },
  dot:  { width: 5, height: 5, borderRadius: 3 },
  text: { fontSize: 11, fontWeight: '700' },
})
