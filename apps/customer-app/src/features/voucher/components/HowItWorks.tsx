import React from 'react'
import { View, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { HelpCircle } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { HOW_IT_WORKS_STEPS } from '../constants/productCopy'

const NAVY     = '#010C35'
const TEXT_2ND = '#4B5563'
const BORDER   = '#E8E2DC'

/**
 * Four-step vertical timeline explainer pinned beneath the merchant
 * card. Final step uses the green "enjoy" gradient (per v4 §vd-steps);
 * the first three use the brand red→coral gradient. A vertical line
 * connects the numbered boxes.
 */
export function HowItWorks() {
  return (
    <View style={styles.root} testID="how-it-works">
      <View style={styles.heading}>
        <HelpCircle size={18} color={color.brandRose} strokeWidth={2} />
        <Text variant="label.md" style={styles.title}>How It Works</Text>
      </View>

      <View style={styles.steps}>
        {/* Connector line — sits behind the numbered boxes */}
        <View style={styles.connector} pointerEvents="none" />

        {HOW_IT_WORKS_STEPS.map((step, i) => (
          <View key={i} style={[styles.step, i === HOW_IT_WORKS_STEPS.length - 1 && styles.stepLast]}>
            <StepNumber index={i} isLast={i === HOW_IT_WORKS_STEPS.length - 1} />
            <View style={styles.stepContent}>
              <Text variant="body.md" style={styles.stepLabel}>{step.label}</Text>
              <Text variant="body.sm" style={styles.stepDesc}>{step.desc}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

function StepNumber({ index, isLast }: { index: number; isLast: boolean }) {
  const colors: readonly [string, string] = isLast
    ? ['#16A34A', '#22C55E']
    : [color.brandRose, color.brandCoral]

  return (
    <View style={styles.numBox}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <Text variant="label.md" style={styles.numText}>{index + 1}</Text>
    </View>
  )
}

const NUM_BOX = 38
const NUM_GAP = 16

const styles = StyleSheet.create({
  root: {
    marginHorizontal: 22,
    marginTop: 24,
    paddingHorizontal: 4,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: NAVY,
  },
  steps: {
    position: 'relative',
  },
  connector: {
    position: 'absolute',
    left: NUM_BOX / 2 - 1,
    top: NUM_BOX / 2,
    bottom: NUM_BOX / 2,
    width: 2,
    backgroundColor: BORDER,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: NUM_GAP,
    paddingBottom: 22,
  },
  stepLast: {
    paddingBottom: 0,
  },
  numBox: {
    width: NUM_BOX,
    height: NUM_BOX,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.brandRose,
    shadowOpacity: 0.20,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  numText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  stepContent: {
    flex: 1,
    paddingTop: 5,
  },
  stepLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: NAVY,
    marginBottom: 3,
  },
  stepDesc: {
    fontSize: 13,
    lineHeight: 19,
    color: TEXT_2ND,
  },
})
