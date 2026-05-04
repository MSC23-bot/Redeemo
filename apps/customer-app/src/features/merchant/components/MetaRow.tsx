import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import { StatusPill } from './StatusPill'
import { smartStatus } from '../utils/smartStatus'
import type { OpeningHourEntry } from '@/lib/api/merchant'

type Props = {
  isOpenNow:      boolean
  openingHours:   OpeningHourEntry[]
  distanceMetres: number | null
  // Test injection point — defaults to new Date(). Production never passes.
  now?: Date
}

// Round 4 §1: distance reformatted with comma thousands separator +
// "miles away" suffix. Short distances stay terse with the same
// "away" suffix for consistency.
function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m away`
  const miles = (metres / 1609.34).toFixed(1)
  // Comma thousands separator, applied only to the integer side.
  const withCommas = miles.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${withCommas} miles away`
}

// Round 4 §2: layout split into a left group (status pill + status
// text) and a right-aligned distance, per direction "the distance
// could align to the right". The intercalary separator dot drops out
// — `justify-content: space-between` carries the visual separation
// and aligns the distance with the rating block above it on the
// right rail.
//
// Status pill bumped a tad larger (5/12 → 6/14, label 11 → 12pt) per
// direction "the closed open sign could be just a tad, a little bit
// bigger".
export function MetaRow({ isOpenNow, openingHours, distanceMetres, now }: Props) {
  const status = smartStatus(isOpenNow, openingHours, now)
  const distance = formatDistance(distanceMetres)

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <StatusPill state={status.pillState} label={status.pillLabel} />
        <Text
          variant="label.md"
          style={styles.statusText}
          testID="meta-row-status-text"
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {status.statusText}
        </Text>
      </View>
      {distance !== null ? (
        <Text variant="label.md" style={styles.distance} testID="meta-row-distance">
          {distance}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
  },
  // Left group: status pill + status text. flexShrink lets the
  // status text truncate if needed so the right-aligned distance
  // never gets pushed off the rail.
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flexShrink: 1,
    minWidth: 0,
  },
  statusText: { color: '#222', fontWeight: '500', fontSize: 13 },
  // Right-aligned distance: same fontSize as the status text but a
  // touch heavier weight so the right rail reads as deliberate
  // (rating block above + distance below, both right-aligned).
  distance:   { color: '#6B7280', fontWeight: '600', fontSize: 13, textAlign: 'right' },
})
