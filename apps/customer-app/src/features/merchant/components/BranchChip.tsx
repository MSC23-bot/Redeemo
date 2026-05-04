import React from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import { lightHaptic } from '@/design-system/haptics'

type Props = {
  isMultiBranch: boolean
  onPress: () => void
}

export function BranchChip({ isMultiBranch, onPress }: Props) {
  if (!isMultiBranch) return null

  return (
    <Pressable
      style={styles.chip}
      accessibilityRole="button"
      accessibilityLabel="Switch branch"
      onPress={() => { lightHaptic(); onPress() }}
    >
      <Text variant="label.md" style={styles.text}>Switch branch</Text>
      <Text variant="label.md" style={styles.caret} testID="chip-caret">▾</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip:  { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 11, borderRadius: 8, backgroundColor: 'rgba(226,12,4,0.07)', borderWidth: 1, borderColor: 'rgba(226,12,4,0.20)' },
  text:  { color: '#E20C04', fontWeight: '600', fontSize: 11 },
  caret: { color: '#E20C04', fontSize: 12 },
})
