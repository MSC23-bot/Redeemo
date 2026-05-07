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
   *   - the default expanded state (free starts expanded; subscribed
   *     starts collapsed since they likely already know the flow).
   * Both states are tappable — the card affordance is consistent.
   */
  isSubscribed: boolean
}

/**
 * Voucher Detail "How It Works" — vertical timeline explainer
 * presented as a tappable card. Card surface, header always tappable
 * with a chevron, expands to reveal the 5-step list.
 *
 * Round 19 (impeccable redesign): wrapped the entire section in a
 * card affordance per owner direction. Both subscription states now
 * share the SAME card treatment + tappable header + chevron — only
 * the default expanded state differs:
 *   • Free users start EXPANDED (still learning the platform; the
 *     section supports conversion).
 *   • Subscribed users start COLLAPSED (likely already know the
 *     flow; collapsing reduces noise on repeat visits).
 *
 * Both states can toggle. The chevron + visible card surface are
 * the affordances; no extra "Tap to expand" hint text needed.
 *
 * Card visual hierarchy: the shadow is intentionally LIGHTER than the
 * body card above (opacity 0.04 vs 0.18) so this reads as tertiary
 * "process explanation" rather than competing with the voucher's
 * primary content (terms + fair use).
 */
export function HowItWorks({ isSubscribed }: Props) {
  const steps = isSubscribed ? HOW_IT_WORKS_STEPS_SUBSCRIBED : HOW_IT_WORKS_STEPS_FREE

  // Free users start expanded; subscribed users start collapsed.
  const [expanded, setExpanded] = useState(!isSubscribed)

  return (
    <View
      style={styles.card}
      testID="how-it-works"
      accessibilityLabel={`How redemption works (${steps.length} steps)`}
    >
      <Pressable
        onPress={() => {
          lightHaptic()
          setExpanded((prev) => !prev)
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={
          expanded ? 'Collapse How redemption works' : 'Expand How redemption works'
        }
        style={({ pressed }) => [styles.heading, pressed && styles.headingPressed]}
        testID="how-it-works-toggle"
        hitSlop={8}
      >
        <View style={styles.headingIconWrap} pointerEvents="none">
          <HelpCircle size={18} color={color.brandRose} strokeWidth={2.2} />
        </View>
        <Text variant="label.md" style={styles.title}>How redemption works</Text>
        <View style={styles.headingSpacer} />
        {expanded ? (
          <ChevronUp size={20} color={TEXT_2ND} strokeWidth={2.4} />
        ) : (
          <ChevronDown size={20} color={TEXT_2ND} strokeWidth={2.4} />
        )}
      </Pressable>

      {expanded ? (
        <>
          <View style={styles.divider} pointerEvents="none" />

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
        </>
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
  // ── Card surface ─────────────────────────────────────────────
  card: {
    marginHorizontal: 22,
    marginTop: 32,
    backgroundColor: '#FDFBF8',  // tinted warm white in brand H≈30 family
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    paddingHorizontal: 18,
    paddingVertical: 14,
    // Lighter shadow than the voucher body card above so this reads
    // as tertiary process content, not competing with primary policy.
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  // ── Tappable heading ────────────────────────────────────────
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 4,
  },
  headingPressed: {
    opacity: 0.6,
  },
  headingIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: 'rgba(226,12,4,0.08)',  // brand-rose tint, 8% alpha
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: NAVY,
    letterSpacing: -0.1,
  },
  headingSpacer: {
    flex: 1,
  },
  // ── Divider between heading and steps ────────────────────────
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginTop: 14,
    marginBottom: 18,
  },
  // ── Steps timeline ──────────────────────────────────────────
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
