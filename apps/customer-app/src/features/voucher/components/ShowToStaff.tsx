import React, { useEffect, useRef, useState } from 'react'
import {
  AppState,
  type AppStateStatus,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Tag, Clock, ShieldCheck } from '@/design-system/icons'
import { Text } from '@/design-system/Text'
import { color, radius } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'
import { lightHaptic, successHaptic } from '@/design-system/haptics'
import { PulsingDot } from '@/design-system/motion/PulsingDot'
import { QRCodeBlock } from './QRCodeBlock'
import { formatRedemptionCode } from '../utils/formatRedemptionCode'
import { voucherTypeLabel } from '../utils/voucherTheme'
import { useRedemptionPolling } from '../hooks/useRedemptionPolling'
import { useBrightnessBoost } from '../hooks/useBrightnessBoost'
import { useAutoHideTimer } from '../hooks/useAutoHideTimer'
import { useScreenshotGuard } from '../hooks/useScreenshotGuard'
import type { VoucherType } from '@/lib/api/redemption'

/**
 * Show-to-Staff full-screen surface (M3 Task 13).
 *
 * Visual baseline: `.superpowers/brainstorm/.../voucher-detail-v6.html`
 * Screen 7b. Adapted to current main + the M3 shipped contracts:
 *   - 8-character 4+4 redemption code (formatRedemptionCode).
 *   - QRCodeBlock (Task 9) for the QR + Redeemo R logo overlay.
 *   - PulsingDot (Task 8) for the LIVE badge.
 *   - useRedemptionPolling (Task 10) — `enabled` driven by `visible`,
 *     `paused` driven by AppState !== 'active' so backgrounded time
 *     still consumes the 15-min budget per locked plan §Backgrounding.
 *   - useBrightnessBoost (Task 11) — `active = visible && appActive`.
 *     Restores on background, re-applies on foreground. **Best-effort
 *     and fail-safe** — see BRIGHTNESS_BOOST_ENABLED kill-switch below.
 *   - useAutoHideTimer (Task 12) — `active = visible && appActive`,
 *     `frozen` flips to true on validated phase so the screen pins
 *     open until the auto-dismiss completes.
 *
 * Validated transition: when polling phase flips to 'validated',
 * the surface shows a "Verified by staff" overlay and auto-dismisses
 * after AUTO_DISMISS_MS. Reduced motion calls onDone instantly.
 *
 * Customer name (M3 §U1): `customerName=""` is the locked M3 default.
 * The Customer info row is suppressed when the prop is empty —
 * rendering an empty value with the label visible would mislead
 * staff. Forward-compat: passing a real name renders the row.
 *
 * Anti-fraud screenshot guard: NOT in this task — Task 15 wires
 * `useScreenshotGuard` and the blurred-state recovery on top of
 * the QRCodeBlock's `blurred` prop.
 *
 * **Brightness-boost kill-switch (locked owner direction 2026-05-08):**
 * Brightness boost is best-effort and fail-safe — it MUST NOT affect
 * QR or manual-code rendering, and the surface MUST work without it.
 * If device QA surfaces instability (stuck brightness, hangs,
 * permission edge-cases on any platform), flip the constant below
 * to `false` to disable the boost without touching anything else.
 * The QR, code, polling, auto-hide, AppState wiring, validated
 * transition, and Done button are all independent of brightness.
 *
 * The Task 11 `useBrightnessBoost` hook is itself fail-safe — every
 * Brightness API call is wrapped in try/catch, and the unmount
 * cleanup is guarded by a "did we capture a prior value" check.
 * The kill-switch here is the second layer: a way to suppress the
 * call entirely without redeploying the hook.
 */

const AUTO_DISMISS_MS = 2_000

/**
 * Kill-switch for the brightness boost. Default: true (boost engaged).
 * Flip to `false` to ship a build that disables brightness boost
 * entirely — useful as a fast remediation if device QA surfaces
 * instability. The QR, manual-code display, and rest of the surface
 * are unaffected.
 */
const BRIGHTNESS_BOOST_ENABLED = true

