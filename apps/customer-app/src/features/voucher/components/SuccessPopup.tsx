import React, { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Check, Eye, Star } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, opacity, radius, spacing } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import { formatRedemptionCode } from '../utils/formatRedemptionCode'
import type { VoucherType } from '@/lib/api/redemption'

type Props = {
  visible: boolean
  /** The successful RedeemResponse from useRedeem. null when popup hidden. */
  redemptionCode: string
  redeemedAt: string  // ISO string
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
 * SuccessPopup — Voucher Detail M2.
 *
 * Visual contract: v6 mockup §SuccessPopup (Screen 7).
 *   • Compact 330-px max-width centred float (NOT full-screen).
 *   • Rgba(1,12,53,0.55) overlay with blur (closest available — RN
 *     uses `<Modal transparent>` + dimmed backdrop).
 *   • Spring entry: scale 0.8 → 1, translateY 30 → 0, ~450ms.
 *   • Checkmark in 48-px green ring with 200ms-delayed bounce.
 *   • Brand-gradient header strip with "Voucher Redeemed!" title.
 *   • Voucher strip (cream bg) with type-coloured badge + title.
 *   • Code box: monospace 4+4 grouping ("A7K2 P9X4").
 *   • Three info rows: date, time, branch.
 *   • Three CTAs: Show to Staff (gradient primary), Rate & Review
 *     (purple secondary), Done (transparent navy).
 *
 * Persistence: this component is mounted by VoucherDetailScreen via
 * `successPopup` state. As long as the screen stays mounted, the popup
 * survives focus changes / app background — the parent decides when
 * to dismiss via setSuccessPopup(null).
 *
 * Confetti is intentionally omitted in M2: the v6 confetti uses 7
 * Reanimated layers + 2.8s sequence which would add ~150 lines of
 * animation code. Owner direction prioritises shipping the contract
 * over decorative motion; if confetti is wanted, it's a Tier-1 polish
 * follow-up on top of the working popup.
 */
export function SuccessPopup({
  visible,
  redemptionCode,
  redeemedAt,
  voucherTitle,
  voucherType,
  merchantName,
  branchName,
  onShowToStaff,
  onRateReview,
  onDone,
}: Props) {
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
      scale.value = withSpring(1, { damping: 12, stiffness: 120 })
      ty.value = withSpring(0, { damping: 14, stiffness: 100 })
      // Checkmark bounces ~200ms after the popup enters.
      checkScale.value = withDelay(
        200,
        withSpring(1, { damping: 10, stiffness: 180, overshootClamping: false }),
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
  const typeBgTint = `${typeColor}14` // ~8% alpha tint via hex
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
          {/* Header — brand-gradient strip with checkmark + title */}
          <View style={styles.header}>
            <LinearGradient
              colors={color.brandGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <Animated.View style={[styles.checkRing, checkStyle]} testID="success-check-ring">
              <Check size={24} color={color.onBrand} strokeWidth={3} />
            </Animated.View>
            <Text variant="heading.md" style={styles.headerTitle}>
              Voucher Redeemed!
            </Text>
            <Text
              variant="label.md"
              style={styles.headerSub}
              testID="success-staff-verify-copy"
            >
              Staff verify on the live Show to Staff screen
            </Text>
          </View>

          {/* Voucher strip — type badge + voucher title + merchant */}
          <View style={styles.strip}>
            <View style={styles.stripText}>
              <View style={[styles.typeBadge, { backgroundColor: typeBgTint }]}>
                <Text
                  variant="label.md"
                  style={[styles.typeBadgeText, { color: typeColor }]}
                >
                  {TYPE_LABELS[voucherType]}
                </Text>
              </View>
              <Text variant="label.md" style={styles.stripTitle} numberOfLines={2}>
                {voucherTitle}
              </Text>
              <Text variant="label.md" style={styles.stripMerchant}>
                {merchantName}
              </Text>
            </View>
          </View>

          {/* Body — code + info rows + CTAs */}
          <View style={styles.body}>
            {/* Code box — anti-fraud trust area. The live timestamp is
                rendered HERE next to the code (not in the receipt rows
                below) so a screenshot cannot crop one without the
                other. The live ticker is the screenshot-detection
                signal: trained staff see a frozen second-counter on
                a static screenshot. Locked 2026-05-08, deferred-
                followups §AC anti-fraud parity with Show-to-Staff. */}
            <View style={styles.codeBox} testID="success-proof-area">
              <Text variant="label.md" style={styles.codeLabel}>
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
                variant="label.md"
                style={styles.liveLine}
                testID="success-live-timestamp"
                accessibilityLabel={`Live time: ${formatLiveLine(now)}`}
              >
                Live: {formatLiveLine(now)}
              </Text>
            </View>

            {/* Info rows — receipt-detail tone. The "Redeemed on" line
                is the static record from `redeemedAt`; the live ticker
                lives in the proof area above. */}
            <View style={styles.infoRows}>
              <InfoRow
                label="Redeemed on"
                value={formatRedeemedAtLine(redeemedAt)}
                testID="success-redeemed-at"
              />
              <InfoRow label="Branch" value={branchName ?? '—'} />
            </View>

            {/* Show to Staff (M2 stub — caller may show alert / no-op) */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show redemption code to staff"
              testID="success-show-to-staff"
              onPress={() => { lightHaptic(); onShowToStaff() }}
              style={({ pressed }) => [styles.primaryCta, pressed && styles.ctaPressed]}
            >
              <LinearGradient
                colors={color.brandGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFillObject}
              />
              <Eye size={18} color={color.onBrand} strokeWidth={2.4} />
              <Text variant="label.md" style={styles.primaryCtaText}>
                Show to Staff
              </Text>
            </Pressable>

            {/* Secondary action row */}
            <View style={styles.secondaryRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Rate and review"
                testID="success-rate-review"
                onPress={() => { lightHaptic(); onRateReview() }}
                style={({ pressed }) => [
                  styles.secondaryCta,
                  styles.rateCta,
                  pressed && styles.ctaPressed,
                ]}
              >
                <Star size={14} color={color.voucher.bogo} strokeWidth={2.4} />
                <Text variant="label.md" style={styles.rateText}>
                  Rate & Review
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Done"
                testID="success-done"
                onPress={() => { lightHaptic(); onDone() }}
                style={({ pressed }) => [
                  styles.secondaryCta,
                  styles.doneCta,
                  pressed && styles.ctaPressed,
                ]}
              >
                <Text variant="label.md" style={styles.doneText}>
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
      <Text variant="label.md" style={styles.infoLabel}>
        {label}
      </Text>
      <Text variant="label.md" style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(1,12,53,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[5],
  },
  popup: {
    width: '100%',
    maxWidth: 330,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: color.surface.raised,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 80,
    shadowOffset: { width: 0, height: 32 },
    elevation: 24,
  },
  // ── Header ──
  header: {
    paddingTop: spacing[5],
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[4],
    alignItems: 'center',
  },
  checkRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.savingsGreen,
    borderWidth: 2,
    borderColor: color.onBrand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[3],
    shadowColor: color.savingsGreen,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: color.onBrand,
    letterSpacing: -0.3,
  },
  headerSub: {
    marginTop: spacing[1],
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
  },
  // ── Voucher strip ──
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    backgroundColor: color.cream,
    borderBottomColor: color.border.subtle,
    borderBottomWidth: 1,
    padding: spacing[3],
  },
  stripText: {
    flex: 1,
    gap: spacing[1],
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.xs,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  stripTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: color.text.primary,
  },
  stripMerchant: {
    fontSize: 10,
    color: color.text.secondary,
  },
  // ── Body ──
  body: {
    padding: spacing[4],
    gap: spacing[3],
  },
  codeBox: {
    backgroundColor: color.surface.subtle,
    borderRadius: radius.lg,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: 9,
    color: color.text.tertiary,
    letterSpacing: 1.2,
    marginBottom: spacing[1],
  },
  codeValue: {
    fontSize: 26,
    fontWeight: '800',
    color: color.text.primary,
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
  },
  liveLine: {
    marginTop: spacing[2],
    fontSize: 11,
    color: color.text.tertiary,
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  infoRows: {
    gap: spacing[2],
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing[2],
    borderTopColor: 'rgba(0,0,0,0.04)',
    borderTopWidth: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: color.text.tertiary,
  },
  infoValue: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: color.text.primary,
    textAlign: 'right',
    marginLeft: spacing[3],
  },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: color.brandRose,
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  primaryCtaText: {
    fontSize: 14,
    fontWeight: '800',
    color: color.onBrand,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  secondaryCta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  rateCta: {
    backgroundColor: 'rgba(124,58,237,0.08)',
    borderColor: color.voucher.bogo,
  },
  rateText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.voucher.bogo,
  },
  doneCta: {
    backgroundColor: 'transparent',
    borderColor: color.border.default,
  },
  doneText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.text.primary,
  },
  ctaPressed: {
    opacity: opacity.pressed,
    transform: [{ scale: 0.97 }],
  },
})
