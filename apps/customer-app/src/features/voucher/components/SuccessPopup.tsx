import React, { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Check, Eye, Star } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, opacity, radius, spacing } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import { formatRedemptionCode } from '../utils/formatRedemptionCode'
import { useScreenCaptureProtection } from '../hooks/useScreenCaptureProtection'
import type { VoucherType } from '@/lib/api/redemption'

type Props = {
  visible: boolean
  /** The successful RedeemResponse from useRedeem. null when popup hidden. */
  redemptionCode: string
  redeemedAt: string  // ISO string
  /**
   * RedeemResponse.estimatedSaving — already on the wire (see
   * apps/customer-app/src/lib/api/redemption.ts:43).  Renders the
   * "You saved £X.XX" callout between the voucher context strip and
   * the code hero.  Suppressed when value <= 0 (graceful no-op for
   * REUSABLE / £0 vouchers).  Hardcoded GBP formatting per the
   * shape brief (D10) — locale-aware deferred to a future i18n
   * workstream because Hermes-CLDR currency formatting is fragile
   * (cross-ref deferred-followups §AG2).
   */
  estimatedSaving: number
  voucherTitle: string
  voucherType: VoucherType
  merchantName: string
  branchName: string | null
  /** "Show to Staff" — M3 stub in M2 (caller passes a no-op or alert). */
  onShowToStaff: () => void
  /** "Rate & Review" — M2 keeps as a stub or routes to existing review flow. */
  onRateReview: () => void
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

// en-GB / Europe/London formatters mirror ShowToStaff for consistency.
// The receipt-style fields ("Redeemed on") use date+time without
// seconds; the live trust signal includes seconds so a screenshot
// freezes a stale timestamp that staff can spot. Hermes-CLDR-robust
// pattern (numeric Intl parts + composed display) — see
// `reference_london_clock_helper.md` in memory.
const REDEEMED_AT_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  day:    '2-digit',
  month:  'short',
  year:   'numeric',
  hour:   '2-digit',
  minute: '2-digit',
  hour12: false,
})

const LIVE_CLOCK_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  day:    '2-digit',
  month:  'short',
  year:   'numeric',
  hour:   '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function formatRedeemedAtLine(iso: string): string {
  // Receipt-detail tone: "08 May 2026, 14:24". Drops seconds — the
  // static value is a permanent record, not a real-time signal. The
  // live trust line below carries seconds.
  return REDEEMED_AT_FORMATTER.format(new Date(iso))
}

function formatLiveLine(now: Date): string {
  // "08 May 2026 · 14:24:38" — date and time joined with a middot.
  // Splits the formatter output to avoid Hermes-CLDR locale quirks
  // (the comma separator from `Intl` can render differently per
  // engine; the join is explicit).
  const parts = LIVE_CLOCK_FORMATTER.format(now).split(', ')
  const date = parts[0] ?? ''
  const time = parts[1] ?? ''
  return date && time ? `${date} · ${time}` : LIVE_CLOCK_FORMATTER.format(now)
}

/**
 * SuccessPopup — Voucher Detail M2 (redesign locked 2026-05-09 from
 * `/impeccable improve` design pass).
 *
 * Design direction — COMMITTED color strategy on the voucher's own
 * type colour (Freebie emerald, BOGO purple, Discount rose, etc.).
 * The success surface is THIS voucher's success surface, not a
 * generic confirmation modal. Replaces the previous brand-rose/coral
 * gradient header (SaaS-reflex) with subtle voucher-type pastel
 * accent. Code is now the visual hero; the check is acknowledgment.
 *
 * Why committed-on-type:
 *   • Ties the success moment to the voucher's identity — the user
 *     just tapped a Freebie voucher, the success surface looks like
 *     a Freebie.
 *   • Resolves the previous design's three-accent muddle (rose +
 *     green + purple) into one meaningful committed colour.
 *   • Anti-references SaaS brand-gradient modal AND the second-order
 *     "minimal typographic on cream" reflex — voucher-type colour
 *     makes it specifically Redeemo.
 *
 * Layout (top → bottom):
 *   1. Type-pastel accent row: small green check + "REDEEMED" label
 *      in tracked uppercase, voucher-type pastel gradient bg.
 *   2. Voucher context: title + merchant, single compact strip.
 *   3. Code hero: raised card with type-colour border ring + tint.
 *      Code at 30pt 800 tabular-nums; live timestamp underneath.
 *   4. Receipt details: "Redeemed on" + "Branch", compact tabular.
 *   5. Disclosure: "Staff scan or type this code from the Show to
 *      Staff screen."
 *   6. Primary CTA: Show to Staff — solid type-colour with type-
 *      tinted shadow.
 *   7. Secondary row: Rate & Review (flat type-colour text) + Done
 *      (flat navy text). Quieter; not competing with the primary.
 *
 * Persistence: this component is mounted by VoucherDetailScreen via
 * `successPopup` state. As long as the screen stays mounted, the popup
 * survives focus changes / app background — the parent decides when
 * to dismiss via setSuccessPopup(null).
 *
 * Confetti is intentionally omitted: the v6 confetti uses 7
 * Reanimated layers + 2.8s sequence which would add ~150 lines of
 * animation code. Owner direction prioritises shipping the contract
 * over decorative motion; if confetti is wanted, it's a Tier-1 polish
 * follow-up on top of the working popup.
 */