/**
 * Kill-switch for the screenshot anti-fraud guard (M3 Task 15).
 * Default: true. Same fail-safe spirit as BRIGHTNESS_BOOST_ENABLED —
 * if `expo-screen-capture` misbehaves on a specific device or
 * platform version, flip to `false` to disable the guard entirely
 * without affecting QR/manual-code rendering, polling, validated
 * transition, auto-hide, or AppState wiring.
 *
 * iOS path is "after-the-fact" so disabling means: no banner,
 * no telemetry. Android path is FLAG_SECURE so disabling means:
 * screenshots succeed silently. Both are best-effort; the QR
 * + manual code never depend on either.
 */
const SCREENSHOT_GUARD_ENABLED = true

type Props = {
  visible: boolean
  redemptionCode: string
  voucherTitle: string
  voucherType: VoucherType
  merchantName: string
  branchName: string
  /** M3 lock — see §U1 in deferred-followups. Pass empty string. */
  customerName: string
  /** ISO timestamp when the redemption was created. */
  redeemedAt: string
  onDone: () => void
  /** Fires ONCE when polling reaches `phase === 'validated'` —
   *  before the 2 s auto-dismiss. The parent uses this signal to
   *  flip RedemptionDetailsCard's "Validated by staff" pill on
   *  the post-dismiss return-to-VoucherDetail render (PR #49 review
   *  fix — without this, the pill stayed hidden until a later
   *  refetch path because the in-memory `lastRedemption` branch
   *  hardcoded `isValidated: false`). */
  onValidated?: () => void
}

// Hoisted to module scope so the formatters are constructed once at
// module-load time, not on every render. Locale + timezone are
// constant; numeric parts only (Hermes-CLDR-robust per project
// convention — see reference_london_clock_helper memory + CLAUDE.md).
const LIVE_CLOCK_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

