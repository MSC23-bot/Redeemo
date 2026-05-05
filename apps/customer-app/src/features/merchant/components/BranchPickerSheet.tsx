import React from 'react'
import { View, Pressable, ScrollView, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
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
  if (metres < 1000) return `${Math.round(metres)}m`
  return `${(metres / 1609.34).toFixed(1)} mi`
}

// Round 3 §A4: migrated onto the shared `<BottomSheet>` primitive.
export function BranchPickerSheet({ visible, branches, currentBranchId, onPick, onDismiss }: Props) {
  const sortedBranches = React.useMemo(() => {
    const current = branches.find(b => b.id === currentBranchId)
    const others  = branches.filter(b => b.id !== currentBranchId)
    const activeOthers   = others.filter(b => b.isActive)
    const inactiveOthers = others.filter(b => !b.isActive)

    const allActiveHaveGps = activeOthers.every(b => b.distanceMetres !== null)
    const sortedActive = allActiveHaveGps
      ? [...activeOthers].sort((a, b) => (a.distanceMetres ?? Infinity) - (b.distanceMetres ?? Infinity))
      : [...activeOthers].sort((a, b) => branchShortName(a.name).localeCompare(branchShortName(b.name)))

    // Inactive rows always alphabetical (distance signal is meaningless when unavailable)
    const sortedInactive = [...inactiveOthers].sort((a, b) =>
      branchShortName(a.name).localeCompare(branchShortName(b.name)))

    return current
      ? [current, ...sortedActive, ...sortedInactive]
      : [...sortedActive, ...sortedInactive]
  }, [branches, currentBranchId])

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Choose branch">
      <Text variant="heading.lg" style={styles.title}>Choose branch</Text>
      <ScrollView style={styles.list}>
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
                {isDisabled ? (
                  <View style={styles.unavailablePill} accessibilityRole="text" accessibilityLabel="Status: Unavailable">
                    <View style={styles.unavailableDot} />
                    <Text variant="label.md" style={styles.unavailableText}>Unavailable</Text>
                  </View>
                ) : (
                  <>
                    <StatusPill state={status.pillState} label={status.pillLabel} />
                    <Text variant="label.md" style={styles.statusText}>{status.statusText}</Text>
                    {distance !== null ? (
                      <>
                        <Text variant="label.md" style={styles.separator}>·</Text>
                        <Text variant="label.md" style={styles.distance}>{distance}</Text>
                      </>
                    ) : null}
                  </>
                )}
              </View>
            </Pressable>
          )
        })}
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  title:      { fontSize: 18, fontWeight: '800', color: '#010C35', marginBottom: 12 },
  list:       { maxHeight: 460 },
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
  unavailablePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10,
    backgroundColor: 'rgba(156,163,175,0.12)',
  },
  unavailableDot:  { width: 5, height: 5, borderRadius: 3, backgroundColor: '#9CA3AF' },
  unavailableText: { color: '#6B7280', fontWeight: '600', fontSize: 11 },
})
