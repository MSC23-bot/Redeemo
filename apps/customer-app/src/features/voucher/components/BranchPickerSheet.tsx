import React from 'react'
import { View, Pressable, Modal, ScrollView, StyleSheet } from 'react-native'
import { MapPin, Check, X } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import type { BranchDetail } from '@/lib/api/merchant'

type Props = {
  visible: boolean
  onDismiss: () => void
  branches: BranchDetail[]
  selectedBranchId: string | null
  onSelect: (branch: BranchDetail) => void
}

export function BranchPickerSheet({ visible, onDismiss, branches, selectedBranchId, onSelect }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
          <View style={styles.dragHandle} />

          <View style={styles.headerRow}>
            <Text variant="heading.lg" style={styles.title}>Select Branch</Text>
            <Pressable onPress={onDismiss} style={styles.closeBtn} accessibilityLabel="Close">
              <X size={20} color="#9CA3AF" />
            </Pressable>
          </View>

          <Text variant="body.sm" color="secondary" style={styles.subtitle}>
            Which branch are you visiting?
          </Text>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {branches.map(branch => {
              const isSelected = branch.id === selectedBranchId
              const address = [branch.addressLine1, branch.city, branch.postcode].filter(Boolean).join(', ')

              return (
                <Pressable
                  key={branch.id}
                  onPress={() => { lightHaptic(); onSelect(branch) }}
                  style={[styles.item, isSelected && styles.itemSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${branch.name}, ${address}`}
                >
                  <View style={styles.itemLeft}>
                    <MapPin size={16} color={isSelected ? color.brandRose : '#9CA3AF'} />
                    <View style={styles.itemInfo}>
                      <Text variant="label.lg" style={[styles.itemName, isSelected && styles.itemNameSelected]}>
                        {branch.name}
                      </Text>
                      <Text variant="label.md" color="tertiary" meta style={styles.itemAddress} numberOfLines={1}>
                        {address}
                      </Text>
                    </View>
                  </View>
                  {isSelected && <Check size={18} color={color.brandRose} />}
                </Pressable>
              )
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(1,12,53,0.5)',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#010C35',
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },
  list: {
    flexGrow: 0,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  itemSelected: {
    backgroundColor: 'rgba(226,12,4,0.06)',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#010C35',
  },
  itemNameSelected: {
    color: color.brandRose,
  },
  itemAddress: {
    fontSize: 11,
    marginTop: 2,
  },
})
