import React from 'react'
import { View, StyleSheet } from 'react-native'
import { BranchCard } from './BranchCard'
import { branchShortName } from '../utils/branchShortName'
import type { BranchTile, OpeningHourEntry } from '@/lib/api/merchant'

type Props = {
  branches:        BranchTile[]
  currentBranchId: string
  /** selectedBranch's openingHours — passed by parent for HoursPreviewSheet's
   *  current-branch case. Other branches read b.openingHours from their tile. */
  selectedOpeningHours: OpeningHourEntry[]
  onCall:          (branchId: string, phone: string) => void
  onDirections:    (branchId: string) => void
  onHoursPreview:  (branchId: string) => void
  onSwitch:        (branchId: string) => void
}

export function BranchesTab({
  branches,
  currentBranchId,
  selectedOpeningHours: _selectedOpeningHours,
  onCall,
  onDirections,
  onHoursPreview,
  onSwitch,
}: Props) {
  // Other Locations: exclude current branch AND suspended branches.
  const others = branches.filter(b => b.id !== currentBranchId && b.isActive)

  if (others.length === 0) {
    // Defensive empty state — should not normally render because the
    // screen hides the tab entirely when otherActive === 0.
    return <View style={styles.container} />
  }

  // Sort: nearest-first when ALL have GPS; alphabetical fallback.
  const allHaveGps = others.every(b => b.distance !== null)
  const sorted = allHaveGps
    ? [...others].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
    : [...others].sort((a, b) => branchShortName(a.name).localeCompare(branchShortName(b.name)))

  return (
    <View style={styles.container}>
      {sorted.map(b => (
        <BranchCard
          key={b.id}
          branch={b}
          // Each card reads its own branch's openingHours for smart status.
          openingHoursForStatus={b.openingHours}
          onCall={() => onCall(b.id, b.phone ?? '')}
          onDirections={() => onDirections(b.id)}
          onHoursPreview={() => onHoursPreview(b.id)}
          onSwitch={() => onSwitch(b.id)}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 10 },
})
