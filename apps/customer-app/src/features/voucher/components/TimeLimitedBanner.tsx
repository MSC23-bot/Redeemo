import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Clock } from 'lucide-react-native'
import { Text } from '@/design-system/Text'

type Props = {
  isCurrentlyAvailable: boolean
  isUrgent: boolean
  minutesRemaining: number | null
}

/**
 * Time-limited voucher banner. Sits beneath the coupon when voucher is
 * TIME_LIMITED type, surfaces availability + countdown info.
 *
 * **M1 LIMITATION:** the backend doesn't currently surface
 * availableFrom / availableUntil window data per voucher (see
 * useTimeLimited.ts module header). The banner renders a simple
 * "Time-limited voucher" notice. When backend ships the window
 * fields, this banner will switch to a real countdown / urgency /
 * unavailable variant per the original 3C.1c design.
 */
export function TimeLimitedBanner({
  isCurrentlyAvailable, isUrgent, minutesRemaining,
}: Props) {
  // Single-state banner for M1 (backend window data missing). When
  // data lands, fork into 3 variants per states 5/6/7.
  if (isCurrentlyAvailable && isUrgent && minutesRemaining != null) {
    return (
      <View style={[styles.root, styles.urgent]} testID="time-limited-banner-urgent">
        <Clock size={14} color="#92400E" />
        <Text variant="label.md" style={[styles.text, { color: '#92400E' }]}>
          Hurry — {minutesRemaining} min left
        </Text>
      </View>
    )
  }
  if (!isCurrentlyAvailable) {
    return (
      <View style={[styles.root, styles.unavailable]} testID="time-limited-banner-unavailable">
        <Clock size={14} color="#7F1D1D" />
        <Text variant="label.md" style={[styles.text, { color: '#7F1D1D' }]}>
          Currently unavailable
        </Text>
      </View>
    )
  }
  return (
    <View style={[styles.root, styles.available]} testID="time-limited-banner-available">
      <Clock size={14} color="#92400E" />
      <Text variant="label.md" style={[styles.text, { color: '#92400E' }]}>
        Time-limited voucher
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    marginTop: 8,
  },
  available:   { backgroundColor: '#FEF3C7' },
  urgent:      { backgroundColor: '#FED7AA' },
  unavailable: { backgroundColor: '#FEE2E2' },
  text: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
})
