import React, { useEffect, useRef, useState } from 'react'
import {
  AppState,
  type AppStateStatus,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Clock, ShieldCheck, X } from '@/design-system/icons'
import { Text } from '@/design-system/Text'
import { color, radius, spacing } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'
import { lightHaptic, successHaptic } from '@/design-system/haptics'
import { PulsingDot } from '@/design-system/motion/PulsingDot'
import { RedeemoLogo } from '@/features/auth/components/RedeemoLogo'
import { QRCodeBlock } from './QRCodeBlock'
import { formatRedemptionCode } from '../utils/formatRedemptionCode'
import {
  formatShowToStaffLive,
  formatShowToStaffRedeemed,
} from '../utils/showToStaffFormatters'
import { voucherTypeLabel } from '../utils/voucherTheme'
import { useRedemptionPolling } from '../hooks/useRedemptionPolling'
import { useBrightnessBoost } from '../hooks/useBrightnessBoost'
import { useAutoHideTimer } from '../hooks/useAutoHideTimer'
import { useScreenshotGuard } from '../hooks/useScreenshotGuard'
import { useScreenCaptureProtection } from '../hooks/useScreenCaptureProtection'
import { SCREENSHOT_GUARD_ENABLED } from '../hooks/screenshotGuardConfig'
import type { VoucherType } from '@/lib/api/redemption'

/**
 * Show-to-Staff full-screen surface — vertical receipt register
 * (PR-B T1, locked 2026-05-09).
 *
 * **Register shift from M3 baseline.** The previous brand-red gradient
 * "QR card" surface read as a generic mobile coupon screen. PR-B
 * shifts to an "official document" / Apple Wallet pass / boarding-pass
 * register: cream identity zone at the top (Redeemo wordmark + close),
 * eyebrow + voucher title + description, merchant logo + branch row,
 * the QR + code as the visual anchor (kept inside the existing animated
 * brand-rose border + LIVE pulse + ticking en-GB London datetime), and
 * a "Verified through Redeemo" footer. The screen IS the proof of
 * redemption — see brief §3.1 + §5.1 for the full design contract.
 *
 * **Locked / preserved verbatim from M3:**
 *   - 8-character 4+4 redemption code (formatRedemptionCode).
 *   - QRCodeBlock (M3 Task 9) — QR + Redeemo R logo overlay + blur.
 *   - PulsingDot LIVE badge.
 *   - Animated brand-rose code-card border.
 *   - Live datetime ticker (Hermes-robust formatter).
 *   - useRedemptionPolling — `enabled` driven by `visible`, `paused`
 *     by AppState !== 'active' so backgrounded time still consumes the
 *     15-min budget per locked plan §Backgrounding.
 *   - useBrightnessBoost — best-effort + fail-safe; gated through
 *     BRIGHTNESS_BOOST_ENABLED kill-switch.
 *   - useAutoHideTimer — `frozen` flips on validated phase; tap-to-show
 *     resets the timer.
 *   - useScreenCaptureProtection (Android FLAG_SECURE + iOS 11+
 *     recording-blur).
 *   - useScreenshotGuard (iOS post-fact listener + telemetry).
 *   - Validated transition haptic + 2 s auto-dismiss + onDone.
 *   - Reduced-motion paths.
 *
 * **NEW props in PR-B:**
 *   - `voucherDescription: string | null` — voucher.description from
 *     the customer voucher payload. Renders a 3-line ellipsis block
 *     beneath the voucher title.
 *   - `merchantLogoUrl: string | null` — voucher.merchant.logoUrl.
 *     Renders a 48 × 48 logo, OR collapses to merchant initials in a
 *     cream-tint circle when null, OR falls back to initials when the
 *     `<Image onError>` fires.
 *
 * **Customer name (M3 §U1):** `customerName=""` is the locked M3
 * default. The Customer info row is suppressed when the prop is empty.
 * Forward-compat: passing a real name renders the row.
 *
 * **Brightness-boost kill-switch (locked owner direction 2026-05-08):**
 * Brightness boost is best-effort and fail-safe — flipping
 * `BRIGHTNESS_BOOST_ENABLED` to `false` disables the boost without
 * touching anything else. The QR, code, polling, auto-hide, AppState
 * wiring, validated transition, and Done button are all independent.
 */

const AUTO_DISMISS_MS = 2_000

/**
 * Kill-switch for the brightness boost. Default: true. Flip to `false`
 * to ship a build that disables the boost entirely as a fast
 * remediation if device QA surfaces instability.
 */
