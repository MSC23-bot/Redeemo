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

// Round 4 §1: distance now formats as "X,XXX.X miles away" with a
// comma thousands separator, per user direction. Short distances stay
// terse ("420m away"). The "away" suffix is consistent across both
// branches so the layout reads naturally.
function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m away`
  const miles = (metres / 1609.34).toFixed(1)
  // Comma thousands separator. The fractional part stays as-is —
  // applied only to the integer side via lookahead.
  const withCommas = miles.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${withCommas} miles away`
}

// Round 4 §1: MetaRow simplified. The RatingBlock moved up to the
// MerchantHeadline (top-right of identity zone, near the banner) so
// the meta row carries only the open-status + distance information.
// Slightly larger fonts (12 → 13) per user direction "could scale up
// a little bit, in the right ratio".
export function MetaRow({ isOpenNow, openingHours, distanceMetres, now }: Props) {
  const status = smartStatus(isOpenNow, openingHours, now)
  const distance = formatDistance(distanceMetres)

  return (
    <View style={styles.row}>
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
      {distance !== null ? (
        <>
          <Text variant="label.md" style={styles.separator}>·</Text>
          <Text variant="label.md" style={styles.distance} testID="meta-row-distance">{distance}</Text>
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 4, flexWrap: 'wrap' },
  statusText: { color: '#222', fontWeight: '500', fontSize: 13 },
  separator:  { color: '#D1D5DB', fontSize: 13 },
  distance:   { color: '#6B7280', fontWeight: '500', fontSize: 13 },
})