export function SuccessPopup({
  visible,
  redemptionCode,
  redeemedAt,
  estimatedSaving,
  voucherTitle,
  voucherType,
  merchantName,
  branchName,
  onShowToStaff,
  onRateReview,
  onDone,
}: Props) {
  // Cross-platform screen-capture protection while the popup is
  // visible. Android FLAG_SECURE blocks screenshots + recordings;
  // iOS 11+ overlays a blurred snapshot on active recordings /
  // mirroring. Best-effort — the popup renders normally if the
  // native call rejects. Locked 2026-05-08, PR #49 final wave —
  // shares the prevention baseline with `<ShowToStaff>` so a
  // screenshot/recording of EITHER surface that displays the code
  // is protected. SuccessPopup intentionally does NOT install the
  // iOS post-fact screenshot listener (no banner, no telemetry) —
  // that surface area stays Show-to-Staff-specific.
  useScreenCaptureProtection(visible)

  const scale = useSharedValue(0.8)
  const ty = useSharedValue(30)
  const checkScale = useSharedValue(0)

  // Live ticking timestamp — anti-screenshot trust signal. Updates
  // every 1s while the popup is visible. The interval is unconditional
  // on `prefers-reduced-motion`: this is a trust signal, not
  // decorative motion, so reduced-motion users still see it tick (per
  // owner direction 2026-05-08).
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    if (!visible) return
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [visible])

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
  const typeBgTint = `${typeColor}14`     // ~8% alpha tint via hex
  const typeBgRing = `${typeColor}33`     // ~20% alpha for borders
  const typeGradient = color.voucher.gradientByType[voucherType]
    ?? color.voucher.gradientByType.DISCOUNT_FIXED
  const formattedCode = formatRedemptionCode(redemptionCode)

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onDone}>
      <View style={styles.scrim} testID="success-popup-scrim">
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel="Voucher redeemed successfully"
          style={[styles.popup, popupStyle]}
          testID="success-popup"
        >
          {/* Type-pastel accent row — replaces the brand-gradient header.
              Voucher-type pastel gradient gives the popup its identity
              colour (Freebie emerald, BOGO purple, etc.) — the success
              surface looks like THIS voucher's success surface, not a
              generic confirmation modal. */}
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
              variant="label.lg"
              style={[styles.accentLabel, { color: typeColor }]}
            >
              Redeemed
            </Text>
            <View style={[styles.accentTypeChip, { borderColor: typeBgRing }]}>
              <Text
                variant="label.md"
                style={[styles.accentTypeChipText, { color: typeColor }]}
              >
                {TYPE_LABELS[voucherType]}
              </Text>
            </View>
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

            {/* Code hero — anti-fraud trust area. Type-coloured border
                ring + 8% tint background lifts this above the receipt
                detail rows; the code is now the visual hero of the
                popup. The live timestamp is rendered HERE next to the
                code so a screenshot cannot crop one without the other.
                The live ticker is the screenshot-detection signal:
                trained staff see a frozen second-counter on a static
                screenshot. Locked 2026-05-08, deferred-followups §AC. */}
            <View
              style={[styles.codeBox, {
                backgroundColor: typeBgTint,
                borderColor: typeBgRing,
              }]}
              testID="success-proof-area"
            >
              <Text variant="label.md" style={[styles.codeLabel, { color: typeColor }]}>
                REDEMPTION CODE
              </Text>
              <Text
                variant="heading.md"
                style={styles.codeValue}
                testID="success-code"
                accessibilityLabel={`Code: ${formattedCode.split('').join(' ')}`}
              >
                {formattedCode}
              </Text>
              <Text
                variant="body.sm"
                style={styles.liveLine}
                testID="success-live-timestamp"
                accessibilityLabel={`Live time: ${formatLiveLine(now)}`}
              >
                Live: {formatLiveLine(now)}
              </Text>
            </View>

            {/* Receipt details — compact tabular rows. The "Redeemed on"
                line is the static record from `redeemedAt`; the live
                ticker lives in the proof area above. The Branch row
                hides entirely when branch is unknown (avoids the old
                em-dash fallback which violated the locked "no em
                dashes in UI text" PRODUCT.md rule). */}
            <View style={styles.infoRows}>
              <InfoRow
                label="Redeemed on"
                value={formatRedeemedAtLine(redeemedAt)}
                testID="success-redeemed-at"
              />
              <InfoRow label="Branch" value={branchName ?? '-'} />
            </View>

            {/* Anti-fraud disclosure — keeps the test-pin testID
                `success-staff-verify-copy` (must reference "Show to
                Staff" per success-popup.test.tsx). Tightened copy:
                tells the user WHAT staff do (scan or type), not just
                where. */}
            <Text
              variant="body.sm"
              style={styles.disclosure}
              testID="success-staff-verify-copy"
            >
              Staff scan or type this code from the Show to Staff screen.
            </Text>
            {/* disclosure body.sm variant drives 14/21 (cross-surface
                consistency 2026-05-09 — fontSize override stripped). */}

            {/* Primary CTA — solid voucher-type colour with type-
                tinted shadow. Replaces the previous brand-rose/coral
                gradient (which was the SaaS reflex per PRODUCT.md
                anti-references). */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show redemption code to staff"
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
                Show to Staff
              </Text>
            </Pressable>

            {/* Secondary row — flat text actions. Demoted from the
                previous outlined-button treatment so they read as
                supporting actions, not as primary actions competing
                with Show to Staff. */}
            <View style={styles.secondaryRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Rate and review"
                testID="success-rate-review"
                onPress={() => { lightHaptic(); onRateReview() }}
                style={({ pressed }) => [
                  styles.tertiaryAction,
                  pressed && styles.tertiaryPressed,
                ]}
              >
                <Star size={13} color={typeColor} strokeWidth={2.4} />
                <Text
                  variant="label.md"
                  style={[styles.tertiaryText, { color: typeColor }]}
                >
                  Rate & Review
                </Text>
              </Pressable>
              <View style={styles.tertiaryDot} />
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
  accentLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    flex: 1,
  },
  accentTypeChip: {
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: radius.xs,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  accentTypeChipText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
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
  // ── Code hero ──
  // The visual hero of the popup. Type-coloured border ring + 8%
  // tint background lifts this above the receipt rows. Generous
  // vertical padding gives the code breathing room — varied
  // spacing rhythm per design laws (rest of the popup uses
  // tighter rhythm).
  codeBox: {
    borderRadius: radius.lg,
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
    alignItems: 'center',
    borderWidth: 1,
  },
  codeLabel: {
    fontSize: 9,
    letterSpacing: 1.4,
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  codeValue: {
    fontSize: 30,
    fontWeight: '800',
    color: color.text.primary,
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
    // Slight negative top-margin pulls the code closer to the label
    // without overlapping; tightens the visual block.
    marginTop: -2,
  },
  // body.sm (14 / 21) variant drives.  fontSize override removed
  // 2026-05-09 (PR-A §3.3): live timestamp is the screenshot-detection
  // trust signal — staff verify the second-counter is moving.  At 11pt
  // it was too tight against the 30pt code; at 14pt it reads
  // comfortably without competing.
  liveLine: {
    marginTop: spacing[2],
    color: color.text.tertiary,
    letterSpacing: 0.3,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
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
  // ── Disclosure ──
  // Tertiary text that explains how staff verify the code. Quieter
  // than the receipt rows (no border, no weight) so it reads as a
  // helper line, not a separate section.
  // body.sm (14 / 21) variant drives.  fontSize/lineHeight overrides
  // removed 2026-05-09 (cross-surface consistency).
  disclosure: {
    color: color.text.tertiary,
    textAlign: 'center',
    paddingHorizontal: spacing[2],
    paddingTop: 2,
  },
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
  // Flat text actions. Read as supporting choices, not primary
  // buttons competing with Show to Staff above.
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
    opacity: opacity.pressed,
  },
  tertiaryText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  tertiaryDoneText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.text.secondary,
    letterSpacing: 0.2,
  },
  tertiaryDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: color.border.default,
  },
  ctaPressed: {
    opacity: opacity.pressed,
    transform: [{ scale: 0.98 }],
  },
})
