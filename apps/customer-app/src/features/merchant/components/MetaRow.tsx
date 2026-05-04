import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import { StatusPill } from './StatusPill'
import { RatingBlock } from './RatingBlock'
import { smartStatus } from '../utils/smartStatus'
import type { OpeningHourEntry } from '@/lib/api/merchant'

type Props = {
  isOpenNow:      boolean
  openingHours:   OpeningHourEntry[]
  distanceMetres: number | null
  avgRating:      number | null
  reviewCount:    number
  // Test injection point — defaults to new Date(). Production never passes.
  now?: Date
}

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m`
  return `${(metres / 1609.34).toFixed(1)} mi`
}

// Visual correction round §2 (post-PR-#35 QA): MetaRow's per-row opacity-
// dip on `switchTrigger` REMOVED. The branch-switch feedback is now
// centralised in BranchContextBand's coordinated motion (Section §4) —
// a single visible cause-effect across the whole branch context band
// rather than five scattered subtle animations the user could miss.
//
// MetaRow keeps its testIDs (`meta-row-status-text`, `meta-row-distance`)
// for the band-level motion to target if needed; it just doesn't drive
// its own animation any more.
export function MetaRow({ isOpenNow, openingHours, distanceMetres, avgRating, reviewCount, now }: Props) {
  const status = smartStatus(isOpenNow, openingHours, now)
  const distance = formatDistance(distanceMetres)

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <StatusPill state={status.pillState} label={status.pillLabel} />
        <Text variant="label.md" style={styles.statusText} testID="meta-row-status-text" numberOfLines={1} ellipsizeMode="tail">
          {status.statusText}
        </Text>
        {distance !== null ? (
          <>
            <Text variant="label.md" style={styles.separator}>·</Text>
            <Text variant="label.md" style={styles.distance} testID="meta-row-distance">{distance}</Text>
          </>
        ) : null}
      </View>
      <RatingBlock avgRating={avgRating} reviewCount={reviewCount} />
    </View>
  )
}

const styles = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 4 },
  left:       { flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0, flex: 1 },
  statusText: { color: '#222', fontWeight: '500', fontSize: 12 },
  separator:  { color: '#D1D5DB', fontSize: 12 },
  distance:   { color: '#9CA3AF', fontWeight: '400', fontSize: 12 },
})
