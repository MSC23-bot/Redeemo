import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import { formatCooldownDurationHuman } from '../utils/cooldownFormat'

/**
 * ReusableRulesCard — explains the REUSABLE voucher cadence + that
 * subscription is required to redeem. Replaces <CycleRulesCard> on
 * Voucher Detail for REUSABLE voucher types.
 *
 * Surface treatment mirrors <CycleRulesCard> — same warm-white
 * background, hairline border, soft shadow, and horizontal margins so
 * both cards read as the same visual family when sitting in the same
 * Voucher Detail slot for different voucher types. The internal
 * layout is simpler (title + body, no date block) because the cadence
 * is the only fact this card surfaces — the live countdown lives in
 * <HeroStatusBlock>, not here.
 *
 * Spec §7.3, §9 copy ledger, D23, D27, D37.
 */

type Props = {
  effectiveCooldownSeconds: number
}

const NAVY      = '#010C35'
const TEXT_2ND  = '#4B5563'

export function ReusableRulesCard({ effectiveCooldownSeconds }: Props) {
  const duration = formatCooldownDurationHuman(effectiveCooldownSeconds)
  const body = `Available again every ${duration}. Your subscription must stay active to redeem.`

  return (
    <View testID="voucher-detail-reusable-rules" style={styles.card}>
      <Text variant="label.md" style={styles.title}>Reusable voucher</Text>
      <Text variant="body.md" style={styles.body}>{body}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  // Outer card shell matches CycleRulesCard for visual consistency
  // (same warm-white surface, hairline border, soft shadow, side
  // margins). The internal layout is intentionally simpler — just a
  // title + body — because there is no date block to surface here.
  card: {
    marginHorizontal: 22,
    marginTop: 16,
    backgroundColor: '#FDFBF8',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: NAVY,
    letterSpacing: -0.1,
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    color: TEXT_2ND,
  },
})
