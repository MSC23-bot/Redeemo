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
 * Show-to-Staff full-screen surface — navy-gradient compact trust
 * surface (PR-B T8c, locked 2026-05-09 from device-QA blockers).
 *
 * **Register shift from PR-B T1 vertical receipt.** T1 introduced a
 * cream "official document" / Apple Wallet pass register that read
 * well in light environments but on-device QA found three blockers:
 *
 *   1. Layout DID NOT FIT — content clipped at the bottom of iPhone SE
 *      1st gen (375×667) at default Dynamic Type. The page is NOT
 *      scrollable by product direction, so a no-scroll fit is required.
 *   2. Done button + voucher description weren't visible on the QA
 *      device because they were pushed offscreen by the cream layout.
 *   3. The cream document register blended too closely with normal app
 *      surfaces — staff-trust signal needed to read distinctly.
 *
 * T8c shifts to a navy gradient with a subtle warm brand-rose glow:
 * outermost layer is `['#010C35', '#1F2A55']` (matches NAVY_GRADIENT
 * used on ActionRow Contact button cross-surface), with a second
 * brand-rose-tinted gradient overlaid at low alpha to create a "warm
 * glow behind the QR" feel (RN doesn't ship radial gradients native).
 * Layout is compressed to a single screen at default Dynamic Type
 * with NO ScrollView — every section sized so the total fits 667pt
 * minus safe-areas. The X close icon top-right is the only dismissal
 * affordance (matches the locked PR-A §C decision; no bottom Done
 * button — see brief §"Done button / X close" interpretation (a)).
 *
 * **Layout fit math (iPhone SE 1st gen, 375 × 667pt, default DT):**
 *   safe-area top (20) + 16 padding              =  36
 *   compact header (28pt logo + close + 12 pad)  =  60
 *   eyebrow + voucher title (heading.md 18/24)   =  44
 *   voucher description (body.sm × 2 lines max)  =  42
 *   merchant row (single line, tight)            =  44
 *   QR card border + inner pads + QR(200) + ...  = 360
 *   safe-area bottom                             =   0
 *   ----------------------------------------------------
 *   total                                        ≈ 586  (fits 667 ✓)
 *
 * **Locked / preserved verbatim from M3 (anti-fraud surfaces):**
 *   - 8-character 4+4 redemption code (formatRedemptionCode).
 *   - QRCodeBlock — QR + Redeemo R logo overlay + blur. QR remains on
 *     a WHITE inner card so QR-scanner contrast (black-on-white) stays
 *     readable under the navy gradient bg.
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
 *
 * **PR-B T1 props preserved:**
 *   - `voucherDescription: string | null` — voucher description block
 *     beneath the title. Truncated to 2 lines (was 3 in T1) so the
 *     navy-gradient surface fits without scroll on 375×667.
 *   - `merchantLogoUrl: string | null` — 36 × 36 logo (was 48×48 in T1
 *     — compressed for the no-scroll fit), OR initials fallback in a
 *     navy-tint circle, OR onError fallback to initials.
 *
 * **Customer name (M3 §U1):** `customerName=""` is the locked M3
 * default. We retain the prop and the suppression behaviour for
 * forward-compat, but the Customer info row is no longer rendered as a
 * full-width row in T8c — the navy-gradient compact register replaces
 * the M3 "info card" (Voucher Type / Redeemed / Customer rows) with a
 * lean Voucher-Type chip + an inline Redeemed timestamp inside the QR
 * card area.
 *
 * **Brightness-boost kill-switch (locked owner direction 2026-05-08):**
 * Brightness boost is best-effort and fail-safe — flipping
 * `BRIGHTNESS_BOOST_ENABLED` to `false` disables the boost without
 * touching anything else. The QR, code, polling, auto-hide, AppState
 * wiring, and validated transition are all independent.
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

/**
 * Navy gradient — base trust-surface treatment. Mirrors
 * NAVY_GRADIENT in ActionRow.tsx so cross-surface visual identity
 * stays consistent (Contact button, Review prompt, Success popup).
 */
const NAVY_GRADIENT = ['#010C35', '#1F2A55'] as const

