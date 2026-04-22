import React from 'react'
import { View, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { HelpCircle } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius } from '@/design-system/tokens'

const STEPS = [
  { number: '1', label: 'Tap Redeem', gradient: color.brandGradient as unknown as [string, string] },
  { number: '2', label: 'Enter Branch PIN', gradient: color.brandGradient as unknown as [string, string] },
  { number: '3', label: 'Show Your Code', gradient: color.brandGradient as unknown as [string, string] },
  { number: '4', label: 'Enjoy Your Deal!', gradient: ['#16A34A', '#22C55E'] as [string, string] },
]

export function HowItWorks() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <HelpCircle size={18} color={color.brandRose} />
        <Text variant="heading.sm" color="primary" style={{ fontWeight: '800' }}>How It Works</Text>
      </View>
      <View style={styles.timeline}>
        {STEPS.map((step, i) => (
          <View key={i} style={styles.step}>
            {i < STEPS.length - 1 && <View style={styles.connector} />}
            <LinearGradient colors={step.gradient} style={styles.stepNumber}>
              <Text variant="label.lg" color="inverse" style={{ fontWeight: '800' }}>{step.number}</Text>
            </LinearGradient>
            <Text variant="body.sm" color="primary" style={{ fontWeight: '600' }}>{step.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginHorizontal: 14, marginTop: spacing[5], marginBottom: spacing[8] },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: spacing[4] },
  timeline: { gap: 0 },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[2],
    position: 'relative',
  },
  connector: {
    position: 'absolute',
    left: 17,
    top: 38,
    width: 2,
    height: 24,
    backgroundColor: color.border.default,
  },
  stepNumber: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
