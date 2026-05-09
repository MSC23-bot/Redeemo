import React, { useEffect, useState } from 'react'
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native'
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
  /**
   * Merchant logo URL from `voucher.merchant.logoUrl`.  Renders a
   * 48×48 logo to the left of the voucher context strip (D23 §14 —
   * mirrors PIN sheet D5 verbatim).  Null URL or `<Image onError>`
   * collapses to text-only header.
   */
  merchantLogoUrl: string | null
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
  merchantLogoUrl,
  branchName,
  onShowToStaff,
  onDone,
}: Props) {
  const scale = useSharedValue(0.8)
  const ty = useSharedValue(30)
  const checkScale = useSharedValue(0)
  const [logoError, setLogoError] = useState(false)
  const showLogo = merchantLogoUrl !== null && !logoError

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
              variant="heading.md"
              style={styles.accentTitle}
              numberOfLines={2}
              testID="success-title"
            >
              Voucher redeemed successfully
            </Text>
          </View>

          {/* Body — voucher context + saving + receipt + CTAs */}
          <View style={styles.body}>
            {/* Voucher context — horizontal block with merchant logo
                (left, 48×48) + voucher title + merchant name (right,
                stacked).  Mirrors PIN sheet D5 layout exactly so the
                redemption journey reads with consistent identity
                anchoring across all surfaces.  Logo collapses to
                text-only on null URL or <Image onError>; the text
                column then claims the full body width. */}
            <View style={styles.contextRow}>
              {showLogo ? (
                <Image
                  testID="success-merchant-logo"
                  accessibilityLabel={`${merchantName} logo`}
                  source={{ uri: merchantLogoUrl ?? undefined }}
                  style={styles.merchantLogo}
                  onError={() => setLogoError(true)}
                />
              ) : null}
              <View style={styles.context}>
                <Text variant="heading.sm" style={styles.contextTitle} numberOfLines={2}>
                  {voucherTitle}
                </Text>
                <Text variant="body.sm" style={styles.contextMerchant} numberOfLines={1}>
                  {merchantName}
                </Text>
              </View>
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
                  variant="heading.lg"
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
  // Voucher-type pastel gradient gives the popup its identity colour.
  // D26 §14 (LOCKED 2026-05-09 owner direction): paddingVertical
  // 16 → 24 and minHeight 52 → 72 lift the row from a thin accent
  // strip into a hero band — owner: "appropriately positioned and
  // laid out", section bigger.  Text scale unchanged (still
  // heading.md 18); the hero feel comes from extra vertical
  // breathing space around content.
  accentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[6],
    minHeight: 72,
  },
  checkRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: color.savingsGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // heading.md (18 / 24) variant drives the success title (D18 §14
  // bumped from heading.sm so title equals the saving amount in
  // hierarchy).  flex: 1 claims the row width remaining after the
  // check ring.  numberOfLines={2} on the Text — title wraps to
  // two lines under Dynamic Type rather than truncating.
  // D25 §14 (LOCKED 2026-05-09 owner direction): title color is
  // neutral navy (color.text.primary) — NOT the voucher type
  // colour.  The gradient already carries type identity; the
  // green check ring carries the success signal; the title text
  // is the moment statement and should read consistently across
  // every voucher type.  PRODUCT.md tone: trust-first, grounded
  // navy reads as official / clear-text on every pastel gradient.
  accentTitle: {
    flex: 1,
    fontWeight: '700',
    color: color.text.primary,
  },
  // ── Body ──
  // D22 (LOCKED 2026-05-09 §14): gap 12 → 16; paddingTop 12 → 16.
  // Section breathing room scales for the simpler 3-block body.
  body: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
    gap: spacing[4],
  },
  // ── Voucher context (horizontal block: logo + text stack) ──
  // D23 (LOCKED 2026-05-09 §14): merchant logo 48×48 sits to the
  // left of the voucher title + merchant name.  Mirrors PIN sheet
  // D5 layout exactly so identity anchoring reads consistently
  // across the redemption journey.  Logo collapses to text-only
  // on null URL or <Image onError>.
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing[3],
  },
  // 48×48 merchant logo — identical specs to PinEntrySheet
  // (radius.md, 1px brand-rose 8% alpha ring, surface.tint
  // background).  Cross-surface consistency.
  merchantLogo: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(226, 12, 4, 0.08)',
    backgroundColor: color.surface.tint,
  },
  context: {
    flexShrink: 1,
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
  // heading.lg (20 / 26) variant drives — the value confirmation is
  // the popup's biggest non-title element so "you got this much
  // value" reads as the load-bearing trust signal (D20 §14 bumped
  // from heading.md).  No clip risk — variant lineHeight 26 covers
  // fontSize 20.
  savingAmount: {
    color: color.savingsGreen,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  // (Code hero, code label, code value, live timestamp styles all
  // removed 2026-05-09 — the popup is no longer a sensitive code
  // surface.  The code lives on <ShowToStaff> + <RedemptionDetailsCard>.)

  // ── Receipt rows ──
  // D21b (LOCKED 2026-05-09 §14): borderless flat rows — the
  // ticker-style top-border hairlines were paired visually with the
  // deleted code box; without that anchor they read as orphaned
  // ticker fragments.  Saving callout already carries the popup's
  // structured-card moment; receipt rows are quiet middle.
  infoRows: {
    gap: spacing[1],
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing[2],
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
  // D22 (LOCKED 2026-05-09 §14): paddingTop 2 → 12 so Done sits in
  // its own implied region and the popup ends with calm pacing,
  // not a primary→Done cram.
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
    paddingTop: spacing[3],
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
