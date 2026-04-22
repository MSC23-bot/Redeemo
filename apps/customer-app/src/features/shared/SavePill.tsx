import React from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import { Text, radius, spacing } from '@/design-system'

export function SavePill({ amount }: { amount: number | null }) {
  if (amount === null || amount <= 0) return null
  return (
    <LinearGradient
      colors={['#ECFDF5', '#D1FAE5']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: radius.pill, paddingHorizontal: spacing[2], paddingVertical: 2 }}
    >
      <Text variant="label.md" style={{ color: '#047857', fontFamily: 'Lato-Bold', fontSize: 10 }}>
        Save up to £{Math.round(amount)}
      </Text>
    </LinearGradient>
  )
}
