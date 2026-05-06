import React, { useState } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import {
  HOW_IT_WORKS_STEPS_FREE,
  HOW_IT_WORKS_STEPS_SUBSCRIBED,
} from '../constants/productCopy'

const NAVY     = '#010C35'
const TEXT_2ND = '#4B5563'
const BORDER   = '#E8E2DC'

type Props = {
  /**
   * Subscription state. Determines:
   *   - which step list renders (free 5-step vs subscribed 5-step)
   *   - whether the section is collapsible. Subscribed users get a
   *     collapsible section (default collapsed); free users see it
   *     expanded by default with no collapse affordance because the
   *     section supports their conversion path.
   */
  isSubscribed: boolean
}

/**
 * Voucher Detail "How It Works" — vertical timeline explainer pinned
 * beneath the merchant card. Final step uses the green "enjoy"
 * gradient; preceding steps use the brand red→coral gradient. A
 * vertical line connects the numbered boxes.
 *
 * Round 18 — display behaviour split:
 *   • Free users: section is ALWAYS expanded. No chevron, header is
 *     a plain View. Free users are still learning the platform and
 *     this section supports conversion (the "Subscribe to Unlock"
 *     step is the conversion gate inline with the redemption flow).
 *   • Subscribed users: section is COLLAPSIBLE, default COLLAPSED.
 *     The header is a button with a down/up chevron and toggles the
 *     5-step list. accessibilityState exposes expanded/collapsed.
 *
 * Round 17 (prior): both variants finalised at 5 steps, with steps
 * 2-5 shared between them.
 */
export function HowItWorks({ isSubscribed }: Props) {
  const steps = isSubscribed ? HOW_IT_WORKS_STEPS_SUBSCRIBED : HOW_IT_WORKS_STEPS_FREE

  // Free users: always expanded. Subscribed users: default collapsed,
  // toggle via header tap.
  const [expanded, setExpanded] = useState(!isSubscribed)
  const showSteps = !isSubscribed || expanded

  return (
    <View
      style={styles.root}
      testID="how-it-works"
      accessibilityLabel={`How It Works (${steps.length} steps)`}
    >
      {isSubscribed ? (
        <Pressable
          onPress={() => {
            lightHaptic()
            setExpanded((prev) => !prev)
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={
            expanded ? 'Collapse How It Works' : 'Expand How It Works'
          }
          style={({ pressed }) => [styles.heading, pressed && styles.headingPressed]}
          testID="how-it-works-toggle"
          hitSlop={8}
        >
          <HelpCircle size={18} color={color.brandRose} strokeWidth={2} />
          <Text variant="label.md" style={styles.title}>How It Works</Text>
          <View style={styles.headingSpacer} />
          {expanded ? (
            <ChevronUp size={20} color={TEXT_2ND} strokeWidth={2.4} />
          ) : (
            <ChevronDown size={20} color={TEXT_2ND} strokeWidth={2.4} />
          )}
        </Pressable>
      ) : (
        <View style={styles.heading}>
          <HelpCircle size={18} color={color.brandRose} strokeWidth={2} />
          <Text variant="label.md" style={styles.title}>How It Works</Text>
        </View>
      )}

      {showSteps ? (
        <View style={styles.steps} testID="how-it-works-steps">
          {/* Connector line — sits behind the numbered boxes */}
          <View style={styles.connector} pointerEvents="none" />

          {steps.map((step, i) => (
            <View key={i} style={[styles.step, i === steps.length - 1 && styles.stepLast]}>
              <StepNumber index={i} isLast={i === steps.length - 1} />
              <View style={styles.stepContent}>
                <Text variant="body.md" style={styles.stepLabel}>{step.label}</Text>
                <Text variant="body.sm" style={styles.stepDesc}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
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
    // Round-13: spacing rhythm = hierarchy. 32pt gap above to widen
    // the visual break between the merchant attribution unit and the
    // process explainer.
    marginTop: 32,
    paddingHorizontal: 4,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 20,
  },
  // When the heading is a Pressable (subscribed users), give it a
  // subtle press state.
  headingPressed: {
    opacity: 0.6,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: NAVY,
  },
  headingSpacer: {
    flex: 1,
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
