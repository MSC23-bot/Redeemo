import React from 'react'
import { View, StyleSheet } from 'react-native'
import { AlertTriangle, Clock, ChevronRight } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { spacing, radius } from '@/design-system/tokens'

type Props = {
  state: 'active' | 'expired' | 'outside_window' | 'inactive'
  expiryDateFormatted: string | null
  nextWindowLabel: string | null
  scheduleLabel: string | null
}

export function UrgencyBanner({ state, expiryDateFormatted, nextWindowLabel, scheduleLabel }: Props) {
  if (state === 'inactive') return null

  if (state === 'active') {
    return (
      <View style={[styles.banner, styles.amberBanner]}>
        <View style={[styles.iconBox, { backgroundColor: '#D97706' }]}>
          <AlertTriangle size={18} color="#FFF" />
        </View>
        <View style={styles.bannerContent}>
          <Text variant="label.md" style={[styles.title, { color: '#B45309' }]}>Limited Time Remaining</Text>
          <Text variant="label.md" style={[styles.text, { color: '#92400E' }]}>
            This voucher expires on {expiryDateFormatted}. Redeem before it's gone!
          </Text>
        </View>
      </View>
    )
  }

  if (state === 'outside_window') {
    return (
      <View style={[styles.banner, styles.blueBanner]}>
        <View style={[styles.iconBox, { backgroundColor: '#2563EB' }]}>
          <Clock size={18} color="#FFF" />
        </View>
        <View style={styles.bannerContent}>
          <Text variant="label.md" style={[styles.title, { color: '#1D4ED8' }]}>Not Currently Available</Text>
          <Text variant="label.md" style={[styles.text, { color: '#1E40AF' }]}>
            This voucher can only be redeemed {scheduleLabel ?? 'during limited hours'}.
          </Text>
          {nextWindowLabel && (
            <View style={styles.nextChip}>
              <Text variant="label.md" style={styles.nextText}>Next available: {nextWindowLabel}</Text>
              <ChevronRight size={12} color="#1D4ED8" />
            </View>
          )}
        </View>
      </View>
    )
  }

  return null
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: spacing[3],
    marginHorizontal: 14,
    marginTop: spacing[4],
    padding: spacing[4],
    borderRadius: radius.md + 2,
    borderWidth: 1,
  },
  amberBanner: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  blueBanner: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  bannerContent: { flex: 1 },
  title: { fontWeight: '800', fontSize: 12, marginBottom: 4 },
  text: { fontSize: 11, lineHeight: 16 },
  nextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing[2],
    backgroundColor: 'rgba(37,99,235,0.1)',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: spacing[2],
    borderRadius: radius.sm,
  },
  nextText: { color: '#1D4ED8', fontWeight: '700', fontSize: 11 },
})
