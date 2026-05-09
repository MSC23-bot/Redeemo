import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Star } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, radius, spacing } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

type Props = {
  onPress: () => void
}

// Secondary navy gradient — mirrors the navy gradient used by the
// merchant-profile ActionRow Contact button AND SuccessPopup's
// Rate & Review pill (locked PR direction 2026-05-09 §B visual
// consistency).  Switched from the earlier brand-rose outlined
// pill so both verified-review entry points share one secondary-
// action identity.
const NAVY_GRADIENT = ['#010C35', '#1F2A55'] as const

/**
 * ReviewPromptCard — second entry point into the verified-review
 * flow (PR-C T16, locked 2026-05-09 owner direction).
 *
 * Mounts on Voucher Detail in the redeemed-this-cycle state,
 * immediately AFTER RedemptionDetailsCard.  The card's job is to
 * give a returning user — who has dismissed SuccessPopup — an
 * obvious, encouraging path back into the verified-review flow
 * for the redeemed branch.  SuccessPopup carries the same
 * affordance for the just-redeemed moment; this surface picks up
 * the slack on subsequent visits during the active cycle.
 *
 * Visual hierarchy (owner-locked, refined T16 wave 3):
 *   - SECONDARY to the staff-handoff / code actions on
 *     RedemptionDetailsCard above.  Cream-tinted card surface, 1px
 *     hairline border — quiet container that doesn't compete.
 *   - Heading + body lift the framing from "leave a review" (admin
 *     task) to "share your experience" (positive contribution).
 *   - Filled NAVY GRADIENT pill matches SuccessPopup's Rate & Review
 *     treatment verbatim so the affordance reads as the same action
 *     across both entry points (Star + label, white-on-navy, ≥44pt
 *     tap target via paddingVertical 12 + body.md lineHeight 24 =
 *     48pt).  Reads clearly tappable (gradient fill confirms
 *     actionable, not disabled) while staying subordinate to the
 *     warm brand-gradient primary CTAs elsewhere on the page.
 *
 * Visibility + routing live on the parent (VoucherDetailScreen) —
 * this component is purely presentational.  Parent gates on
 * stateKey === 'redeemed-this-cycle' && branchId-available, and
 * builds the verified-review URL contract.
 */
export function ReviewPromptCard({ onPress }: Props) {
  return (
    <View style={styles.card} testID="voucher-detail-review-prompt">
      <Text variant="heading.sm" style={styles.heading}>
        Share your experience
      </Text>
      <Text variant="body.sm" style={styles.body}>
        Your review helps others choose this branch.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Rate and Review"
        testID="voucher-detail-review-prompt-cta"
        onPress={() => { lightHaptic(); onPress() }}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
      >
        <LinearGradient
          colors={NAVY_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <Star size={16} color={color.onBrand} strokeWidth={2.4} />
        <Text variant="body.md" style={styles.ctaText}>
          Rate & Review
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  // Cream-tinted secondary surface — warm-but-quiet so it sits as
  // a calm sibling to RedemptionDetailsCard above (which carries
  // the primary staff-handoff weight via its brand-rose shadow on
  // the "Open staff view" CTA).  Same 20pt corner radius + 1px
  // hairline border as RedemptionDetailsCard for visual harmony.
  card: {
    backgroundColor: color.cream,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    padding: spacing[5],
    gap: spacing[2],
  },
  heading: {
    fontWeight: '700',
    color: color.text.primary,
    letterSpacing: -0.2,
  },
  body: {
    color: color.text.secondary,
    marginBottom: spacing[2],
  },
  // Filled navy gradient pill — verbatim treatment from
  // SuccessPopup's rateReviewPill (T16 wave 3, locked 2026-05-09
  // §B visual consistency).  alignSelf flex-start so the pill hugs
  // its content rather than stretching to the card width.
  // overflow:hidden so the LinearGradient (absolute-fill) stays
  // inside the rounded corners.  Tap target: paddingVertical 12 +
  // body.md lineHeight 24 = 48pt total (clears HIG 44pt minimum).
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: color.navy,
    shadowOpacity: 0.20,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  ctaText: {
    color: color.onBrand,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  ctaPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
})
