import React, { useEffect, useRef, useState } from 'react'
import {
  AppState,
  type AppStateStatus,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ShieldCheck } from '@/design-system/icons'
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
 * Show-to-Staff full-screen surface — brand-correct navy trust surface
 * (PR-B T8f, device-QA fix round 2 locked 2026-05-09).
 *
 * **T8f shift from T8c.**  T8c shipped a navy-gradient surface using a
 * fabricated 2-stop gradient `['#010C35', '#1F2A55']`.  Owner correction:
 * the second stop is NOT a brand-locked colour — PRODUCT.md only locks
 * one navy (`color.navy = '#010C35'`) as the brand secondary.  T8f
 * rebuilds on solid `color.navy` + a brand-rose glow overlay (mirrors
 * the SuccessPopup pattern shipped at `96401d9`).  No fabricated stops.
 *
 * Device-QA blockers closed in T8f:
 *
 *   1. **QR card content discipline.**  Only the QR code, the 4+4
 *      formatted code text, the LIVE pulsing dot, and the live ticking
 *      date/time live INSIDE the animated brand-rose border.  Voucher-
 *      type chip + redeemed timestamp + customer-name row all moved
 *      OUTSIDE the card (chip → above; timestamp + customer → below).
 *   2. **Live clock more prominent.**  Bumped from a 14pt label.lg
 *      glyph to a 16pt heading.sm + bold treatment + full white-on-
 *      navy contrast — the live ticker is the genuineness signal staff
 *      look at, so it now reads as load-bearing.
 *   3. **Done button replaces the X.**  Owner direction explicit — the
 *      X close icon top-right is gone; a full-width "Done" pill at the
 *      bottom of the surface carries the dismiss affordance.  Modal.
 *      onRequestClose still wires hardware back to the same handler.
 *   4. **Branch visible.**  The merchant row stacks merchant name +
 *      branch (e.g. "Pizza Palace" / "High Street") so the staff sees
 *      WHERE the redemption is anchored without parsing.
 *   5. **Bigger Redeemo logo.**  44pt (was 28pt) + heading.lg wordmark
 *      so the header reads as the dominant identity signal.
 *   6. **Breathing space.**  Section gaps + horizontal padding bumped;
 *      total surface still fits 375×667 default Dynamic Type without
 *      scrolling (math below).
 *
 * **Layout fit math (iPhone SE 1st gen, 375 × 667pt, default DT):**
 *   safe-area top (20) + 12 padding              =  32
 *   compact header (44pt logo + wordmark + pad)  =  72
 *   eyebrow + voucher title + description        =  90
 *   type chip                                    =  32
 *   merchant row (logo 36 + name + branch)       =  52
 *   QR card border + pads + QR(150) + ...        = 296
 *   redeemed timestamp row                       =  28
 *   done button                                  =  56
 *   safe-area bottom + pad                       =  12
 *   ----------------------------------------------------
 *   total                                        ≈ 670 (375×667 — tight
 *   but fits at default Dynamic Type with the no-scroll budget; owner
 *   accepted "slightly bigger is fine" if device-QA needs more rhythm)
 *
 * **Locked / preserved verbatim from M3 (anti-fraud surfaces):**
 *   - 8-character 4+4 redemption code (formatRedemptionCode).
 *   - QRCodeBlock — QR + Redeemo R logo overlay + blur.  QR remains on
 *     a WHITE inner card so QR-scanner contrast (black-on-white) stays
 *     readable under the navy bg.
 *   - PulsingDot LIVE badge.
 *   - Animated brand-rose code-card border (the LinearGradient that
 *     wraps the QR + LIVE pulse + 4+4 code + datetime ticker).
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
 *   - `customerName=""` empty-string suppression behaviour (M3 §U1).
 *
 * **Brightness-boost kill-switch (locked owner direction 2026-05-08):**
 * Brightness boost is best-effort and fail-safe — flipping
 * `BRIGHTNESS_BOOST_ENABLED` to `false` disables the boost without
 * touching anything else.  The QR, code, polling, auto-hide, AppState
 * wiring, and validated transition are all independent.
 */

