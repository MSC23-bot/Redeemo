import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Star } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, radius, spacing } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

type Props = {
  onPress: () => void
}

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
 * Visual hierarchy (owner-locked):
 *   - SECONDARY to the staff-handoff / code actions on
 *     RedemptionDetailsCard above.  No brand-gradient fill, no
 *     coloured shadow — flat warm-cream surface with a subtle
 *     border.  Reads as a calm prompt, not a competing CTA.
 *   - Heading + body lift the framing from "leave a review" (admin
 *     task) to "share your experience" (positive contribution).
 *   - Outlined pill matches SuccessPopup's Rate & Review treatment
 *     verbatim so the affordance reads as the same action across
 *     both entry points (1px brand-rose 30% alpha border, brand-
 *     rose Star icon, body.md text, ≥44pt tap target).
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
        <Star size={16} color={color.brandRose} strokeWidth={2.4} />
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
  // Flat outlined pill — verbatim treatment from SuccessPopup's
  // rateReviewPill (T12).  Same brand-rose 30% alpha border + Star
  // glyph + body.md text + 44pt+ tap height (paddingVertical 11 +
  // body.md lineHeight 24 = 46pt).  alignSelf flex-start so the
  // pill hugs its content rather than stretching to the card width.
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing[2],
    paddingVertical: 11,
    paddingHorizontal: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(226, 12, 4, 0.30)',
    backgroundColor: 'transparent',
  },
  ctaText: {
    color: color.brandRose,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  ctaPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
})
