import React from 'react'
import { View, StyleSheet } from 'react-native'
import { ShieldCheck, XCircle } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { spacing, radius } from '@/design-system/tokens'

type Props = {
  variant: 'redeemed' | 'expired'
}

export function RedeemedBadge({ variant }: Props) {
  const isExpired = variant === 'expired'
  const bgColor = isExpired ? '#B91C1C' : '#16A34A'
  const glowColor = isExpired ? 'rgba(185,28,28,0.4)' : 'rgba(22,163,74,0.4)'
  const label = isExpired ? 'Voucher Expired' : 'Voucher Redeemed'
  const Icon = isExpired ? XCircle : ShieldCheck

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: bgColor,
          shadowColor: bgColor,
          shadowOpacity: 0.4,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        },
      ]}
      accessibilityLabel={label}
      accessibilityRole="text"
    >
      <View style={styles.iconCircle}>
        <Icon size={16} color="#FFF" />
      </View>
      <Text variant="heading.sm" color="inverse" style={styles.text}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[6],
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    zIndex: 20,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: { fontWeight: '800', fontSize: 15 },
})