type Props = {
  visible: boolean
  redemptionCode: string
  voucherTitle: string
  voucherType: VoucherType
  /** PR-B T1 — voucher.description (string | null). Renders a 2-line
   *  ellipsis block beneath the voucher title when non-null.
   *  (T1 used 3 lines; T8c compresses to 2 for the no-scroll fit.) */
  voucherDescription: string | null
  merchantName: string
  /** PR-B T1 — voucher.merchant.logoUrl (string | null). Renders a
   *  36 × 36 logo when non-null, collapses to merchant initials in a
   *  navy-tint circle when null OR when the `<Image onError>` fires.
   *  (T1 used 48×48; T8c compresses to 36 for the no-scroll fit.) */
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
      <Clock size={14} color={color.brandRose} />
      <Text variant="label.lg" style={styles.liveDatetimeText}>
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

  // Identity-zone padding honours the device safe-area top so the
  // navy gradient absorbs the notch / Dynamic Island clearance.
  const identityZonePaddingTop = (insets.top ?? 0) + 16
  // Bottom safe-area on iPhone SE 1st gen is 0 — but on home-bar
  // devices we still want clearance so the QR card doesn't bleed into
  // the indicator. Min 12 keeps a visual rhythm even at SE.
  const bottomPad = Math.max((insets.bottom ?? 0) + 8, 12)

  return (
    <Modal
      visible={visible}
      animationType={reduced ? 'none' : 'slide'}
      presentationStyle="fullScreen"
      onRequestClose={onDone}
    >
      {/* Outermost layer — navy gradient trust surface. Replaces the
          T1 cream document register; matches NAVY_GRADIENT used on
          ActionRow Contact button + ReviewPromptCard + SuccessPopup
          for cross-surface visual consistency. */}
      <LinearGradient
        colors={NAVY_GRADIENT}
        locations={[0, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.background}
      >
        {/* Subtle warm brand-rose glow overlay — positioned diagonally
            from the top-right toward the QR card area. RN doesn't have
            radial gradients; we approximate the "glow behind the QR"
            feel with a low-alpha linear gradient angled into the QR
            position. pointerEvents='none' so taps pass through to the
            tap-surface below. */}
        <LinearGradient
          colors={[
            'rgba(226,12,4,0.18)',
            'rgba(232,74,0,0.12)',
            'rgba(1,12,53,0)',
          ]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.warmGlow}
          pointerEvents="none"
        />

        {/* Compact identity zone — Redeemo logo (left, prominent at
            28pt) + close icon (right). Replaces the T1 cream band so
            the navy gradient flows uninterrupted; the prominent
            Redeemo logo carries identity that the dropped footer used
            to hold. */}
        <View
          style={[styles.identityZone, { paddingTop: identityZonePaddingTop }]}
          testID="show-to-staff-identity-zone"
        >
          <View style={styles.identityZoneLeft}>
            <RedeemoLogo size={28} />
            <Text
              variant="heading.md"
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
            <X size={20} color={color.onBrand} />
          </Pressable>
        </View>

        {/* Tap surface — resets the auto-hide timer on any non-button
            tap. Wraps the body so taps on the identity zone X-icon
            don't accidentally reset the timer. */}
        <Pressable
          style={[styles.bodyTapSurface, { paddingBottom: bottomPad }]}
          onPress={resetTimer}
          accessibilityRole="none"
        >
          {/* Eyebrow — "VERIFIED VOUCHER" in brand-rose. Reads
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
              max 2 lines for the no-scroll fit). The description was
              missing from device QA on T1; T8c keeps it visible. */}
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

          {/* Compact merchant row — small logo OR initials + name (white)
              + branch (white@70%). Logo size dropped from 48 to 36 for
              fit. */}
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
                variant="label.md"
                style={styles.merchantBranch}
                numberOfLines={1}
                testID="show-to-staff-branch"
              >
                {branchName}
              </Text>
            </View>
          </View>

          {/* QR anchor — animated brand-rose border (preserved verbatim)
              wraps a WHITE inner card so QR contrast (black-on-white)
              stays scanner-readable. The "alive" anti-fraud signals
              (LIVE pulse + live datetime ticker) animate inside this
              card. */}
          <LinearGradient
            colors={['#FFFFFF', 'rgba(255,255,255,0.5)', '#FCD34D', '#FFFFFF']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.codeCardBorder}
            testID="show-to-staff-code-card-border"
          >
            <View style={styles.codeCardInner}>
              {/* Top row: voucher-type chip (left) + LIVE badge (right).
                  Folds the M3 "Voucher Type" info row into a compact
                  chip on the QR card. Customer name still suppressed
                  on empty (M3 §U1) — no row visible at all. */}
              <View style={styles.topRow}>
                <View style={styles.typeChip}>
                  <Text variant="label.md" style={styles.typeChipText}>
                    {voucherTypeLabel(voucherType)}
                  </Text>
                </View>
                <View style={styles.liveBadge}>
                  <PulsingDot color={color.brandRose} size={6} />
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
                variant="display.md"
                align="center"
                style={styles.codeValue}
                testID="show-to-staff-code"
              >
                {formattedCode}
              </Text>

              {/* Bottom row: live datetime ticker + redeemed timestamp.
                  Folds the M3 "Redeemed" info row into a compact line
                  alongside the LIVE clock. Anti-fraud signal — LIVE
                  clock ticks every second per the regression pin. */}
              <View style={styles.cardFooterRow}>
                <LiveClock active={active} />
                <View style={styles.redeemedInline}>
                  <Text variant="label.md" style={styles.redeemedLabel}>
                    Redeemed {redeemedDisplay}
                  </Text>
                </View>
              </View>
              {showCustomerRow ? (
                <View style={styles.customerInline}>
                  <Text variant="label.md" style={styles.customerLabel}>
                    Customer
                  </Text>
                  <Text variant="label.md" style={styles.customerValue}>
                    {customerName}
                  </Text>
                </View>
              ) : null}
            </View>
          </LinearGradient>

          {/* Blur reason banner — surfaces only while blurred AND not
              yet validated. Distinct copy per source. */}
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
              has scanned. Auto-dismisses 2 s after entry. */}
          {isValidated ? (
            <View style={styles.validatedRow}>
              <ShieldCheck size={18} color="#FFFFFF" />
              <Text variant="heading.sm" style={styles.validatedText}>
                Verified by staff at {branchName}
              </Text>
            </View>
          ) : null}

          {/* Auto-hide warning hint — surfaces 10 s before the QR
              hides. Inline copy below the QR card. */}
          {hideState === 'warning' && !isValidated ? (
            <Text variant="label.md" align="center" style={styles.warningHint}>
              QR will hide in 10 seconds. Tap to keep visible.
            </Text>
          ) : null}
        </Pressable>

      </LinearGradient>
    </Modal>
  )
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  warmGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  identityZone: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingBottom: 8,
    minHeight: 48,
  },
  identityZoneLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  identityWordmark: {
    color: color.onBrand,
    letterSpacing: 0.4,
    fontFamily: 'Lato-Bold',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  closeButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.20)',
    transform: [{ scale: 0.96 }],
  },
  bodyTapSurface: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    alignItems: 'stretch',
  },
  eyebrowBlock: {
    alignItems: 'flex-start',
  },
  eyebrowText: {
    color: color.brandRose,
  },
  voucherInfoBlock: {
    paddingTop: 4,
    gap: 4,
  },
  voucherTitle: {
    color: color.onBrand,
    fontFamily: 'Lato-Bold',
  },
  voucherDescription: {
    color: 'rgba(255,255,255,0.85)',
  },
  merchantBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 10,
    paddingBottom: 10,
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
    gap: 1,
  },
  merchantName: {
    color: color.onBrand,
  },
  merchantBranch: {
    color: 'rgba(255,255,255,0.70)',
  },
  codeCardBorder: {
    width: '100%',
    borderRadius: 22,
    padding: 3,
    marginTop: 4,
  },
  codeCardInner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  topRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  typeChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(1,12,53,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(1,12,53,0.10)',
  },
  typeChipText: {
    color: color.navy,
    fontFamily: 'Lato-SemiBold',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(226,12,4,0.08)',
  },
  liveText: {
    marginLeft: 6,
    color: color.brandRose,
  },
  qrWrapper: {
    alignItems: 'center',
    marginBottom: 10,
  },
  codeValue: {
    color: color.navy,
    letterSpacing: 5,
    fontVariant: ['tabular-nums'],
    marginBottom: 10,
  },
  cardFooterRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    borderStyle: 'dashed',
  },
  liveDatetimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDatetimeText: {
    marginLeft: 6,
    color: color.navy,
    fontVariant: ['tabular-nums'],
  },
  redeemedInline: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  redeemedLabel: {
    color: color.text.tertiary,
  },
  customerInline: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  customerLabel: {
    color: color.text.secondary,
  },
  customerValue: {
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
    color: 'rgba(255,255,255,0.75)',
    marginTop: 12,
  },
  blurReasonBanner: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    marginTop: 12,
  },
  blurReasonBannerText: {
    color: color.onBrand,
    textAlign: 'center',
  },
})
