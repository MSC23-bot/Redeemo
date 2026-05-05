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

// Round 5 §6 (impeccable polish): BranchCard joins the system the
// other cards already use (About / Photos / Amenities / Hours
// rounded at §5 + voucher card rounded at §4).
//   • borderRadius 12 → 18; padding 14 → 18; system shadow added
//     (opacity 0.08, radius 16, offset 4, elevation 4) so the card
//     visibly elevates against the white body — was the only flat
//     outline card in the merchant profile.
//   • Border `#E5E0DB` (warm-cream era) → `rgba(0,0,0,0.04)`
//     neutral. Aligns with round 4 §8's white-body palette.
//   • Title 14pt 800 → 16pt 700 (system-wide title treatment from
//     round 5 §5).
//   • statusText / separator / distance 11 → 12pt (legibility).
//   • address `#9CA3AF` 11pt → `#6B7280` 12pt (legibility).
//   • Action buttons: paddingV 7 → 9, radius 7 → 10, border neutral.
//   • Action / Switch text 10 → 11pt with letterSpacing.
const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  // Round 5 §18: vertical rhythm bumped per user direction
  // "spacing improvements on cards in branches". Progression
  // 6 → 8 → 12 (tight) becomes 8 → 10 → 16 — clearer
  // architectural separation between name, status row, and
  // address before the action row.
  // Round 5 §19 (impeccable typography pass): body text bumped
  // 12 → 13pt across status / separator / distance / address.
  // address gains lineHeight 18 + letterSpacing -0.1 for prose
  // refinement — long addresses need to breathe across two lines.
  rowTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
  name:       { fontSize: 16, fontWeight: '700', color: '#010C35', letterSpacing: -0.2 },
  rowMid:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  statusText: { color: '#222', fontWeight: '500', fontSize: 13 },
  separator:  { color: '#D1D5DB', fontSize: 13 },
  distance:   { color: '#6B7280', fontWeight: '500', fontSize: 13 },
  address:    { color: '#6B7280', fontSize: 13, lineHeight: 18, letterSpacing: -0.1, marginBottom: 16 },
  actions:    { flexDirection: 'row', gap: 8 },
  actionBtn:  {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: '#FFF',
  },
  actionText: { fontSize: 12, fontWeight: '600', color: '#010C35', letterSpacing: 0.1 },
  switchBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#E20C04',
    shadowColor: '#E20C04',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  switchText: { fontSize: 12, fontWeight: '700', color: '#FFF', letterSpacing: 0.1 },
})
