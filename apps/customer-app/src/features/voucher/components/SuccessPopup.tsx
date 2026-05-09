import React, { useEffect } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Check, Eye } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, radius, spacing } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import type { VoucherType } from '@/lib/api/redemption'

type Props = {
  visible: boolean
  /**
   * ISO string used by the receipt "Redeemed on" row.  The redemption
   * code itself is NOT rendered on this surface (locked 2026-05-09
   * §0.9 — popup is no longer a sensitive code surface; the code
   * lives on ShowToStaff + RedemptionDetailsCard).
   */
  redeemedAt: string
  /**
   * RedeemResponse.estimatedSaving — drives the "You saved £X.XX"
   * callout.  Suppressed when value <= 0 (D9).  Hardcoded GBP
   * (D10).
   */
  estimatedSaving: number
  voucherTitle: string
  voucherType: VoucherType
  merchantName: string
  branchName: string | null
  /**
   * Primary CTA — "View voucher code" (D11 / §0.10).  Opens the
   * dedicated Show-to-Staff screen where the live, anti-fraud-
   * protected code surface lives.
   */
  onShowToStaff: () => void
  /** "Done" — caller closes the popup; voucher detail re-renders state-3. */
  onDone: () => void
}

const TYPE_LABELS: Record<VoucherType, string> = {
  BOGO:             'BOGO',
  DISCOUNT_FIXED:   'Discount',
  DISCOUNT_PERCENT: 'Discount',
  FREEBIE:          'Freebie',
  SPEND_AND_SAVE:   'Spend & Save',
  PACKAGE_DEAL:     'Package',
  TIME_LIMITED:     'Time-Limited',
  REUSABLE:         'Reusable',
}

// en-GB / Europe/London formatter for the "Redeemed on" receipt row.
// Hermes-CLDR-robust pattern — see `reference_london_clock_helper.md`
// in memory.  No seconds — the receipt value is a permanent record.
const REDEEMED_AT_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  day:    '2-digit',
  month:  'short',
  year:   'numeric',
  hour:   '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatRedeemedAtLine(iso: string): string {
  // Receipt-detail tone: "08 May 2026, 14:24".
  return REDEEMED_AT_FORMATTER.format(new Date(iso))
}

/**
 * SuccessPopup — Voucher redemption confirmation (REVISED PR-A
 * locked 2026-05-09 §0.9 + §0.10 + §0.11).
 *
 * Product direction shift mid-PR-A:  the popup is no longer a
 * sensitive code surface.  The redemption code, live ticking
 * timestamp, anti-fraud disclosure copy, AND the
 * `useScreenCaptureProtection` hook were all REMOVED.  The code
 * lives on the dedicated `<ShowToStaff>` screen (live signals,
 * screen-capture protection, screenshot guard) and on the
 * persisted `<RedemptionDetailsCard>` during the 2-hour
 * presentation window.  Three-surface duplication resolved.
 *
 * Why: §AB / §AE5 / §AE6 anti-fraud architecture rests on the
 * LIVE Show-to-Staff screen as the trust signal.  A static popup
 * with the code creates a screenshot-friendly bypass surface;
 * removing the code closes that gap.  See plan §0.9 for the
 * decision rationale.
 *
 * Design direction — COMMITTED colour on the voucher's own type
 * (Freebie emerald, BOGO purple, Discount rose, etc.).  The
 * success surface is THIS voucher's success surface, not a generic
 * confirmation modal.
 *
 * Layout (top → bottom, post-revision):
 *   1. Type-pastel accent row — gradient bg, animated check ring +
 *      title "Voucher redeemed successfully" (D16).  No type chip
 *      and no eyebrow text — gradient signals voucher type;
 *      title carries the success message.
 *   2. Voucher context — title + merchant strip.
 *   3. Saving callout — "You saved £X.XX" (suppressed when 0).
 *   4. Receipt details — "Redeemed on" + "Branch".
 *   5. Primary CTA — "View voucher code" (D11): opens the
 *      dedicated Show-to-Staff screen.
 *   6. Done CTA — flat dismiss text.
 *
 * Removed in revised PR-A scope (LOCKED 2026-05-09):
 *   • Code box (label + 4+4 code rendering)
 *   • Live ticking timestamp
 *   • Anti-fraud disclosure copy
 *   • `useScreenCaptureProtection(visible)` (D15)
 *   • Rate & Review CTA — hidden in PR-A; reintroduced in PR-C
 *     with verified-review backend wire-up (D12).
 *
 * Confetti / celebration motion remains deferred to PR-B (Tier 2
 * design pass).
 */
