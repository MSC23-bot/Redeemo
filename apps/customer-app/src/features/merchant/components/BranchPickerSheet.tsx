import React from 'react'
import { View, Pressable, Modal, ScrollView, StyleSheet } from 'react-native'
import { Check, MapPin } from '@/design-system/icons'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

type BranchEntry = {
  id: string
  name: string
  city: string | null
  county: string | null
  distanceMetres: number | null
  isOpenNow: boolean
  isActive: boolean
}

type Props = {
  visible: boolean
  branches: BranchEntry[]
  currentBranchId: string
  onPick: (branchId: string) => void
  onDismiss: () => void
}

function formatDistanceOrPlace(b: BranchEntry): string {
  if (b.distanceMetres !== null && b.distanceMetres < 100_000) {
    if (b.distanceMetres < 1000) return `${Math.round(b.distanceMetres)}m`
    return `${(b.distanceMetres / 1609.34).toFixed(1)} mi`
  }
  if (b.city && b.county) return `${b.city}, ${b.county}`
  return b.city ?? b.county ?? ''
}

export function BranchPickerSheet({ visible, branches, currentBranchId, onPick, onDismiss }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={e => e?.stopPropagation?.()}>
          <View style={styles.dragHandle} />
          <Text variant="heading.lg" style={styles.title}>Choose branch</Text>
          <ScrollView>
            {branches.map(b => {
              const isCurrent = b.id === currentBranchId
              const isDisabled = !b.isActive
              const a11yLabel = `${b.name}${isCurrent ? ' — current' : ''}${isDisabled ? ' — Unavailable' : ''}`
              return (
                <Pressable
                  key={b.id}
                  accessibilityLabel={a11yLabel}
                  disabled={isDisabled}
                  onPress={() => {
                    if (isDisabled) return
                    lightHaptic()
                    if (!isCurrent) onPick(b.id)
                    onDismiss()
                  }}
                  style={[styles.row, isDisabled && styles.rowDisabled]}
                >
                  <MapPin size={14} color={isDisabled ? '#9CA3AF' : color.brandRose} />
                  <View style={styles.rowText}>
                    <Text variant="label.lg" style={[styles.rowName, isDisabled && styles.disabledText]}>
                      {b.name}
                    </Text>
                    <Text variant="label.md" color="tertiary" meta style={styles.rowMeta}>
                      {formatDistanceOrPlace(b)}
                      {' · '}
                      {isDisabled ? 'Unavailable' : (b.isOpenNow ? 'Open' : 'Closed')}
                    </Text>
                  </View>
                  {isCurrent && <Check size={16} color={color.brandRose} />}
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
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(1,12,53,0.5)' },
  sheet:   { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingBottom: 40, maxHeight: '70%' },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 8, marginBottom: 20 },
  title:   { fontSize: 18, fontWeight: '800', color: '#010C35', marginBottom: 12 },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0EBE6' },
  rowDisabled: { opacity: 0.55 },
  rowText: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '700', color: '#010C35' },
  disabledText: { color: '#9CA3AF' },
  rowMeta: { fontSize: 11, marginTop: 2 },
})
