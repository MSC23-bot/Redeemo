import React from 'react'
import { View, StyleSheet } from 'react-native'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { Text } from '@/design-system/Text'
import { spacing, radius, color as tokenColor } from '@/design-system/tokens'
import { voucherTypeLabel } from '@/features/voucher/utils/voucherTheme'
import { isPresentationActive } from '@/features/voucher/utils/presentationWindow'
import { branchShortName } from '@/features/merchant/utils/branchShortName'
import type { SavingsRedemption } from '@/lib/api/savings'

// §Savings Rebaseline (PR-B, Revision 2) — Redemption history row.
//
// Three locked adaptations vs the Revision-1 reference branch:
//   1. Show-to-staff badge window: 24h → 2h.  Uses the SHARED
//      `isPresentationActive()` helper from
//      `@/features/voucher/utils/presentationWindow` so the Savings
//      badge and the Voucher Detail show-to-staff CTA never disagree
//      at the boundary (semantics: `now - redeemedAt < 2h` —
//      STRICT less-than).  §AE5 lock.
//   2. Voucher type label: inline map → canonical `voucherTypeLabel`
//      from `@/features/voucher/utils/voucherTheme`. Covers all
//      current types including TIME_LIMITED + REUSABLE; renders
//      "Buy one, get one free" (NOT "BOGO") so users aren't confused
//      by acronyms.
//   3. Meta lines: two-line layout.  Line 1 = full voucher-type
//      label (often long, e.g. "Buy one, get one free"); line 2 =
//      branchShortName · relative time.  Multi-branch merchants stay
//      distinguishable AND long type labels stop truncating the
//      branch.
//
// Validated badge stays 24h (celebration of a completed action, not
// an in-progress affordance).
//
// Design-fidelity: row is a white card surface with a 1px hairline
// border and 12px radius — matches the brainstorm `savings-design.html`
// visual treatment.  All colour values pull from `@/design-system/tokens`
// where an exact token exists; two badge backgrounds (amber / mint)
// have no exact token yet and are documented inline as intentional
// local hex.

const VALIDATED_WINDOW_MS = 24 * 60 * 60 * 1000

type BadgeType = 'show-to-staff' | 'validated' | 'plain'

function getBadgeType(redemption: SavingsRedemption, now: number = Date.now()): BadgeType {
  // Shared boundary semantics with Voucher Detail's
  // `isPresentationActive` helper — keep them in lockstep at the
  // 2-hour boundary.  The customer must never see "Show to staff"
  // here if the destination has already hidden the live code surface.
  if (!redemption.isValidated && isPresentationActive(redemption.redeemedAt, now)) {
    return 'show-to-staff'
  }
  if (redemption.isValidated && redemption.validatedAt) {
    const validated = new Date(redemption.validatedAt).getTime()
    if (now - validated <= VALIDATED_WINDOW_MS) return 'validated'
  }
  return 'plain'
}

