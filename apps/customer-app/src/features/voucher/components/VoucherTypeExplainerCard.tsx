import React, { useEffect, useRef, useState } from 'react'
import { Pressable, View, StyleSheet } from 'react-native'
import { ChevronDown, ChevronUp, Info } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import type { VoucherType } from '@/lib/api/voucher'
import {
  voucherTypeExplainerTitle,
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
  /**
   * Initial expanded state. Defaults to `false` — the card is
   * collapsed by default so the voucher detail page stays light;
   * the user taps the header to expand if they want the
   * type-level explanation. Locked 2026-05-08 from device QA.
   * Tests can override (e.g. to assert the body renders).
   */
  defaultExpanded?: boolean
  /**
   * Fires when the user expands the card (collapse-to-expand
   * transition only). The parent uses this to scroll the card into
   * view — collapsible cards on Voucher Detail otherwise expand
   * "underneath" the sticky CTA wrap, leaving the user to scroll
   * manually. `layoutY` is the card's y-position in its scroll
   * container's content coordinate space (from `onLayout`). Locked
   * 2026-05-08 from device QA.
   */
  onExpand?: (layoutY: number) => void
}

/**
 * "What is a <type> voucher?" — voucher-type explainer card.
 *
 * Locked 2026-05-07 from device QA — first-time customers need to
 * understand what e.g. a BOGO voucher is BEFORE they commit to
 * redeeming. The merchant's specific offer text stays in the hero
 * teaser; this card carries the type-level education.
 *
 * Title is per-type via `voucherTypeExplainerTitle(type)` (e.g.
 * "What is a buy one, get one free voucher?"); body comes from
 * `voucherTypeExplainer(type)`. See `productCopy.ts` for the
 * canonical per-type strings + REUSABLE wording note.
 *
 * Locked 2026-05-08: collapsible. Defaults to collapsed so the
 * voucher detail page stays light; tap the header to expand. Same
 * affordance pattern as `HowItWorks` (chevron, lightHaptic on
 * toggle, `accessibilityState.expanded`).
 *
 * Card surface mirrors HowItWorks / CycleRulesCard — same shadow
 * weight, same warm-white background, same icon-pill heading. (See
 * §R3 in the deferred-followups index for the future
 * `<InfoCard>` extraction.)
 */
export function VoucherTypeExplainerCard({ type, defaultExpanded = false, onExpand }: Props) {
  const title = voucherTypeExplainerTitle(type)
  const body  = voucherTypeExplainer(type)
  const [expanded, setExpanded] = useState(defaultExpanded)
  // Card's y-position in the parent scroll view's content coords.
  // Captured by onLayout; consumed by the post-expand effect below.
  const cardYRef = useRef<number>(0)

  // Fire `onExpand` on every collapse-to-expand transition (NOT on
  // the initial render even if defaultExpanded). One-frame defer so
  // the parent reads the up-to-date layout y.
  const prevExpandedRef = useRef(expanded)
  useEffect(() => {
    if (!expanded || prevExpandedRef.current === expanded || !onExpand) {
      prevExpandedRef.current = expanded
      return
    }
    prevExpandedRef.current = expanded
    const id = requestAnimationFrame(() => {
      onExpand(cardYRef.current)
    })
    return () => cancelAnimationFrame(id)
  }, [expanded, onExpand])

  return (
    <View
      style={styles.card}
      testID="voucher-type-explainer"
      accessibilityLabel={`${title}. ${body}`}
      onLayout={(e) => {
        cardYRef.current = e.nativeEvent.layout.y
      }}
    >
      <Pressable
        onPress={() => {
          lightHaptic()
          setExpanded((prev) => !prev)
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={
          expanded
            ? `Collapse ${title}`
            : `Expand ${title}`
        }
        style={({ pressed }) => [styles.heading, pressed && styles.headingPressed]}
        testID="voucher-type-explainer-toggle"
        hitSlop={8}
      >
        <View style={styles.headingIconWrap} pointerEvents="none">
          <Info size={18} color={color.brandRose} strokeWidth={2.2} />
        </View>
        <Text variant="label.md" style={styles.title} testID="voucher-type-explainer-title">
          {title}
        </Text>
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
          <Text variant="body.md" style={styles.body} testID="voucher-type-explainer-body">
            {body}
          </Text>
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 22,
    // 16pt standardised card-level gap (locked 2026-05-08 from
    // device QA) — uniform with CycleRulesCard / HowItWorks /
    // RedemptionDetailsCard wrapper / MerchantRow.
    marginTop: 16,
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
  headingPressed: {
    opacity: 0.6,
  },
  headingSpacer: {
    flex: 1,
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
