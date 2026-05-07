import React from 'react'
import { View, StyleSheet } from 'react-native'
import { RefreshCw } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'

const NAVY     = '#010C35'
const TEXT_2ND = '#4B5563'

type Props = {
  /**
   * `true` when the merchant has more than one active branch.
   *
   * 2026-05-08 update: the customer-facing copy is currently
   * branch-agnostic (same line for single- and multi-branch
   * merchants). The prop is kept on the API surface for forward
   * compat — branch-aware variants can be re-introduced if
   * specific multi-branch nuance is needed without a breaking
   * change to the orchestrator's call site.
   */
  isMultiBranch: boolean
  /**
   * ISO timestamp returned by `GET /api/v1/customer/vouchers/:id` as
   * `availableAgainAt`. Computed server-side from
   * `getCurrentCycleWindow(subscription.cycleAnchorDate, now).cycleEnd`
   * for ACTIVE/TRIALLING subscribers; null for free users / guests /
   * paused subscriptions. The orchestrator should not render this
   * card when null — that's a free-user flow which sees subscription
   * copy instead.
   */
  availableAgainAt: string | null
  /**
   * `true` when the user has already redeemed this voucher in the
   * current cycle. Drives the post-redemption "Available again on"
   * copy variant; pre-redemption shows "Renews on" instead.
   */
  isRedeemed: boolean
}

/**
 * Voucher Detail "Cycle rules" card — explains the one-redemption-
 * per-cycle rule and the renewal date. Locked 2026-05-07 from device
 * QA — pre-PR there was no surface explaining the rule before
 * redemption, so customers tapping Change-Branch in
 * `redeemed-this-cycle` state had no warning that the rule was
 * branch-independent.
 *
 * The merchant-wide vs branch-attributed split is owner-locked
 * product semantics:
 *   • voucher is merchant-level (defined merchant-wide)
 *   • redemption is branch-attributed (which branch consumed it)
 *   • cycle quota is merchant-wide per voucher (across all branches)
 * This card surfaces that to the customer.
 *
 * Visual hierarchy mirrors HowItWorks / VoucherTypeExplainerCard —
 * same shadow weight, warm-white background, icon-pill heading.
 * The body is two short paragraphs:
 *   • the rule (multi-branch-aware)
 *   • the renewal date (Renews / Available again, depending on
 *     `isRedeemed`)
 */
export function CycleRulesCard({ isMultiBranch, availableAgainAt, isRedeemed }: Props) {
  // Hide the card entirely when there's no cycle context to show.
  // Free users / guests / non-active subscriptions see subscription
  // copy elsewhere; this card is for subscribed users only.
  if (!availableAgainAt) return null

  // State-aware copy (locked 2026-05-08 from device QA):
  //   • Non-redeemed (pre-redemption guidance) — explains the rule
  //     before the user redeems. Multi-branch variant calls out the
  //     branch-shared invariant. The renewal date answers "if I use
  //     it now, when can I use it again?"
  //   • Redeemed (post-redemption acknowledgement) — warmer, more
  //     direct, branch-AGNOSTIC. The same line works for both
  //     single- and multi-branch merchants because "you've used this
  //     voucher" implicitly covers the branch-shared invariant
  //     without re-litigating it. Avoids the colder "has already
  //     been redeemed" phrasing.
  // Non-redeemed copy is intentionally branch-agnostic for now
  // (locked 2026-05-08 from device QA). Same line for single- and
  // multi-branch merchants — keeps the message helpful and concise.
  // Branch-aware variants can be re-introduced later if specific
  // multi-branch nuance is needed.
  const ruleCopy = isRedeemed
    ? "You’ve used this voucher for your current cycle. It will be ready to use again on the renewal date shown below."
    : "Use this voucher once during your current cycle. After you redeem it, it will refresh on the renewal date shown below."

  const dateLabel = isRedeemed ? 'Available again on' : 'Renews on'
  const formattedDate = formatCycleDate(availableAgainAt)

  return (
    <View
      style={styles.card}
      testID="cycle-rules"
      accessibilityLabel={`Cycle rules. ${ruleCopy} ${dateLabel} ${formattedDate}.`}
    >
      <View style={styles.heading}>
        <View style={styles.headingIconWrap} pointerEvents="none">
          <RefreshCw size={18} color={color.brandRose} strokeWidth={2.2} />
        </View>
        <Text variant="label.md" style={styles.title}>
          Voucher cycle
        </Text>
      </View>

      <View style={styles.divider} pointerEvents="none" />

      <Text variant="body.md" style={styles.ruleText} testID="cycle-rules-rule">
        {ruleCopy}
      </Text>

      {/* Renewal date block (locked 2026-05-08 from device QA). The
          date is the most-asked question on this card, so it gets
          its own surface — bigger, bolder, on a tinted background —
          rather than sitting as inline body text alongside the
          label. The label sits above as a small uppercase eyebrow. */}
      <View style={styles.dateBlock} testID="cycle-rules-date">
        <Text variant="label.md" style={styles.dateLabel}>{dateLabel.toUpperCase()}</Text>
        <Text variant="heading.sm" style={styles.dateValue} testID="cycle-rules-date-value">
          {formattedDate}
        </Text>
      </View>
    </View>
  )
}

/**
 * Format an ISO timestamp as "Wednesday 4 June" — friendly UK style,
 * no ISO-y digits, no year. Returns the raw ISO if formatting fails
 * for any reason (defensive — never crash the card on a malformed
 * date).
 */
function formatCycleDate(iso: string): string {
  try {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return iso
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day:     'numeric',
      month:   'long',
      timeZone: 'Europe/London',
    }).format(date)
  } catch {
    return iso
  }
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 22,
    // 16pt is the standardised card-level gap on the voucher detail
    // page (locked 2026-05-08 from device QA — applied uniformly to
    // RedemptionDetailsCard wrapper, CycleRulesCard, VoucherTypeExplainerCard,
    // HowItWorks, and MerchantRow). Older 32pt was uneven with the
    // other cards above the merchant row.
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
  ruleText: {
    fontSize: 14,
    lineHeight: 22,
    color: TEXT_2ND,
    marginBottom: 12,
  },
  dateBlock: {
    backgroundColor: 'rgba(226,12,4,0.06)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dateLabel: {
    fontSize: 10,
    color: '#7C2A23',
    letterSpacing: 1.2,
    fontWeight: '800',
    marginBottom: 2,
  },
  dateValue: {
    fontSize: 18,
    fontWeight: '800',
    color: NAVY,
    letterSpacing: -0.2,
  },
})