const BRIGHTNESS_BOOST_ENABLED = true

// `SCREENSHOT_GUARD_ENABLED` lives in `../hooks/screenshotGuardConfig`
// (shared with VoucherDetailScreen — locked 2026-05-09 from
// deferred-followups §AG5). Imported above. Same fail-safe semantics.

type Props = {
  visible: boolean
  redemptionCode: string
  voucherTitle: string
  voucherType: VoucherType
  /** PR-B T1 — voucher.description (string | null). Renders a 3-line
   *  ellipsis block beneath the voucher title when non-null. */
  voucherDescription: string | null
  merchantName: string
  /** PR-B T1 — voucher.merchant.logoUrl (string | null). Renders a
   *  48 × 48 logo when non-null, collapses to merchant initials in a
   *  cream-tint circle when null OR when the `<Image onError>` fires. */
  merchantLogoUrl: string | null
  branchName: string
  /** M3 lock — see §U1 in deferred-followups. Pass empty string. */
  customerName: string
  /** ISO timestamp when the redemption was created. */
  redeemedAt: string
  onDone: () => void
  /** Fires ONCE when polling reaches `phase === 'validated'` —
   *  before the 2 s auto-dismiss. The parent uses this signal to flip
   *  RedemptionDetailsCard's "Validated by staff" pill on the
   *  post-dismiss return-to-VoucherDetail render (PR #49 review fix). */
  onValidated?: () => void
}