function relativeTime(dateStr: string, now: number = Date.now()): string {
  const diff = now - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

type Props = {
  redemption: SavingsRedemption
  onPress: (voucherId: string) => void
}

export function RedemptionRow({ redemption, onPress }: Props) {
  const badge = getBadgeType(redemption)
  const vtLabel = voucherTypeLabel(redemption.voucher.voucherType)
  const branchShort = branchShortName(redemption.branch.name)
  const relTime = relativeTime(redemption.redeemedAt)

  // §Savings device-QA round-2 fixup 2026-05-18 — append " voucher"
  // to the type label per owner direction.  Reads as a noun phrase:
  // "Reusable voucher", "Buy one, get one free voucher", "Time
  // limited voucher".  The savings-history surface treats every row
  // as a redeemed voucher event, so the noun belongs on the label.
  const vtLabelAsNoun = `${vtLabel} voucher`
  const voucherTitle = redemption.voucher.title

  const logoColor =
    tokenColor.voucher?.byType?.[redemption.voucher.voucherType as keyof typeof tokenColor.voucher.byType] ??
    tokenColor.brandRose

  const a11yLabel =
    `${redemption.merchant.businessName}, ${voucherTitle}, ${vtLabelAsNoun}, ${branchShort}, £${redemption.estimatedSaving.toFixed(2)} saved, ${relTime}`

  // §Savings device-QA fixup 2026-05-18 — PressableScale inner-flex bug.
  //
  // PressableScale wraps its children in `<Animated.View><Pressable>
  // {children}</Pressable></Animated.View>`.  The outer `style` prop
  // lands on the Animated.View, NOT on the inner Pressable which
  // actually contains the children.  Pressable defaults to
  // flexDirection:'column', so children stack vertically — which is
  // what shipped on real device QA (logo on top, merchant name
  // below, meta below that, amount + badge BENEATH the content
  // instead of right-aligned).
  //
  // Fix: split the row into TWO levels.  PressableScale carries the
  // surface (bg, border, radius); an INNER `<View>` carries the
  // flex-row layout (flexDirection, gap, alignItems).  Now the
  // children align horizontally as intended.
  return (
    <PressableScale
      onPress={() => onPress(redemption.voucher.id)}
      accessibilityLabel={a11yLabel}
      accessibilityRole="button"
      style={styles.rowSurface}
      testID={`savings-redemption-row-${redemption.id}`}
    >
      <View style={styles.rowInner}>
        <View style={[styles.logo, { backgroundColor: `${logoColor}18` }]}>
          <Text style={[styles.logoInitial, { color: logoColor }]}>
            {redemption.merchant.businessName.charAt(0)}
          </Text>
        </View>

        {/* §Savings device-QA round-2 fixup 2026-05-18 — three-line
            content stack per owner direction:
              Line 1  Merchant name (the WHO)
              Line 2  Voucher title (the WHAT — what offer was used)
              Line 3  Type-as-noun · branch · time (the META)
            Adding the voucher title was the load-bearing change —
            previously the user couldn't tell what offer each row
            represented, only the merchant + type. */}
        <View style={styles.content}>
          <Text variant="body.sm" style={styles.merchantName} numberOfLines={1}>
            {redemption.merchant.businessName}
          </Text>
          <Text variant="body.sm" style={styles.voucherTitle} numberOfLines={1}>
            {voucherTitle}
          </Text>
          <Text variant="body.sm" style={styles.meta} numberOfLines={2}>
            {vtLabelAsNoun} · {branchShort} · {relTime}
          </Text>
        </View>

        <View style={styles.right}>
          <Text style={styles.saving}>+£{redemption.estimatedSaving.toFixed(2)}</Text>
          {badge === 'show-to-staff' && (
            <View style={styles.badgeAmber} testID="savings-row-badge-show-to-staff">
              <Text style={styles.badgeAmberText}>Show to staff</Text>
            </View>
          )}
          {badge === 'validated' && (
            <View style={styles.badgeGreen} testID="savings-row-badge-validated">
              <Text style={styles.badgeGreenText}>Validated ✓</Text>
            </View>
          )}
          {badge === 'plain' && (
            <Text style={styles.plainBadge} testID="savings-row-badge-plain">Redeemed</Text>
          )}
        </View>
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  // §Savings fidelity fixup-3 2026-05-17 — row layout hardened to
  // enforce horizontal alignment even on narrow phones.  Symptom in
  // device QA: the right column (saving + badge) appeared centered
  // BELOW the content rather than to its right.  Root cause: the
  // content View had `flex: 1` but no `minWidth: 0`, so a long meta
  // string could push the row to overflow + react-native's default
  // wrap-on-overflow drops siblings to the next line.  Fix:
  //   - explicit `flexWrap: 'nowrap'` on row
  //   - `flexShrink: 0` on logo + right (never shrink, always stay
  //     in place)
  //   - `flex: 1 + flexShrink: 1 + minWidth: 0` on content (allow
  //     truncation rather than overflow-wrap)
  // §Savings device-QA fixup 2026-05-18 — split into surface + inner.
  // rowSurface: card chrome (bg, border, radius, padding).  Lands on
  // PressableScale's outer Animated.View.
  // rowInner: flex-row layout (children align horizontally).  Lands
  // INSIDE the Pressable so children honour the row direction.
  // §Savings device-QA round-3 fixup 2026-05-18 — spacing pass on
  // 3-line rows.  Padding bumped vertical (more card breath); inner
  // flex switched from `center` to `flex-start` so logo + content +
  // amount column all anchor to the merchant-name line at the top,
  // matching the brainstorm receipt aesthetic.  Inter-line gap
  // inside the content stack bumped 1 → 2 for more breath between
  // merchant / voucher-title / meta lines.
  rowSurface: {
    backgroundColor: tokenColor.surface.raised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: tokenColor.border.subtle,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  rowInner: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  logo: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logoInitial: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 18,
  },
  content: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    gap: 2,
  },
  merchantName: {
    fontFamily: 'Lato-Bold',
    fontSize: 14,
    color: tokenColor.text.primary,
  },
  // §Savings device-QA round-2 fixup 2026-05-18 — voucher-title
  // line.  Sits between the merchant name (bold) and the meta line
  // (tertiary).  Medium-weight navy at 13pt so it reads as the
  // offer name without competing with the merchant identity above.
  voucherTitle: {
    fontFamily: 'Lato-Medium',
    fontSize: 13,
    color: tokenColor.text.secondary,
  },
  meta: {
    fontSize: 11,
    color: tokenColor.text.tertiary,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  // 16 → 18pt to match brainstorm "Top Places" saving size.
  saving: {
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 18,
    color: tokenColor.savingsGreen,
    fontVariant: ['tabular-nums'],
  },
  // Intentional local hex: no exact amber-50 token in `tokens.ts`.
  // Brand-rose / brand-coral don't fit (badge is informational, not
  // CTA-grade).  Promote to a token if Savings ships further amber
  // surfaces.
  badgeAmber: {
    backgroundColor: '#FEF3C7',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  badgeAmberText: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 9,
    color: tokenColor.warning,
  },
  // Intentional local hex: no exact mint-50 token.  Paired with
  // `tokenColor.savingsGreen` foreground.
  badgeGreen: {
    backgroundColor: '#DCFCE7',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  badgeGreenText: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 9,
    color: tokenColor.savingsGreen,
  },
  plainBadge: {
    fontFamily: 'Lato-Regular',
    fontSize: 11,
    color: tokenColor.text.tertiary,
  },
})
