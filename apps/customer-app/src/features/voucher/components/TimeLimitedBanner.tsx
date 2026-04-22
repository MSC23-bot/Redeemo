import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Clock } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { spacing, radius } from '@/design-system/tokens'

type Props = {
  state: 'inactive' | 'active' | 'expired' | 'outside_window'
  formattedCountdown: string
  expiryDateFormatted?: string | null
  nextWindowLabel?: string | null
  scheduleLabel?: string | null
}

export function TimeLimitedBanner({ state, formattedCountdown, expiryDateFormatted, nextWindowLabel, scheduleLabel }: Props) {
  if (state === 'inactive' || state === 'expired') return null

  if (state === 'outside_window') {
    return (
      <View style={styles.headerBanner}>
        <View style={styles.iconSquare}>
          <Clock size={16} color="#FFF" />
        </View>
        <View style={styles.bannerContent}>
          <Text variant="label.eyebrow" color="inverse" style={styles.label}>Available again in</Text>
          <Text variant="heading.sm" color="inverse" style={styles.countdown}>{formattedCountdown}</Text>
          {(nextWindowLabel || scheduleLabel) && (
            <Text variant="label.md" style={styles.subtext}>
              {[nextWindowLabel, scheduleLabel].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.headerBanner}>
      <View style={styles.iconSquare}>
        <Clock size={16} color="#FFF" />
      </View>
      <View style={styles.bannerContent}>
        <Text variant="label.eyebrow" color="inverse" style={styles.label}>Expires in</Text>
        <Text variant="heading.sm" color="inverse" style={styles.countdown}>{formattedCountdown}</Text>
        {expiryDateFormatted && (
          <Text variant="label.md" style={styles.subtext}>{expiryDateFormatted}</Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  headerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginTop: spacing[4],
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: radius.md + 2,
    padding: spacing[3],
    paddingHorizontal: spacing[4],
  },
  iconSquare: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerContent: { flex: 1 },
  label: { fontSize: 9, letterSpacing: 0.9 },
  countdown: { fontWeight: '800', fontSize: 16, fontVariant: ['tabular-nums'] },
  subtext: { color: 'rgba(255,255,255,0.6)', fontSize: 10, marginTop: 2 },
})
