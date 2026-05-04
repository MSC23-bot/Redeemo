import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Phone, Navigation, Clock, ArrowRight } from '@/design-system/icons'
import { Text } from '@/design-system/Text'
import { lightHaptic } from '@/design-system/haptics'
import { StatusPill } from './StatusPill'
import { RatingBlock } from './RatingBlock'
import { smartStatus } from '../utils/smartStatus'
import { branchShortName } from '../utils/branchShortName'
import type { BranchTile, OpeningHourEntry } from '@/lib/api/merchant'

type Props = {
  branch:                BranchTile
  openingHoursForStatus: OpeningHourEntry[]
  onCall:                () => void
  onDirections:          () => void
  onHoursPreview:        () => void
  onSwitch:              () => void
}

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m`
  return `${(metres / 1609.34).toFixed(1)} mi`
}

export function BranchCard({ branch, openingHoursForStatus, onCall, onDirections, onHoursPreview, onSwitch }: Props) {
  const status   = smartStatus(branch.isOpenNow, openingHoursForStatus)
  const distance = formatDistance(branch.distance)
  const address  = [branch.addressLine1, branch.city, branch.postcode].filter(Boolean).join(', ')

  return (
    <View style={styles.card}>
      <View style={styles.rowTop}>
        <Text variant="label.lg" style={styles.name} numberOfLines={1} ellipsizeMode="tail">
          {branchShortName(branch.name)}
        </Text>
        <RatingBlock avgRating={branch.avgRating} reviewCount={branch.reviewCount} />
      </View>

      <View style={styles.rowMid}>
        <StatusPill state={status.pillState} label={status.pillLabel} />
        <Text variant="label.md" style={styles.statusText}>{status.statusText}</Text>
        {distance !== null ? (
          <>
            <Text variant="label.md" style={styles.separator}>·</Text>
            <Text variant="label.md" style={styles.distance}>{distance}</Text>
          </>
        ) : null}
      </View>

      {address ? (
        <Text variant="label.md" style={styles.address} numberOfLines={1} ellipsizeMode="tail">{address}</Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} onPress={() => { lightHaptic(); onCall() }} accessibilityLabel="Call">
          <Phone size={12} color="#010C35" />
          <Text variant="label.md" style={styles.actionText}>Call</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={() => { lightHaptic(); onDirections() }} accessibilityLabel="Directions">
          <Navigation size={12} color="#010C35" />
          <Text variant="label.md" style={styles.actionText}>Directions</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={() => { lightHaptic(); onHoursPreview() }} accessibilityLabel="Hours">
          <Clock size={12} color="#010C35" />
          <Text variant="label.md" style={styles.actionText}>Hours</Text>
        </Pressable>
        <Pressable style={styles.switchBtn} onPress={() => { lightHaptic(); onSwitch() }} accessibilityLabel="Switch to this branch">
          <Text variant="label.md" style={styles.switchText}>Switch</Text>
          <ArrowRight size={12} color="#fff" />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card:       { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E0DB', borderRadius: 12, padding: 14 },
  rowTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 5 },
  name:       { fontSize: 14, fontWeight: '800', color: '#010C35' },
  rowMid:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  statusText: { color: '#222', fontWeight: '500', fontSize: 11 },
  separator:  { color: '#D1D5DB', fontSize: 11 },
  distance:   { color: '#9CA3AF', fontSize: 11 },
  address:    { color: '#9CA3AF', fontSize: 11, marginBottom: 10 },
  actions:    { flexDirection: 'row', gap: 6 },
  actionBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7, borderRadius: 7, borderWidth: 1, borderColor: '#E5E0DB', backgroundColor: '#fff' },
  actionText: { fontSize: 10, fontWeight: '600', color: '#010C35' },
  switchBtn:  { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7, borderRadius: 7, backgroundColor: '#E20C04' },
  switchText: { fontSize: 10, fontWeight: '700', color: '#fff' },
})
