import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'

/**
 * Three-step explainer pinned beneath the coupon. Identical copy
 * across all merchants — explains the redeem-at-branch flow.
 */
export function HowItWorks() {
  return (
    <View style={styles.root} testID="how-it-works">
      <Text variant="label.md" style={styles.title}>How it works</Text>
      <Step n={1} text="Tap Redeem and enter the staff PIN." />
      <Step n={2} text="Show the QR code or 5-character code to staff." />
      <Step n={3} text="Staff confirms — your discount is applied." />
    </View>
  )
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.bullet}>
        <Text variant="label.md" style={styles.bulletText}>{n}</Text>
      </View>
      <Text variant="body.sm" style={styles.text}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginHorizontal: 16,
    borderRadius: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#6B7280',
    marginBottom: 4,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bullet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(226,12,4,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  bulletText: {
    fontSize: 12,
    fontWeight: '800',
    color: color.brandRose,
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: '#374151',
  },
})