/**
 * Merchant-name → initials helper. Single name → first 2 chars upper.
 * Two-or-more names → first char of the first + last name pair.
 * Empty / whitespace-only → '?'.
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const firstName = parts[0] ?? ''
  if (parts.length === 1) return firstName.slice(0, 2).toUpperCase()
  const lastName = parts[parts.length - 1] ?? ''
  const firstChar = firstName[0] ?? ''
  const lastChar = lastName[0] ?? ''
  return (firstChar + lastChar).toUpperCase()
}

function LiveClock({ active }: { active: boolean }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [active])

  const display = formatShowToStaffLive(now)

  return (
    <View style={styles.liveDatetimeRow}>
      <Clock size={16} color={color.brandRose} />
      <Text variant="heading.md" style={styles.liveDatetimeText}>
        {display}
      </Text>
    </View>
  )
}

export function ShowToStaff({
  visible,
  redemptionCode,
  voucherTitle,
  voucherType,
  voucherDescription,
  merchantName,
  merchantLogoUrl,
  branchName,
  customerName,
  redeemedAt,
  onDone,
  onValidated,
}: Props) {
  const motionScale = useMotionScale()
  const reduced = motionScale === 0
  const insets = useSafeAreaInsets()

  // AppState pause — locked plan §Backgrounding.
  const [appActive, setAppActive] = useState(true)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      setAppActive(s === 'active')
    })
    return () => sub.remove()
  }, [])

  const active = visible && appActive

  // QR blur source. Two sources (independent paths):
  //   - 'screenshot': iOS post-fact listener fired (Android's FLAG_SECURE
  //     blocks screenshots before this fires).
  //   - 'auto-hide': useAutoHideTimer reached 'hidden' (2 min idle +
  //     10 s warning) — anti-fraud guard for the unattended-phone case.
  type BlurReason = 'screenshot' | 'auto-hide'
  const [blurReason, setBlurReason] = useState<BlurReason | null>(null)
  const blurred = blurReason !== null

  // Logo error tracking — graceful fallback to initials when remote
  // image fails to load.
  const [logoError, setLogoError] = useState(false)
  const showLogo = merchantLogoUrl !== null && !logoError

  // Building-block hooks — wired exactly as M3 baseline.
  const poll = useRedemptionPolling(redemptionCode, {
    enabled: visible,
    paused:  !appActive,
  })
  useBrightnessBoost(BRIGHTNESS_BOOST_ENABLED && active)
  const { state: hideState, resetTimer } = useAutoHideTimer({
    active,
    frozen: poll.phase === 'validated',
  })
  useScreenCaptureProtection(SCREENSHOT_GUARD_ENABLED && active)
  useScreenshotGuard(redemptionCode, {
    active: SCREENSHOT_GUARD_ENABLED && active,
    onBannerShown: () => setBlurReason('screenshot'),
  })

  // Auto-hide → blur on 'hidden' state.
  useEffect(() => {
    if (hideState === 'hidden') setBlurReason('auto-hide')
  }, [hideState])

  // Auto-dismiss after validated transition. Reduced motion routes
  // straight through onDone. onValidated fires ONCE per session.
  const onDoneRef = useRef(onDone)
  const onValidatedRef = useRef(onValidated)
  const validatedFiredRef = useRef(false)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])
  useEffect(() => { onValidatedRef.current = onValidated }, [onValidated])
  useEffect(() => {
    if (poll.phase !== 'validated') return
    successHaptic()
    if (!validatedFiredRef.current) {
      validatedFiredRef.current = true
      onValidatedRef.current?.()
    }
    if (reduced) {
      onDoneRef.current()
      return
    }
    const id = setTimeout(() => onDoneRef.current(), AUTO_DISMISS_MS)
    return () => clearTimeout(id)
  }, [poll.phase, reduced])

  if (!visible) return null

  const isValidated = poll.phase === 'validated'
  const showCustomerRow = customerName.length > 0
  const formattedCode = formatRedemptionCode(redemptionCode)
  const redeemedDisplay = formatShowToStaffRedeemed(new Date(redeemedAt))

  // Identity-zone padding honours the device safe-area top so the cream
  // band absorbs the notch / Dynamic Island clearance per brief §9.2.
  const identityZonePaddingTop = (insets.top ?? 0) + 16
  const footerPaddingBottom = (insets.bottom ?? 0) + 12

  return (
    <Modal
      visible={visible}
      animationType={reduced ? 'none' : 'slide'}
      presentationStyle="fullScreen"
      onRequestClose={onDone}
    >
      {/* Cream document body — replaces the M3 brand-red gradient. The
          surface now reads as an "official document" / Apple Wallet
          pass under both ambient light + customer-side brightness boost.
          Anchor refs: brief §3.1. */}
      <LinearGradient
        colors={[color.cream, '#FCF0E5']}
        locations={[0, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.background}
      >
        {/* Cream identity zone — Redeemo wordmark (left) + close (right). */}
        <View
          style={[styles.identityZone, { paddingTop: identityZonePaddingTop }]}
          testID="show-to-staff-identity-zone"
        >
          <View style={styles.identityZoneLeft}>
            <RedeemoLogo size={24} />
            <Text
              variant="heading.sm"
              style={styles.identityWordmark}
              testID="show-to-staff-redeemo-wordmark"
            >
              Redeemo
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="show-to-staff-close"
            onPress={() => { lightHaptic(); onDone() }}
            hitSlop={12}
            style={({ pressed }) => [
              styles.closeButton,
              pressed && styles.closeButtonPressed,
            ]}
          >
            <X size={20} color={color.text.secondary} />
          </Pressable>
        </View>

        {/* Tap surface — resets the auto-hide timer on any non-button
            tap inside the document body. Wraps the scrolling content
            so the cream identity zone + footer aren't part of the tap
            target (would feel weird if pressing the close-icon area
            also reset the timer). */}
        <Pressable
          style={styles.bodyTapSurface}
          onPress={resetTimer}
          accessibilityRole="none"
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Eyebrow — "VERIFIED VOUCHER" in brand-rose. */}
            <View style={styles.eyebrowBlock}>
              <Text
                variant="label.eyebrow"
                style={styles.eyebrowText}
                testID="show-to-staff-eyebrow"
              >
                Verified Voucher
              </Text>
            </View>

            {/* Voucher info — title + description (3 lines, ellipsis). */}
            <View style={styles.voucherInfoBlock}>
              <Text
                variant="heading.md"
                style={styles.voucherTitle}
                testID="show-to-staff-voucher-title"
              >
                {voucherTitle}
              </Text>
              {voucherDescription ? (
                <Text
                  variant="body.md"
                  style={styles.voucherDescription}
                  numberOfLines={3}
                  ellipsizeMode="tail"
                  testID="show-to-staff-voucher-description"
                >
                  {voucherDescription}
                </Text>
              ) : null}
            </View>

            {/* Merchant block — logo (or initials) + name + branch. */}
            <View style={styles.merchantBlock}>
              {showLogo ? (
                <Image
                  testID="show-to-staff-merchant-logo"
                  accessibilityLabel={`${merchantName} logo`}
                  source={{ uri: merchantLogoUrl ?? undefined }}
                  style={styles.merchantLogo}
                  onError={() => setLogoError(true)}
                />
              ) : (
                <View
                  style={styles.merchantInitialsCircle}
                  testID="show-to-staff-merchant-initials"
                  accessibilityLabel={`${merchantName} logo`}
                >
                  <Text
                    variant="heading.sm"
                    style={styles.merchantInitialsText}
                  >
                    {getInitials(merchantName)}
                  </Text>
                </View>
              )}
              <View style={styles.merchantText}>
                <Text
                  variant="heading.sm"
                  style={styles.merchantName}
                  numberOfLines={1}
                  testID="show-to-staff-merchant-name"
                >
                  {merchantName}
                </Text>
                <Text
                  variant="label.lg"
                  style={styles.merchantBranch}
                  numberOfLines={1}
                  testID="show-to-staff-branch"
                >
                  {branchName}
                </Text>
              </View>
            </View>

            {/* QR anchor — animated brand-rose border (preserved verbatim
                from M3) wraps QR + LIVE badge + 4+4 code. The
                "alive" anti-fraud signals (LIVE pulse + live datetime
                ticker) animate inside this card. */}
            <LinearGradient
              colors={['#FFFFFF', 'rgba(255,255,255,0.5)', '#FCD34D', '#FFFFFF']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.codeCardBorder}
              testID="show-to-staff-code-card-border"
            >
              <View style={styles.codeCardInner}>
                {/* LIVE badge — preserved verbatim. */}
                <View style={styles.liveRow}>
                  <View style={styles.liveBadge}>
                    <PulsingDot color={color.brandRose} size={7} />
                    <Text variant="label.eyebrow" style={styles.liveText}>
                      LIVE
                    </Text>
                  </View>
                </View>

                {/* QR — blurred when EITHER (a) iOS screenshot listener
                    fired OR (b) auto-hide timer reached 'hidden'. Tap on
                    the blurred QR clears the blur AND resets the
                    auto-hide timer. */}
                <View style={styles.qrWrapper}>
                  <QRCodeBlock
                    value={redemptionCode}
                    size={160}
                    hero
                    testID="show-to-staff-qr"
                    blurred={blurred}
                    onShow={() => {
                      setBlurReason(null)
                      resetTimer()
                    }}
                  />
                </View>

                {/* Code value (4+4) — preserved verbatim. */}
                <Text
                  variant="display.lg"
                  align="center"
                  style={styles.codeValue}
                  testID="show-to-staff-code"
                >
                  {formattedCode}
                </Text>

                {/* Live datetime ticker — anti-fraud signal. */}
                <View style={styles.liveDatetimeWrapper}>
                  <LiveClock active={active} />
                </View>
              </View>
            </LinearGradient>

            {/* Info card — Voucher Type + Redeemed + (optional) Customer
                rows. Preserved as-is from M3 per brief §11 "All other
                copy unchanged from M3". Sits beneath the QR anchor as
                supplementary metadata; the receipt's primary
                identity-and-anchor stack is above. */}
            <View style={styles.infoCard}>
              {showCustomerRow ? (
                <View style={styles.infoRow}>
                  <Text variant="body.sm" style={styles.infoLabel}>Customer</Text>
                  <Text variant="body.sm" style={styles.infoValue}>{customerName}</Text>
                </View>
              ) : null}
              <View style={styles.infoRow}>
                <Text variant="body.sm" style={styles.infoLabel}>Voucher Type</Text>
                <Text variant="body.sm" style={styles.infoValue}>
                  {voucherTypeLabel(voucherType)}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text variant="body.sm" style={styles.infoLabel}>Redeemed</Text>
                <Text variant="body.sm" style={styles.infoValue}>{redeemedDisplay}</Text>
              </View>
            </View>

            {/* Blur reason banner — surfaces only while blurred AND not
                yet validated. Distinct copy per source. Tapping the QR
                clears blur via onShow + resets the auto-hide timer. */}
            {blurReason === 'screenshot' && !isValidated ? (
              <View style={styles.blurReasonBanner}>
                <Text variant="label.md" style={styles.blurReasonBannerText}>
                  Screenshot detected. Staff verify only the live screen. Tap the QR to show again.
                </Text>
              </View>
            ) : null}
            {blurReason === 'auto-hide' && !isValidated ? (
              <View style={styles.blurReasonBanner}>
                <Text variant="label.md" style={styles.blurReasonBannerText}>
                  QR hidden after 2 minutes of inactivity. Tap the QR to show again.
                </Text>
              </View>
            ) : null}

            {/* Validated overlay — the savings-green pill takes the place
                of the redemption code as the load-bearing signal once
                staff has scanned. Auto-dismisses 2 s after entry. */}
            {isValidated ? (
              <View style={styles.validatedRow}>
                <ShieldCheck size={18} color="#FFFFFF" />
                <Text variant="heading.sm" style={styles.validatedText}>
                  Verified by staff at {branchName}
                </Text>
              </View>
            ) : null}

            {/* Auto-hide warning hint — surfaces 10 s before the QR
                hides. Inline copy above the Done button. */}
            {hideState === 'warning' && !isValidated ? (
              <Text variant="label.md" align="center" style={styles.warningHint}>
                QR will hide in 10 seconds. Tap to keep visible.
              </Text>
            ) : null}

            {/* Done button — primary dismiss path; close-icon in the
                identity zone is the secondary path. Both route to
                onDone. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={() => { lightHaptic(); onDone() }}
              style={({ pressed }) => [
                styles.doneBtn,
                pressed && styles.doneBtnPressed,
              ]}
            >
              <Text variant="heading.sm" style={styles.doneBtnText}>Done</Text>
            </Pressable>
          </ScrollView>
        </Pressable>

        {/* Footer — "Verified through Redeemo" wordmark on a neutral
            tint. Sits outside the scroll area so it stays anchored at
            the bottom of the document body. */}
        <View
          style={[styles.footer, { paddingBottom: footerPaddingBottom }]}
        >
          <Text
            variant="label.md"
            style={styles.footerText}
            testID="show-to-staff-footer"
          >
            Verified through Redeemo
          </Text>
        </View>
      </LinearGradient>
    </Modal>
  )
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  identityZone: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingBottom: 12,
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(1,12,53,0.08)',
  },
  identityZoneLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  identityWordmark: {
    color: color.text.primary,
    letterSpacing: 0.2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(1,12,53,0.04)',
  },
  closeButtonPressed: {
    backgroundColor: 'rgba(1,12,53,0.10)',
    transform: [{ scale: 0.96 }],
  },
  bodyTapSurface: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    alignItems: 'stretch',
  },
  eyebrowBlock: {
    alignItems: 'flex-start',
  },
  eyebrowText: {
    color: color.brandRose,
  },
  voucherInfoBlock: {
    paddingTop: 8,
    gap: 8,
  },
  voucherTitle: {
    color: color.text.primary,
    fontFamily: 'Lato-Bold',
  },
  voucherDescription: {
    color: color.text.secondary,
  },
  merchantBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 16,
    paddingBottom: 16,
  },
  merchantLogo: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: 'rgba(1,12,53,0.04)',
  },
  merchantInitialsCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.cream,
    borderWidth: 1,
    borderColor: 'rgba(226,12,4,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  merchantInitialsText: {
    color: color.text.primary,
    fontFamily: 'Lato-Bold',
  },
  merchantText: {
    flex: 1,
    flexDirection: 'column',
    gap: 2,
  },
  merchantName: {
    color: color.text.primary,
  },
  merchantBranch: {
    color: color.text.tertiary,
  },
  codeCardBorder: {
    width: '100%',
    borderRadius: 22,
    padding: 3,
    marginTop: 8,
  },
  codeCardInner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(226,12,4,0.06)',
  },
  liveText: {
    marginLeft: 6,
    color: color.brandRose,
  },
  qrWrapper: {
    alignItems: 'center',
    marginBottom: 16,
  },
  codeValue: {
    color: color.navy,
    letterSpacing: 6,
    fontVariant: ['tabular-nums'],
    marginBottom: 20,
  },
  liveDatetimeWrapper: {
    width: '100%',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  liveDatetimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDatetimeText: {
    marginLeft: 8,
    color: color.navy,
    fontVariant: ['tabular-nums'],
  },
  infoCard: {
    width: '100%',
    backgroundColor: 'rgba(1,12,53,0.04)',
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(1,12,53,0.08)',
    marginTop: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    color: color.text.secondary,
  },
  infoValue: {
    color: color.text.primary,
  },
  validatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: color.savingsGreen,
    marginTop: 12,
  },
  validatedText: {
    color: '#FFFFFF',
    marginLeft: 8,
  },
  warningHint: {
    color: color.text.secondary,
    marginTop: 12,
  },
  blurReasonBanner: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(1,12,53,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(1,12,53,0.12)',
    marginTop: 12,
  },
  blurReasonBannerText: {
    color: color.text.primary,
    textAlign: 'center',
  },
  doneBtn: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: color.navy,
    alignItems: 'center',
    marginTop: 16,
  },
  doneBtnPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.92,
  },
  doneBtnText: {
    color: '#FFFFFF',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingHorizontal: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(1,12,53,0.08)',
  },
  footerText: {
    color: color.text.tertiary,
  },
})
