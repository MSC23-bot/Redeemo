import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Clock } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import type { WindowState } from '@/features/voucher/utils/timeLimitedWindow'
import { formatClockTime } from '@/features/voucher/utils/countdownFormat'

type Props = {
  windowState: WindowState
  scheduleString: string
  currentWindowEndsAt?: Date | null
  nextWindowStartsAt?: Date | null
}

/**
 * Banner-below-coupon for TIME_LIMITED voucher state (M4b-5).
 *
 * Spec §5.4 banner-below-coupon copy:
 *  - active     → calm amber "Available Now" + per-window-rule body
 *  - urgent     → coral "Window Closing Soon" + clock-time copy
 *  - unavailable-* → calm blue "Not Currently Available" + schedule
 *  - no-windows / expired / unknown → renders nothing
 *
 * PRODUCT.md anti-Groupon tone — NO "Hurry!" / "Last Chance!" copy.
 * Urgency is signalled by colour + the "closing soon" framing only.
 */
export function TimeLimitedBanner({
  windowState, scheduleString, currentWindowEndsAt, nextWindowStartsAt,
}: Props) {
  if (windowState === 'active') {
    return (
      <View style={[styles.root, styles.active]} testID="time-limited-banner-active">
        <View style={[styles.iconBox, styles.iconActive]}>
          <Clock size={14} color="#FFFFFF" />
        </View>
        <View style={styles.body}>
          <Text variant="label.md" style={styles.titleActive}>Available Now</Text>
          <Text variant="body.sm" style={styles.copyActive}>
            Redeem within today's window. You can use this offer once each window.
          </Text>
        </View>
      </View>
    )
  }

  if (windowState === 'urgent') {
    const endsAtCopy = currentWindowEndsAt ? ` ends at ${formatClockTime(currentWindowEndsAt)}` : ''
    return (
      <View style={[styles.root, styles.urgent]} testID="time-limited-banner-urgent">
        <View style={[styles.iconBox, styles.iconUrgent]}>
          <Clock size={14} color="#FFFFFF" />
        </View>
        <View style={styles.body}>
          <Text variant="label.md" style={styles.titleUrgent}>Window Closing Soon</Text>
          <Text variant="body.sm" style={styles.copyUrgent}>
            Today's window{endsAtCopy}. Other windows are still available.
          </Text>
        </View>
      </View>
    )
  }

  if (windowState === 'unavailable-today' || windowState === 'unavailable-future-day') {
    return (
      <View style={[styles.root, styles.unavailable]} testID="time-limited-banner-unavailable">
        <View style={[styles.iconBox, styles.iconUnavail]}>
          <Clock size={14} color="#FFFFFF" />
        </View>
        <View style={styles.body}>
          <Text variant="label.md" style={styles.titleUnavail}>Not Currently Available</Text>
          <Text variant="body.sm" style={styles.copyUnavail}>
            This voucher can be redeemed {scheduleString}.
          </Text>
        </View>
      </View>
    )
  }

  // 'no-windows' / unknown → render nothing (state machine should never reach this)
  return null
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 12, borderRadius: 10, marginTop: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconBox: {
    width: 28, height: 28, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  body: { flex: 1 },

  active:        { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  iconActive:    { backgroundColor: '#D97706' },
  titleActive:   { color: '#92400E', fontWeight: '800' },
  copyActive:    { color: '#92400E', marginTop: 2 },

  urgent:        { backgroundColor: '#FED7AA', borderColor: '#FB923C' },
  iconUrgent:    { backgroundColor: '#EA580C' },
  titleUrgent:   { color: '#9A3412', fontWeight: '800' },
  copyUrgent:    { color: '#9A3412', marginTop: 2 },

  unavailable:   { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  iconUnavail:   { backgroundColor: '#2563EB' },
  titleUnavail:  { color: '#1E40AF', fontWeight: '800' },
  copyUnavail:   { color: '#1E40AF', marginTop: 2 },
})
