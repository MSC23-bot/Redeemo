import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Info } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'

const NAVY     = '#010C35'
const TEXT_2ND = '#4B5563'

type Props = {
  /**
   * Full merchant-authored description as returned by
   * `GET /api/v1/customer/vouchers/:id` (`voucher.description`).
   * Pass through verbatim — no truncation, no client-side rewriting.
   * The CouponHeader still shows a 3-line teaser; this card carries
   * the unabridged copy so customers can understand the offer
   * before redeeming.
   */
  description: string
}

/**
 * "About this offer" — full voucher description card. Sits between
 * MerchantRow and CycleRulesCard / HowItWorks in the Voucher Detail
 * orchestrator. Locked 2026-05-07 from device QA — the in-hero
 * description was capped at 3 lines with ellipsis, leaving
 * merchant-authored detail invisible to customers before they
 * committed to redeeming.
 *
 * Typography: 14pt body with 22pt line-height to keep long
 * paragraphs readable without forcing the hero to grow vertically.
 *
 * Card surface mirrors the HowItWorks shadow weight so it reads as
 * secondary "context" content, not competing with the voucher's
 * primary terms / fair-use lines (which live inside the coupon body
 * card above with stronger shadow).
 */
export function AboutThisOfferCard({ description }: Props) {
  // Defensive: an empty/whitespace-only description should not render
  // an empty card. The orchestrator already guards on
  // `voucher.description != null && voucher.description.trim().length > 0`,
  // but this component double-checks so callers can be sloppy.
  const trimmed = description.trim()
  if (trimmed.length === 0) return null

  return (
    <View
      style={styles.card}
      testID="about-this-offer"
      accessibilityLabel="About this offer"
    >
      <View style={styles.heading}>
        <View style={styles.headingIconWrap} pointerEvents="none">
          <Info size={18} color={color.brandRose} strokeWidth={2.2} />
        </View>
        <Text variant="label.md" style={styles.title}>About this offer</Text>
      </View>

      <View style={styles.divider} pointerEvents="none" />

      <Text variant="body.md" style={styles.body} testID="about-this-offer-body">
        {trimmed}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 22,
    marginTop: 32,
    backgroundColor: '#FDFBF8',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 2,
  },
  headingIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: 'rgba(226,12,4,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: NAVY,
    letterSpacing: -0.1,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginTop: 12,
    marginBottom: 14,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    color: TEXT_2ND,
  },
})
