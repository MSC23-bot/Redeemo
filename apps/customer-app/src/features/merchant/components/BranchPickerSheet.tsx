import React from 'react'
import { View, Pressable, Modal, ScrollView, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import { lightHaptic } from '@/design-system/haptics'
import type { OpeningHourEntry } from '@/lib/api/merchant'
import { StatusPill } from './StatusPill'
import { RatingBlock } from './RatingBlock'
import { smartStatus } from '../utils/smartStatus'
import { branchShortName } from '../utils/branchShortName'

type BranchEntry = {
  id: string
  name: string
  city: string | null
  county: string | null
  distanceMetres: number | null
  isOpenNow: boolean
  isActive: boolean
  // NEW (Task 11): per-row data sources for smart status + rating block.
  openingHours: OpeningHourEntry[]
  avgRating: number | null
  reviewCount: number
}

type Props = {
  visible: boolean
  branches: BranchEntry[]
  currentBranchId: string
  onPick: (branchId: string) => void
  onDismiss: () => void
}

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres >= 100_000) return null
  if (metres < 1000) return `${Math.round(metres)}m`
  return `${(metres / 1609.34).toFixed(1)} mi`
}

export function BranchPickerSheet({ visible, branches, currentBranchId, onPick, onDismiss }: Props) {
  const sortedBranches = React.useMemo(() => {
    const current = branches.find(b => b.id === currentBranchId)
    const others  = branches.filter(b => b.id !== currentBranchId)
    const allHaveGps = branches.every(b => b.distanceMetres !== null)
    const otherSorted = allHaveGps
      ? [...others].sort((a, b) => (a.distanceMetres ?? Infinity) - (b.distanceMetres ?? Infinity))
      : [...others].sort((a, b) => branchShortName(a.name).localeCompare(branchShortName(b.name)))
    return current ? [current, ...otherSorted] : otherSorted
  }, [branches, currentBranchId])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={e => e?.stopPropagation?.()}>
          <View style={styles.dragHandle} />
          <Text variant="heading.lg" style={styles.title}>Choose branch</Text>
          <ScrollView>
            {sortedBranches.map(b => {
              const isCurrent = b.id === currentBranchId
              const isDisabled = !b.isActive
              const status = smartStatus(b.isOpenNow, b.openingHours)
              const distance = formatDistance(b.distanceMetres)
              const a11yLabel = `${branchShortName(b.name)}${isCurrent ? ' — currently viewing' : ''}${isDisabled ? ' — Unavailable' : ''}`
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
                  style={[styles.row, isCurrent && styles.rowCurrent, isDisabled && styles.rowDisabled]}
                >
                  <View style={styles.rowTop}>
                    <View style={styles.nameWrap}>
                      <Text variant="label.lg" style={[styles.name, isDisabled && styles.disabledText]}>
                        {branchShortName(b.name)}
                      </Text>
                      {isCurrent ? (
                        <Text variant="label.md" style={styles.currentTag}>Currently viewing</Text>
                      ) : null}
                    </View>
                    <RatingBlock avgRating={b.avgRating} reviewCount={b.reviewCount} />
                  </View>
                  <View style={styles.rowBottom}>
                    <StatusPill state={status.pillState} label={status.pillLabel} />
                    <Text variant="label.md" style={styles.statusText}>{status.statusText}</Text>
                    {distance !== null ? (
                      <>
                        <Text variant="label.md" style={styles.separator}>·</Text>
                        <Text variant="label.md" style={styles.distance}>{distance}</Text>
                      </>
                    ) : null}
                  </View>
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
  overlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(1,12,53,0.5)' },
  sheet:      { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingBottom: 40, maxHeight: '70%' },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 8, marginBottom: 20 },
  title:      { fontSize: 18, fontWeight: '800', color: '#010C35', marginBottom: 12 },
  row:        { paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#F0EBE6' },
  rowCurrent: { backgroundColor: 'rgba(226,12,4,0.03)' },
  rowDisabled:{ opacity: 0.55 },
  rowTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 5 },
  nameWrap:   { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  name:       { fontSize: 14, fontWeight: '800', color: '#010C35' },
  currentTag: { fontSize: 10, fontWeight: '700', color: '#16A34A', backgroundColor: 'rgba(22,163,74,0.10)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  rowBottom:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { color: '#222', fontWeight: '500', fontSize: 11 },
  separator:  { color: '#D1D5DB', fontSize: 11 },
  distance:   { color: '#9CA3AF', fontSize: 11 },
  disabledText: { color: '#9CA3AF' },
})