const AUTO_DISMISS_MS = 2_000

/**
 * Kill-switch for the brightness boost.  Default: true.  Flip to `false`
 * to ship a build that disables the boost entirely as a fast
 * remediation if device QA surfaces instability.
 */
const BRIGHTNESS_BOOST_ENABLED = true

// `SCREENSHOT_GUARD_ENABLED` lives in `../hooks/screenshotGuardConfig`
// (shared with VoucherDetailScreen — locked 2026-05-09 from
// deferred-followups §AG5).  Imported above.  Same fail-safe semantics.

type Props = {
  visible: boolean
  redemptionCode: string
  voucherTitle: string
  voucherType: VoucherType
  /** PR-B T1 — voucher.description (string | null).  Renders a 2-line
   *  ellipsis block beneath the voucher title when non-null. */
  voucherDescription: string | null
  merchantName: string
  /** PR-B T1 — voucher.merchant.logoUrl (string | null).  Renders a
   *  36 × 36 logo when non-null, collapses to merchant initials in a
   *  navy-tint circle when null OR when the `<Image onError>` fires. */
  merchantLogoUrl: string | null
  branchName: string
  /** M3 lock — see §U1 in deferred-followups.  Pass empty string. */
  customerName: string
  /** ISO timestamp when the redemption was created. */
  redeemedAt: string
  onDone: () => void
  /** Fires ONCE when polling reaches `phase === 'validated'` —
   *  before the 2 s auto-dismiss.  The parent uses this signal to flip
   *  RedemptionDetailsCard's "Validated by staff" pill on the
   *  post-dismiss return-to-VoucherDetail render (PR #49 review fix). */
  onValidated?: () => void
}

