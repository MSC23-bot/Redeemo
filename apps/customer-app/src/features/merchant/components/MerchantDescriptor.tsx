import React from 'react'
import { Text } from '@/design-system/Text'
import { StyleSheet } from 'react-native'

type Props = {
  descriptor: string | null
}

export function MerchantDescriptor({ descriptor }: Props) {
  if (!descriptor) return null
  return (
    <Text variant="body.sm" color="secondary" style={styles.text}>{descriptor}</Text>
  )
}

const styles = StyleSheet.create({
  // Round 4 §1: slightly larger (13 → 14) per user direction "scale
  // up in the right ratio of everything else". Stays a half-step
  // below the merchant name (26pt) and the branch line (17pt) so the
  // hierarchy reads name → branch → descriptor → meta row.
  text: { fontSize: 14, fontWeight: '500' },
})
