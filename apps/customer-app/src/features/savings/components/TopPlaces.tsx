import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import { spacing, radius, elevation } from '@/design-system/tokens'
import { FadeIn } from '@/design-system/motion/FadeIn'
import type { MerchantSaving } from '@/lib/api/savings'

type Props = {
  merchants: MerchantSaving[]
}

export function TopPlaces({ merchants }: Props) {
  if (merchants.length === 0) return null

  const top = merchants.slice(0, 2)

  return (
    <View style={styles.card}>
      <Text variant="label.eyebrow" style={styles.sectionLabel}>Top Places</Text>
      {top.map((m, i) => (
        <FadeIn key={m.merchantId} delay={i * 85} y={8}>
          <View style={styles.row}>
            <View style={styles.logoPlaceholder}>
              <Text variant="label.md" style={styles.logoInitial}>
                {m.businessName.charAt(0)}
              </Text>
            </View>
            <View style={styles.rowText}>
              <Text variant="body.sm" style={styles.merchantName}>{m.businessName}</Text>
              <Text variant="body.sm" color="tertiary" meta>
                {m.count} redemption{m.count !== 1 ? 's' : ''}
              </Text>
            </View>
            <Text style={styles.saving}>+£{m.saving.toFixed(2)}</Text>
          </View>
        </FadeIn>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: spacing[4],
    ...elevation.sm,
  },
  sectionLabel: {
    marginBottom: spacing[3],
    color: '#9CA3AF',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[2],
    gap: spacing[3],
  },
  logoPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInitial: {
    fontSize: 18,
    fontFamily: 'Lato-SemiBold',
    color: '#9CA3AF',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  merchantName: {
    fontFamily: 'Lato-Bold',
    fontSize: 14,
    color: '#010C35',
  },
  saving: {
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 18,
    color: '#16A34A',
    fontVariant: ['tabular-nums'],
  },
})
