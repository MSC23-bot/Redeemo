import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Info } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import type { VoucherType } from '@/lib/api/voucher'
import {
  VOUCHER_TYPE_EXPLAINER_TITLE,
  voucherTypeExplainer,
} from '../constants/productCopy'

const NAVY     = '#010C35'
const TEXT_2ND = '#4B5563'

type Props = {
  /**
   * Voucher type — drives the explainer copy via
   * `voucherTypeExplainer(type)`. The card is intentionally
   * type-driven, NOT merchant-description-driven: the
   * merchant-authored `voucher.description` already lives in the
   * CouponHeader teaser. This card educates first-time customers on
   * what THIS TYPE of voucher (BOGO, FREEBIE, etc.) means in
   * general, so they understand the offer category before tapping
   * Redeem.
   */
  type: VoucherType
}

/**
 * "What this voucher means" — voucher-type explainer card. Locked
 * 2026-05-07 from device QA — first-time customers need to
 * understand what e.g. a BOGO voucher is BEFORE they commit to
 * redeeming. The merchant's specific offer text stays in the hero
 * teaser; this card carries the type-level education.
 *
 * Title is constant ("What this voucher means"); body comes from
 * `voucherTypeExplainer(type)`. See `productCopy.ts` for the
 * canonical per-type strings + REUSABLE wording note.
 *
 * Card surface mirrors HowItWorks / CycleRulesCard — same shadow
 * weight, same warm-white background, same icon-pill heading. (See
 * §R3 in the deferred-followups index for the future
 * `<InfoCard>` extraction.)
 */
export function VoucherTypeExplainerCard({ type }: Props) {
  const body = voucherTypeExplainer(type)

  return (
    <View
      style={styles.card}
      testID="voucher-type-explainer"
      accessibilityLabel={`${VOUCHER_TYPE_EXPLAINER_TITLE}. ${body}`}
    >
      <View style={styles.heading}>
        <View style={styles.headingIconWrap} pointerEvents="none">
          <Info size={18} color={color.brandRose} strokeWidth={2.2} />
        </View>
        <Text variant="label.md" style={styles.title}>
          {VOUCHER_TYPE_EXPLAINER_TITLE}
        </Text>
      </View>

      <View style={styles.divider} pointerEvents="none" />

      <Text variant="body.md" style={styles.body} testID="voucher-type-explainer-body">
        {body}
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