export function SuccessPopup({
  visible,
  redeemedAt,
  estimatedSaving,
  voucherTitle,
  voucherType,
  merchantName,
  branchName,
  onShowToStaff,
  onDone,
}: Props) {
  const scale = useSharedValue(0.8)
  const ty = useSharedValue(30)
  const checkScale = useSharedValue(0)

  useEffect(() => {
    if (visible) {
      // Wave 14 (locked 2026-05-09 from owner QA "too bouncy"):
      // replaced 3 springs with ease-out timing to remove the
      // bounce/oscillation. Mirrors the locked merchant-profile
      // subscribe-prompt pattern (320ms ease-out-expo, "springify
      // rejected as too bouncy" — see memory `project_merchant_
      // profile_ux_refinement_complete`). Result: snappy, settled
      // entrance with no overshoot.
      scale.value = withTiming(1, {
        duration: 320,
        easing:   Easing.out(Easing.exp),
      })
      ty.value = withTiming(0, {
        duration: 320,
        easing:   Easing.out(Easing.exp),
      })
      // Check ring uses ease-out-cubic for a snappy-but-settled
      // entrance. The previous spring had overshoot 10-15% which
      // owner flagged as too bouncy; cubic ease-out has zero
      // overshoot and reads as "confident" rather than "wobbly".
      checkScale.value = withDelay(
        200,
        withTiming(1, {
          duration: 240,
          easing:   Easing.out(Easing.cubic),
        }),
      )
    } else {
      scale.value = withTiming(0.8, { duration: 200, easing: Easing.in(Easing.quad) })
      ty.value = withTiming(30, { duration: 200, easing: Easing.in(Easing.quad) })
      checkScale.value = 0
    }
  }, [visible, scale, ty, checkScale])

  const popupStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: ty.value }],
  }))
  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }))

  const typeColor = color.voucher.byType[voucherType] ?? color.voucher.discount
  const typeGradient = color.voucher.gradientByType[voucherType]
    ?? color.voucher.gradientByType.DISCOUNT_FIXED

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onDone}>
      <View style={styles.scrim} testID="success-popup-scrim">
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel="Voucher redeemed successfully"
          style={[styles.popup, popupStyle]}
          testID="success-popup"
        >
          {/* Type-pastel accent row — gradient signals voucher type;
              animated check ring + title carry the success message.
              Type chip + "Redeemed" eyebrow removed (D16) — the title
              now reads as a clear success statement instead of a small
              uppercase eyebrow.  Title aria-hidden because the modal's
              accessibilityLabel already announces the same string. */}
          <View style={styles.accentRow}>
            <LinearGradient
              colors={typeGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFillObject}
            />
            <Animated.View
              style={[styles.checkRing, checkStyle]}
              testID="success-check-ring"
            >
              <Check size={14} color={color.onBrand} strokeWidth={3} />
            </Animated.View>
            <Text
              variant="heading.sm"
              style={[styles.accentTitle, { color: typeColor }]}
              numberOfLines={1}
              testID="success-title"
            >
              Voucher redeemed successfully
            </Text>
          </View>

          {/* Body — voucher context + code hero + receipt + CTAs */}
          <View style={styles.body}>
            {/* Voucher context — single compact strip (was a heavier
                card-on-card block in the previous design; flattened
                here so the code hero below dominates). */}
            <View style={styles.context}>
              <Text variant="heading.sm" style={styles.contextTitle} numberOfLines={2}>
                {voucherTitle}
              </Text>
              <Text variant="body.sm" style={styles.contextMerchant} numberOfLines={1}>
                {merchantName}
              </Text>
            </View>

            {/* Saving callout — A4 (PR-A shape brief §7).  Renders only
                when estimatedSaving > 0; hidden gracefully for REUSABLE
                or £0 vouchers (D9 locked).  Sits between the context
                strip and the code hero so the saving registers as
                confirmed value, NOT as the moment of the popup (the
                code is the visual hero, anti-fraud trust requirement
                from M3).  Tabular-nums alignment so amounts stay
                visually stable as they grow. */}
            {estimatedSaving > 0 ? (
              <View style={styles.savingCallout} testID="success-saving-callout">
                <Text
                  variant="label.lg"
                  style={styles.savingLabel}
                  accessibilityLabel={`You saved £${estimatedSaving.toFixed(2)}`}
                >
                  You saved
                </Text>
                <Text
                  variant="heading.md"
                  style={styles.savingAmount}
                  testID="success-saving-amount"
                >
                  £{estimatedSaving.toFixed(2)}
                </Text>
              </View>
            ) : null}

            {/* Code box + live timestamp + anti-fraud disclosure all
                REMOVED 2026-05-09 (§0.9).  This popup is no longer a
                sensitive code surface; the code lives on
                <ShowToStaff> + persisted <RedemptionDetailsCard>.
                See plan §0.9 for the rationale. */}

            {/* Receipt details — compact tabular rows confirming the
                redemption.  Branch hides when unknown (avoids the
                em-dash fallback which violated the no-em-dash rule). */}
            <View style={styles.infoRows}>
              <InfoRow
                label="Redeemed on"
                value={formatRedeemedAtLine(redeemedAt)}
                testID="success-redeemed-at"
              />
              <InfoRow label="Branch" value={branchName ?? '-'} />
            </View>

            {/* Primary CTA — "View voucher code" (D11 / §0.10).
                Solid voucher-type colour with type-tinted shadow.
                Opens the dedicated Show-to-Staff screen where the
                live, anti-fraud-protected code surface lives. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View voucher code"
              testID="success-show-to-staff"
              onPress={() => { lightHaptic(); onShowToStaff() }}
              style={({ pressed }) => [
                styles.primaryCta,
                {
                  backgroundColor: typeColor,
                  shadowColor:     typeColor,
                },
                pressed && styles.ctaPressed,
              ]}
            >
              <Eye size={18} color={color.onBrand} strokeWidth={2.4} />
              <Text variant="body.md" style={styles.primaryCtaText}>
                View voucher code
              </Text>
            </Pressable>

            {/* Secondary row — Done is the only tertiary action in
                PR-A.  Rate & Review hidden until PR-C lands the
                verified-review backend (D12 / §0.2). */}
            <View style={styles.secondaryRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Done"
                testID="success-done"
                onPress={() => { lightHaptic(); onDone() }}
                style={({ pressed }) => [
                  styles.tertiaryAction,
                  pressed && styles.tertiaryPressed,
                ]}
              >
                <Text variant="label.md" style={styles.tertiaryDoneText}>
                  Done
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

function InfoRow({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.infoRow} testID={testID}>
      <Text variant="label.lg" style={styles.infoLabel}>
        {label}
      </Text>
      <Text variant="label.lg" style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    // Slightly more saturated navy scrim than before (0.55 → 0.62)
    // so the popup sits more decisively above the page; keeps the
    // grounded brand-navy tone without becoming opaque.
    backgroundColor: 'rgba(1,12,53,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[5],
  },
  popup: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: color.surface.raised,
    // Tighter shadow than the previous 80/32/0.35 — that was
    // dramatising. PRODUCT.md: "the voucher IS the data; we don't
    // dramatise it." Keep it grounded.
    shadowColor: '#0B1F4D',
    shadowOpacity: 0.28,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 18 },
    elevation: 18,
  },
  // ── Type-pastel accent row ──
  // Replaces the previous brand-rose/coral gradient header. Voucher-
  // type pastel gradient gives the popup its identity colour. Kept
  // narrow (44px) so it reads as an accent, not a hero header — the
  // hero is now the code below.
  accentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 44,
  },
  checkRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: color.savingsGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // heading.sm (16 / 22) variant drives the success title.  flex: 1
  // claims the row width remaining after the check ring.  Type chip
  // and uppercase eyebrow are gone — gradient signals voucher type;
  // title carries the success message clearly (D16).
  accentTitle: {
    flex: 1,
    fontWeight: '700',
  },
  // ── Body ──
  body: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
    gap: spacing[3],
  },
  // ── Voucher context ──
  // Flat strip — no card-on-card. Title + merchant on stacked text
  // lines. Tight rhythm so it reads as context, not as a feature.
  context: {
    gap: 2,
  },
  // heading.sm (16 / 22) variant drives.  fontSize override removed
  // 2026-05-09 (PR-A §3.3 readability bump).
  contextTitle: {
    fontWeight: '700',
    color: color.text.primary,
    letterSpacing: -0.2,
  },
  // body.sm (14 / 21) variant drives.  fontSize override removed.
  contextMerchant: {
    color: color.text.secondary,
    fontWeight: '500',
  },
  // ── Saving callout (A4) ──
  // Sits between the context strip and the code hero.  Savings-green
  // tint (8% alpha) + 14% alpha border ring keeps definition subtle
  // so the code hero stays dominant.  Tabular-nums alignment for
  // amount stability.  Suppressed when estimatedSaving <= 0 (D9).
  savingCallout: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing[2],
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
    borderColor: 'rgba(22, 163, 74, 0.14)',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  // label.lg (14 / 18, ls 0.2) variant drives — small primary label.
  savingLabel: {
    color: color.savingsGreen,
    fontWeight: '500',
  },
  // heading.md (18 / 24) variant drives — readable, weighty without
  // dominating the 30pt code hero below.
  savingAmount: {
    color: color.savingsGreen,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  // (Code hero, code label, code value, live timestamp styles all
  // removed 2026-05-09 — the popup is no longer a sensitive code
  // surface.  The code lives on <ShowToStaff> + <RedemptionDetailsCard>.)

  // ── Receipt rows ──
  infoRows: {
    gap: 0,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing[2],
    borderTopColor: 'rgba(11,31,77,0.05)',
    borderTopWidth: 1,
  },
  // label.lg (14 / 18, ls 0.2) variant drives.  Bumped from label.md
  // 2026-05-09 (cross-surface consistency) — receipt rows still
  // read as eyebrow-y but legible alongside the bumped surrounding
  // typography.
  infoLabel: {
    color: color.text.tertiary,
    fontWeight: '500',
  },
  infoValue: {
    flex: 1,
    fontWeight: '700',
    color: color.text.primary,
    textAlign: 'right',
    marginLeft: spacing[3],
    fontVariant: ['tabular-nums'],
  },
  // (Disclosure style removed 2026-05-09 — the anti-fraud disclosure
  // line was tied to the code rendering on this surface.)

  // ── Primary CTA ──
  // Solid voucher-type colour. Background + shadow set inline so the
  // colour follows the active voucher's type. No gradient — that was
  // the SaaS reflex anti-reference.
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3] + 2,
    borderRadius: radius.lg,
    shadowOpacity: 0.30,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  // body.md (16 / 24) variant drives.  fontSize override removed
  // 2026-05-09 (PR-A §3.3 readability bump for primary action).
  primaryCtaText: {
    fontWeight: '800',
    color: color.onBrand,
    letterSpacing: 0.2,
  },
  // ── Tertiary action row ──
  // Flat dismiss text only.  Rate & Review removed for PR-A —
  // returns in PR-C with verified-review backend (D12).  The row
  // structure is preserved (centred, no separator) so PR-C can
  // restore the second action without restructuring.
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
    paddingTop: 2,
  },
  tertiaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  tertiaryPressed: {
    opacity: 0.85,
  },
  tertiaryDoneText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.text.secondary,
    letterSpacing: 0.2,
  },
  ctaPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
})
