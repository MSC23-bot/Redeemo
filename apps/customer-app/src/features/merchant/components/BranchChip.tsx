import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { MapPin, ChevronDown } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

type Props = {
  branchName: string
  city: string | null
  county: string | null
  distanceMetres: number | null
  isOpenNow: boolean
  closesAt: string | null   // e.g. "17:00" — null means no closeTime available
  isMultiBranch: boolean
  onPress: () => void
}

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m`
  if (metres >= 100_000) return null  // suppress: city/county will be shown instead
  const miles = metres / 1609.34
  return `${miles.toFixed(1)} mi`
}

function formatLocation(city: string | null, county: string | null): string {
  if (city && county) return `${city}, ${county}`
  return city ?? county ?? ''
}

function formatStatus(isOpenNow: boolean, closesAt: string | null): string {
  if (isOpenNow && closesAt) return `Closes ${closesAt}`
  if (isOpenNow) return 'Open now'
  return 'Closed'
}

export function BranchChip({
  branchName, city, county, distanceMetres,
  isOpenNow, closesAt, isMultiBranch, onPress,
}: Props) {
  const distText = formatDistance(distanceMetres)
  const ctxLine  = distText ?? formatLocation(city, county)
  const statusText = formatStatus(isOpenNow, closesAt)

  if (isMultiBranch) {
    return (
      <Pressable
        style={styles.chip}
        accessibilityRole="button"
        accessibilityLabel={`Switch branch — currently ${branchName}`}
        onPress={() => { lightHaptic(); onPress() }}
      >
        <View style={styles.line1}>
          <MapPin size={14} color={color.brandRose} />
          <Text variant="label.lg" style={styles.name}>{branchName}</Text>
          <ChevronDown size={14} color="#9CA3AF" />
        </View>
        <Text variant="label.md" color="tertiary" meta style={styles.line2}>
          {ctxLine ? `${ctxLine} · ` : ''}{statusText}
        </Text>
      </Pressable>
    )
  }

  return (
    <View style={styles.chip}>
      <View style={styles.line1}>
        <MapPin size={14} color={color.brandRose} />
        <Text variant="label.lg" style={styles.name}>{branchName}</Text>
      </View>
      <Text variant="label.md" color="tertiary" meta style={styles.line2}>
        {ctxLine ? `${ctxLine} · ` : ''}{statusText}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: { gap: 2, paddingVertical: 8 },
  line1: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  line2: { fontSize: 11, fontWeight: '600' },
  name:  { fontSize: 13, fontWeight: '700', color: '#010C35' },
})