/**
 * Merchant-name → initials helper.  Single name → first 2 chars upper.
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

  // PR-B T8f — bumped prominence: heading.sm (16pt) + bold + full
  // white-on-navy contrast (vs T8c's 14pt label.lg navy).  The live
  // ticker is the genuineness signal staff look at; it must read as
  // a load-bearing piece of the QR card, not a footnote.
  return (
    <View style={styles.liveClockRow}>
      <PulsingDot color={color.brandRose} size={6} />
      <Text variant="heading.sm" style={styles.liveClockText} testID="show-to-staff-live-clock">
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

  // QR blur source.  Two sources (independent paths):
  //   - 'screenshot': iOS post-fact listener fired (Android's FLAG_SECURE
  //     blocks screenshots before this fires).
  //   - 'auto-hide': useAutoHideTimer reached 'hidden' (2 min idle +
  //     10 s warning) — anti-fraud guard for the unattended-phone case.
  type BlurReason = 'screenshot' | 'auto-hide'
  const [blurReason, setBlurReason] = useState<BlurReason | null>(null)
  const blurred = blurReason !== null

  // Logo error tracking — graceful fallback to initials when remote
  // image fails to load.  Reset whenever the URL changes so a stale
  // error from URL-A doesn't permanently force initials when the
  // component is reused with URL-B.
  const [logoError, setLogoError] = useState(false)
  useEffect(() => { setLogoError(false) }, [merchantLogoUrl])
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

  // Auto-dismiss after validated transition.  Reduced motion routes
  // straight through onDone.  onValidated fires ONCE per session.
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

  // Identity-zone padding honours the device safe-area top so the
  // navy bg absorbs the notch / Dynamic Island clearance.
  const identityZonePaddingTop = (insets.top ?? 0) + 12
  // Bottom safe-area on iPhone SE 1st gen is 0 — but on home-bar
  // devices we still want clearance so the Done pill doesn't bleed
  // into the indicator.  Min 12 keeps a visual rhythm even at SE.
  const bottomPad = Math.max((insets.bottom ?? 0) + 8, 12)

  // PR-B T8f brand-correctness fix: brand-rose glow overlay carries
  // the depth/"red glow"; the surface base is SOLID `color.navy`.
  // Mirrors the SuccessPopup pattern shipped at `96401d9`.
  const heroGlowGradient = [
    color.brandRose + '40',  // ~25% alpha at glow centre
    color.brandRose + '1A',  // ~10% mid
    'transparent',
  ] as const

  return (
    <Modal
      visible={visible}
      animationType={reduced ? 'none' : 'slide'}
      presentationStyle="fullScreen"
      onRequestClose={onDone}
    >
      {/* Solid brand-navy base — `color.navy` (#010C35) per
          PRODUCT.md primary palette.  No fabricated 2-stop gradient. */}
      <View style={styles.background}>
        {/* Brand-rose glow overlay carries the "red glow" the brief
            asked for.  Diagonal positioning approximates a soft radial
            since RN ships no native radial.  pointerEvents='none' so
            taps pass through to the tap-surface below. */}
        <LinearGradient
          colors={heroGlowGradient}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.warmGlow}
          pointerEvents="none"
        />

        {/* Identity zone — bigger Redeemo logo (44pt) + wordmark
            (heading.lg).  T8f bump from T8c's 28pt for owner
            "Redeemo icon and logo needs to be bigger".  The X close
            icon was REMOVED per owner direction; dismissal is now
            the bottom Done button. */}
        <View
          style={[styles.identityZone, { paddingTop: identityZonePaddingTop }]}
          testID="show-to-staff-identity-zone"
        >
          <RedeemoLogo size={44} />
          <Text
            variant="heading.lg"
            style={styles.identityWordmark}
            testID="show-to-staff-redeemo-wordmark"
          >
            Redeemo
          </Text>
        </View>

        {/* Tap surface — resets the auto-hide timer on any non-button
            tap.  Wraps the body so taps on the identity zone don't
            accidentally reset the timer. */}
        <Pressable
          style={[styles.bodyTapSurface, { paddingBottom: bottomPad }]}
          onPress={resetTimer}
          accessibilityRole="none"
        >
          {/* Eyebrow — "VERIFIED VOUCHER" in brand-rose.  Reads
              against the navy bg with strong contrast. */}
          <View style={styles.eyebrowBlock}>
            <Text
              variant="label.eyebrow"
              style={styles.eyebrowText}
              testID="show-to-staff-eyebrow"
            >
              Verified Voucher
            </Text>
          </View>

          {/* Voucher info — title (white) + description (white@85%,
              max 2 lines for the no-scroll fit). */}
          <View style={styles.voucherInfoBlock}>
            <Text
              variant="heading.md"
              style={styles.voucherTitle}
              numberOfLines={1}
              ellipsizeMode="tail"
              testID="show-to-staff-voucher-title"
            >
              {voucherTitle}
            </Text>
            {voucherDescription ? (
              <Text
                variant="body.sm"
                style={styles.voucherDescription}
                numberOfLines={2}
                ellipsizeMode="tail"
                testID="show-to-staff-voucher-description"
              >
                {voucherDescription}
              </Text>
            ) : null}
          </View>

          {/* Voucher-type chip — MOVED OUTSIDE the QR card per T8f
              owner direction.  Sits in the upper info zone where it
              reads as voucher metadata, not as part of the live trust
              surface inside the QR card. */}
          <View style={styles.typeChipRow}>
            <View style={styles.typeChip} testID="show-to-staff-type-chip">
              <Text variant="label.eyebrow" style={styles.typeChipText}>
                {voucherTypeLabel(voucherType).toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Compact merchant row — small logo OR initials + name (white)
              + branch (white@70%).  Branch is always rendered so the
              staff sees WHERE the redemption is anchored. */}
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
                  variant="label.lg"
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

          {/* QR card — animated brand-rose border (preserved verbatim)
              wraps a WHITE inner card.  T8f content discipline:
              ONLY the LIVE badge (top), QR code, 4+4 code text, and
              live ticking clock live INSIDE this card.  Voucher-type
              chip and redeemed timestamp moved OUTSIDE. */}
          <LinearGradient
            colors={['#FFFFFF', 'rgba(255,255,255,0.5)', '#FCD34D', '#FFFFFF']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.codeCardBorder}
            testID="show-to-staff-code-card-border"
          >
            <View style={styles.codeCardInner}>
              {/* LIVE badge — single trust-anchor at the top of the
                  QR card.  No voucher-type chip alongside (T8f). */}
              <View style={styles.liveBadgeRow}>
                <View style={styles.liveBadge}>
                  <PulsingDot color={color.brandRose} size={6} />
                  <Text variant="label.eyebrow" style={styles.liveText}>
                    LIVE
                  </Text>
                </View>
              </View>

              {/* QR — blurred when EITHER (a) iOS screenshot listener
                  fired OR (b) auto-hide timer reached 'hidden'.  Tap
                  on the blurred QR clears the blur AND resets the
                  auto-hide timer. */}
              <View style={styles.qrWrapper}>
                <QRCodeBlock
                  value={redemptionCode}
                  size={150}
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
                variant="display.md"
                align="center"
                style={styles.codeValue}
                testID="show-to-staff-code"
              >
                {formattedCode}
              </Text>

              {/* Live clock — bumped prominence per T8f owner
                  direction.  Bigger size (heading.sm 16pt vs T8c's
                  label.lg 14pt) + bold + full white-on-navy
                  contrast on the navy chip background.  This is the
                  genuineness signal — staff trust comes from seeing
                  it tick in real time. */}
              <View style={styles.liveClockChip}>
                <LiveClock active={active} />
              </View>
            </View>
          </LinearGradient>

          {/* Footer info zone — redeemed timestamp + customer row
              (when present).  Moved OUTSIDE the QR card per T8f. */}
          <View style={styles.footerInfo}>
            <View style={styles.redeemedRow} testID="show-to-staff-redeemed-row">
              <Text variant="label.lg" style={styles.redeemedLabel}>
                Redeemed
              </Text>
              <Text variant="label.lg" style={styles.redeemedValue}>
                {redeemedDisplay}
              </Text>
            </View>
            {showCustomerRow ? (
              <View style={styles.customerRow} testID="show-to-staff-customer-row">
                <Text variant="label.lg" style={styles.redeemedLabel}>
                  Customer
                </Text>
                <Text variant="label.lg" style={styles.redeemedValue}>
                  {customerName}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Blur reason banner — surfaces only while blurred AND not
              yet validated.  Distinct copy per source. */}
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

          {/* Validated overlay — savings-green pill replaces the
              redemption code as the load-bearing signal once staff
              has scanned.  Auto-dismisses 2 s after entry. */}
          {isValidated ? (
            <View style={styles.validatedRow}>
              <ShieldCheck size={18} color="#FFFFFF" />
              <Text variant="heading.sm" style={styles.validatedText}>
                Verified by staff at {branchName}
              </Text>
            </View>
          ) : null}

          {/* Auto-hide warning hint — surfaces 10 s before the QR
              hides.  Inline copy below the QR card. */}
          {hideState === 'warning' && !isValidated ? (
            <Text variant="label.md" align="center" style={styles.warningHint}>
              QR will hide in 10 seconds. Tap to keep visible.
            </Text>
          ) : null}

          {/* Spacer pushes the Done button to the bottom of the
              tap-surface column. */}
          <View style={{ flex: 1 }} />

          {/* Done button — T8f single dismissal affordance per owner
              direction.  Replaces the X close icon top-right that
              shipped on T8c.  Full-width pill + white-on-navy
              outlined treatment to read as primary in the navy
              context.  Modal.onRequestClose continues to wire
              hardware back to the same handler. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done"
            testID="show-to-staff-done"
            onPress={() => { lightHaptic(); onDone() }}
            style={({ pressed }) => [
              styles.doneButton,
              pressed && styles.doneButtonPressed,
            ]}
          >
            <Text variant="body.md" style={styles.doneButtonText}>
              Done
            </Text>
          </Pressable>
        </Pressable>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: color.navy,
  },
  warmGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Identity zone — bigger Redeemo branding (T8f).  44pt logo +
  // heading.lg wordmark + 12pt gap.
  identityZone: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[3],
    gap: spacing[3],
  },
  identityWordmark: {
    color: color.onBrand,
    letterSpacing: 0.4,
    fontFamily: 'Lato-Bold',
  },
  bodyTapSurface: {
    flex: 1,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    alignItems: 'stretch',
  },
  eyebrowBlock: {
    alignItems: 'flex-start',
    paddingTop: spacing[2],
  },
  eyebrowText: {
    color: color.brandRose,
  },
  voucherInfoBlock: {
    paddingTop: spacing[1],
    gap: 4,
  },
  voucherTitle: {
    color: color.onBrand,
    fontFamily: 'Lato-Bold',
  },
  voucherDescription: {
    color: 'rgba(255,255,255,0.85)',
  },
  // Type chip row — sits ABOVE the QR card (T8f content discipline).
  typeChipRow: {
    flexDirection: 'row',
    paddingTop: spacing[3],
  },
  typeChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: color.brandRose + 'B3', // ~70% alpha
    backgroundColor: 'rgba(226, 12, 4, 0.10)',
  },
  typeChipText: {
    color: color.onBrand,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  merchantBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
  },
  merchantLogo: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  merchantInitialsCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(226,12,4,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  merchantInitialsText: {
    color: color.onBrand,
    fontFamily: 'Lato-Bold',
  },
  merchantText: {
    flex: 1,
    flexDirection: 'column',
    gap: 2,
  },
  merchantName: {
    color: color.onBrand,
  },
  merchantBranch: {
    color: 'rgba(255,255,255,0.70)',
  },
  // QR card — only border + LIVE + QR + code + clock inside (T8f).
  codeCardBorder: {
    width: '100%',
    borderRadius: radius.xl,
    padding: 3,
    marginTop: spacing[1],
  },
  codeCardInner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
    alignItems: 'center',
    gap: spacing[3],
  },
  liveBadgeRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: spacing[3],
    borderRadius: 20,
    backgroundColor: 'rgba(226,12,4,0.08)',
  },
  liveText: {
    color: color.brandRose,
  },
  qrWrapper: {
    alignItems: 'center',
  },
  codeValue: {
    color: color.navy,
    letterSpacing: 5,
    fontVariant: ['tabular-nums'],
  },
  // Live-clock chip — navy bg + bold heading.sm white text so the
  // ticker reads as the load-bearing genuineness signal (T8f).
  liveClockChip: {
    paddingVertical: 8,
    paddingHorizontal: spacing[4],
    borderRadius: 999,
    backgroundColor: color.navy,
  },
  liveClockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveClockText: {
    color: '#FFFFFF',
    fontFamily: 'Lato-Bold',
    fontVariant: ['tabular-nums'],
  },
  // Footer info — sits BELOW the QR card (T8f content discipline).
  footerInfo: {
    paddingTop: spacing[3],
    gap: spacing[1],
  },
  redeemedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  customerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: spacing[1],
  },
  redeemedLabel: {
    color: 'rgba(255,255,255,0.70)',
  },
  redeemedValue: {
    color: color.onBrand,
    fontFamily: 'Lato-SemiBold',
  },
  validatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: color.savingsGreen,
    marginTop: spacing[3],
  },
  validatedText: {
    color: '#FFFFFF',
    marginLeft: 8,
  },
  warningHint: {
    color: 'rgba(255,255,255,0.75)',
    marginTop: spacing[3],
  },
  blurReasonBanner: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    marginTop: spacing[3],
  },
  blurReasonBannerText: {
    color: color.onBrand,
    textAlign: 'center',
  },
  // Done button — T8f bottom-of-surface dismissal pill.  Outlined
  // white-on-navy treatment so it reads as primary in the navy
  // context without competing with the brand-rose code-card border.
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3] + 2,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginTop: spacing[3],
  },
  doneButtonPressed: {
    opacity: 0.8,
    backgroundColor: 'rgba(255,255,255,0.14)',
    transform: [{ scale: 0.98 }],
  },
  doneButtonText: {
    color: color.onBrand,
    fontFamily: 'Lato-Bold',
    letterSpacing: 0.3,
  },
})