// Same options minus seconds — used for the Redeemed info-row in the
// glassmorphic card (only-once-per-render but still cheaper to share).
const REDEEMED_AT_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function LiveClock({ active }: { active: boolean }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [active])

  // en-GB short month is reliably available; date format yields
  // e.g. "08 May 2026, 14:24:38" — split into date · time for the
  // locked v6 visual.
  const parts = LIVE_CLOCK_FORMATTER.format(now).split(', ')
  const date = parts[0] ?? ''
  const time = parts[1] ?? ''
  const display = date && time ? `${date} · ${time}` : LIVE_CLOCK_FORMATTER.format(now)

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
  merchantName,
  branchName,
  customerName,
  redeemedAt,
  onDone,
  onValidated,
}: Props) {
  const motionScale = useMotionScale()
  const reduced = motionScale === 0

  // AppState pause — locked plan §Backgrounding: surface stays mounted,
  // polling/timer pause on blur, brightness restores; all resume on
  // focus. `appActive` mirrors `AppState.currentState === 'active'`.
  const [appActive, setAppActive] = useState(true)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      setAppActive(s === 'active')
    })
    return () => sub.remove()
  }, [])

  const active = visible && appActive

  // QR blur source — null when QR is fully visible, otherwise tracks
  // WHY the QR is blurred so the surface can render the right banner
  // copy. Both sources clear on QRCodeBlock's onShow (tap-to-show).
  // - 'screenshot': iOS screenshot listener fired (Android's FLAG_SECURE
  //   blocks screenshots before this fires; in practice 'screenshot' is
  //   iOS-only).
  // - 'auto-hide': useAutoHideTimer reached the 'hidden' state (2 min
  //   idle + 10 s warning). Anti-fraud guard for the "QR sitting on a
  //   coffee-shop table for 30 minutes" case.
  type BlurReason = 'screenshot' | 'auto-hide'
  const [blurReason, setBlurReason] = useState<BlurReason | null>(null)
  const blurred = blurReason !== null

  // Building-block hooks
  const poll = useRedemptionPolling(redemptionCode, {
    enabled: visible,
    paused:  !appActive,
  })
  // Brightness boost is gated by the kill-switch above. The hook itself
  // is fail-safe (try/catch around every Brightness API call) but
  // turning the call off entirely is the fastest remediation path if
  // anything goes wrong on a specific device.
  useBrightnessBoost(BRIGHTNESS_BOOST_ENABLED && active)
  const { state: hideState, resetTimer } = useAutoHideTimer({
    active,
    frozen: poll.phase === 'validated',
  })
  // Screenshot guard — best-effort. iOS post-fact listener; Android
  // FLAG_SECURE. See `useScreenshotGuard` (Task 14) for the full
  // contract. `active` mirrors the same gating as brightness/auto-hide
  // so the guard is only engaged while the surface is visible AND the
  // app is foregrounded.
  useScreenshotGuard(redemptionCode, {
    active: SCREENSHOT_GUARD_ENABLED && active,
    onBannerShown: () => setBlurReason('screenshot'),
  })

  // Auto-hide → blur. When useAutoHideTimer reaches 'hidden' (2 min
  // idle + 10 s warning), flip the QR to blurred so it isn't sitting
  // unattended on a screen. Independent of the screenshot guard's
  // path — a user who ignores the 10 s warning still gets the QR
  // hidden at 2 min. Validated phase freezes the timer (locked plan
  // §M3b Task 12) so this branch is unreachable when validated.
  useEffect(() => {
    if (hideState === 'hidden') setBlurReason('auto-hide')
  }, [hideState])

  // Auto-dismiss after validated transition. Reduced motion routes
  // straight through onDone (no 2s wait — the surface is no longer
  // load-bearing once validated). `onDone` and `onValidated` are
  // captured in refs so unstable parent closures don't re-arm the
  // 2 s timer or re-fire the validated callback on every render
  // (issue from PR #49 review). `onValidated` fires ONCE per
  // validated transition — guarded by a session-scoped ref so a
  // re-mount during the auto-dismiss window doesn't double-fire.
  const onDoneRef = useRef(onDone)
  const onValidatedRef = useRef(onValidated)
  const validatedFiredRef = useRef(false)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])
  useEffect(() => { onValidatedRef.current = onValidated }, [onValidated])
  useEffect(() => {
    if (poll.phase !== 'validated') return
    successHaptic()
    // Fire onValidated once per session — drives the parent's
    // validated-pill override (PR #49 review fix). Guarded by ref
    // so a parent re-render between phase flip and auto-dismiss
    // doesn't double-fire.
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
  // ISO `redeemedAt` → "08 May 2026, 14:24" en-GB / Europe/London
  // (formatter hoisted to module scope above).
  const redeemedDisplay = REDEEMED_AT_FORMATTER.format(new Date(redeemedAt))

  return (
    <Modal
      visible={visible}
      animationType={reduced ? 'none' : 'slide'}
      presentationStyle="fullScreen"
      onRequestClose={onDone}
    >
      <LinearGradient
        colors={['#E20C04', '#C50A03', '#B80902', '#E84A00']}
        locations={[0, 0.3, 0.5, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={styles.background}
      >
        <Pressable
          style={styles.tapResetSurface}
          onPress={resetTimer}
          accessibilityRole="none"
        >
          <View style={styles.column}>
            {/* Voucher type strip */}
            <View style={styles.typeStrip}>
              <Tag size={14} color="#FFFFFF" />
              <Text variant="label.md" style={styles.typeText}>
                {voucherTypeLabel(voucherType)}
              </Text>
            </View>

            {/* Voucher name + merchant·branch */}
            <Text variant="display.sm" align="center" style={styles.voucherName}>
              {voucherTitle}
            </Text>
            <Text variant="body.sm" align="center" style={styles.merchantBranch}>
              {merchantName} · {branchName}
            </Text>

            {/* Animated code card — gradient border deviation from v6:
                the static gradient ships in M3; animated rotating
                background-position is a deferred polish item. The
                "alive" anti-fraud signals (LIVE pulse + live datetime)
                already animate. */}
            <LinearGradient
              colors={['#FFFFFF', 'rgba(255,255,255,0.5)', '#FCD34D', '#FFFFFF']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.codeCardBorder}
            >
              <View style={styles.codeCardInner}>
                {/* LIVE badge */}
                <View style={styles.liveRow}>
                  <View style={styles.liveBadge}>
                    <PulsingDot color={color.brandRose} size={7} />
                    <Text variant="label.eyebrow" style={styles.liveText}>
                      LIVE
                    </Text>
                  </View>
                </View>

                {/* Code value (4+4) */}
                <Text variant="display.lg" align="center" style={styles.codeValue}>
                  {formattedCode}
                </Text>

                {/* QR — blurred when EITHER (a) the screenshot guard
                    listener fired on iOS, OR (b) the auto-hide timer
                    reached the 'hidden' state (2 min idle + 10 s
                    warning). User tap on the blurred QR
                    (QRCodeBlock.onShow) clears the blur AND resets
                    the auto-hide timer so the QR re-arms. */}
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

                {/* Live date/time ticker — anti-fraud signal */}
                <View style={styles.liveDatetimeWrapper}>
                  <LiveClock active={active} />
                </View>
              </View>
            </LinearGradient>

            {/* Glassmorphic info card */}
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

            {/* Blur reason banner — surfaces only while blurred AND
                not yet validated. Distinct copy per source so the user
                understands why the QR hid. Tapping the QR clears the
                blur via onShow + resets the auto-hide timer. */}
            {blurReason === 'screenshot' && !isValidated ? (
              <View style={styles.blurReasonBanner}>
                <Text variant="label.md" style={styles.blurReasonBannerText}>
                  Screenshot taken. Staff verify only the live screen. Tap the QR to show again.
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

            {/* Validated overlay — sits inside the column so it doesn't
                cover the QR; the v6 mockup didn't spec this state but
                D7 locks "show a short validated state, ~2s, then route
                back". Implemented as an inline status badge above
                Done. */}
            {isValidated ? (
              <View style={styles.validatedRow}>
                <ShieldCheck size={18} color="#FFFFFF" />
                <Text variant="heading.sm" style={styles.validatedText}>
                  Verified by staff at {branchName}
                </Text>
              </View>
            ) : null}

            {/* Auto-hide warning hint. The v6 mockup didn't spec this
                state; we surface a small text hint per the locked
                Task 12 contract. The actual blur-the-QR behaviour
                lives on QRCodeBlock's `blurred` prop and lands with
                Task 15. */}
            {hideState === 'warning' && !isValidated ? (
              <Text variant="label.md" align="center" style={styles.warningHint}>
                QR will hide in 10 seconds. Tap to keep visible.
              </Text>
            ) : null}

            {/* Done button (glass style) */}
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
          </View>
        </Pressable>
      </LinearGradient>
    </Modal>
  )
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  tapResetSurface: {
    flex: 1,
  },
  column: {
    flex: 1,
    paddingTop: 54,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  typeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    marginBottom: 8,
  },
  typeText: {
    marginLeft: 8,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  voucherName: {
    color: '#FFFFFF',
    marginBottom: 4,
  },
  merchantBranch: {
    color: 'rgba(255,255,255,0.78)',
    marginBottom: 24,
  },
  codeCardBorder: {
    width: '100%',
    borderRadius: 22,
    padding: 3,
    marginBottom: 20,
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
  codeValue: {
    color: color.navy,
    letterSpacing: 6,
    fontVariant: ['tabular-nums'],
    marginBottom: 20,
  },
  qrWrapper: {
    alignItems: 'center',
    marginBottom: 16,
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
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    color: 'rgba(255,255,255,0.65)',
  },
  infoValue: {
    color: '#FFFFFF',
  },
  validatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(22, 163, 74, 0.20)',
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.35)',
    marginBottom: 12,
  },
  validatedText: {
    color: '#FFFFFF',
    marginLeft: 8,
  },
  warningHint: {
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 12,
  },
  blurReasonBanner: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    marginBottom: 12,
  },
  blurReasonBannerText: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
  doneBtn: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
  },
  doneBtnPressed: {
    transform: [{ scale: 0.97 }],
  },
  doneBtnText: {
    color: '#FFFFFF',
  },
})
