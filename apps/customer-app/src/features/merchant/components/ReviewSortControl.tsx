import React, { useState, useCallback } from 'react'
import { View, Pressable, StyleSheet, Modal, FlatList } from 'react-native'
import { ChevronDown, Check } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

export type SortOption = 'recent' | 'highest' | 'lowest' | 'helpful'

const SORT_LABELS: Record<SortOption, string> = {
  recent: 'Most recent',
  highest: 'Highest rated',
  lowest: 'Lowest rated',
  helpful: 'Most helpful',
}

type Props = {
  totalReviews: number
  sort: SortOption
  onSortChange: (sort: SortOption) => void
}

export function ReviewSortControl({ totalReviews, sort, onSortChange }: Props) {
  const [showPicker, setShowPicker] = useState(false)

  const handleSelect = useCallback((option: SortOption) => {
    lightHaptic()
    onSortChange(option)
    setShowPicker(false)
  }, [onSortChange])

  return (
    <View style={styles.container}>
      <Text variant="label.md" color="tertiary" meta style={styles.countLabel}>
        {totalReviews} reviews
      </Text>
      <Pressable onPress={() => { lightHaptic(); setShowPicker(true) }} style={styles.sortBtn}>
        <Text variant="label.lg" style={styles.sortText}>{SORT_LABELS[sort]}</Text>
        <ChevronDown size={12} color="#9CA3AF" />
      </Pressable>

      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowPicker(false)}>
          <View style={styles.picker}>
            {(Object.keys(SORT_LABELS) as SortOption[]).map(option => (
              <Pressable
                key={option}
                onPress={() => handleSelect(option)}
                style={[styles.pickerItem, option === sort && styles.pickerItemActive]}
              >
                <Text variant="label.lg" style={[styles.pickerText, option === sort && styles.pickerTextActive]}>
                  {SORT_LABELS[option]}
                </Text>
                {option === sort && <Check size={16} color={color.brandRose} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  countLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#F0EBE6',
  },
  sortText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#010C35',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  picker: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 8,
    width: 220,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  pickerItemActive: {
    backgroundColor: 'rgba(226,12,4,0.06)',
  },
  pickerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#010C35',
  },
  pickerTextActive: {
    color: color.brandRose,
    fontWeight: '700',
  },
})
