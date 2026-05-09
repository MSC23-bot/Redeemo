import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  AppState,
  type AppStateStatus,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Lock } from 'lucide-react-native'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { PulsingDot } from '@/design-system/motion/PulsingDot'
import { Text } from '@/design-system/Text'
import { color, opacity, radius, spacing } from '@/design-system/tokens'
import { errorHaptic, lightHaptic } from '@/design-system/haptics'
import { useRedemptionLockout } from '../hooks/useRedemptionLockout'
import type { UseRedeemError } from '../hooks/useRedeem'

const PIN_LENGTH = 4

type Props = {
  visible: boolean
  onDismiss: () => void
  /** Fires when 4 digits entered. Caller invokes useRedeem.mutate. */
  onSubmit: (pin: string) => void
  merchantName: string
  branchName: string | null
  /**
   * Merchant logo URL from `voucher.merchant.logoUrl`. Null falls back
   * to a text-only header. Added 2026-05-09 polish pass (PR-A A1).
   * Image-load errors also collapse to the text-only header.
   */
  merchantLogoUrl: string | null
  /** From useRedeem.isPending — disables submit + clears between attempts. */
  isLoading: boolean
  /** Latest typed RedemptionError or NULL_BRANCH; null when idle. */
  error: UseRedeemError | null
}

/**
 * Branch PIN entry sheet — Voucher Detail M2.
 *
 * Visual contract: v4 mockup §PIN entry.
 *   • Bottom sheet, 4×54×60 PIN boxes with 12px gap.
 *   • Active box: rose border + soft ring; filled: rose border + white bg.
 *   • Wrong PIN: shake (±6 / ±3 px, 400ms ease-in-out) + clear digits +
 *     "Wrong PIN · X attempts remaining" inline error bar.
 *   • Lockout: countdown card with mm:ss; submit deeply disabled.
 *   • Disclaimer banner above submit. Brand-gradient submit button.
 *
 * Abuse-prevention contract:
 *   • PIN never logged (no console.log of pin / digits / error.details).
 *   • PIN cleared on app background (AppState listener) and on dismiss.
 *   • Auto-submits on 4th digit ONCE per digit-set (submittedRef guard).
 *   • Submit deeply disabled while loading or locked out.
 */
export function PinEntrySheet({
  visible,
  onDismiss,
  onSubmit,
  merchantName,
  branchName,
  merchantLogoUrl,
  isLoading,
  error,
}: Props) {
  const [digits, setDigits] = useState('')
  const inputRef = useRef<TextInput>(null)
  const submittedRef = useRef(false)
  const [logoError, setLogoError] = useState(false)
  const showLogo = merchantLogoUrl !== null && !logoError

  // Lockout countdown — driven only when error is PIN_RATE_LIMIT_EXCEEDED.
  // Re-keying the hook (via component remount of the lockout-only branch)
  // happens implicitly because `retryAfter` is read once on first PIN_RATE
  // error; the hook treats the deadline as immutable for its lifetime.
  const lockoutSeconds =
    error && error.code === 'PIN_RATE_LIMIT_EXCEEDED' ? error.retryAfter : null
  const lockout = useRedemptionLockout(lockoutSeconds)
  const isLocked = lockout.isLocked

  // Defensive read: at runtime `error` MIGHT NOT match the static type
  // (e.g. backend predates PR #43 and didn't send `remainingAttempts`,
  // or `redemptionApi`'s Zod parse failed and re-threw the raw
  // ApiClientError which has `.code === 'INVALID_PIN'` but no
  // `.remainingAttempts`). Treat anything that isn't a finite number
  // as "missing" → render fallback copy instead of an empty counter.
  const rawAttempts =
    error && (error as { code: string }).code === 'INVALID_PIN'
      ? (error as { remainingAttempts?: unknown }).remainingAttempts
      : null
  const remainingAttempts =
    typeof rawAttempts === 'number' && Number.isFinite(rawAttempts)
      ? rawAttempts
      : null
  const showInvalidPinBar =
    (error as { code?: string } | null)?.code === 'INVALID_PIN' && !isLocked

  // PR #44 review fix #3 — surface the other 6 backend error codes the
  // backend can return. Without this, the user types a PIN, hits an
  // ineligibility error (e.g. PIN_NOT_CONFIGURED), and the sheet just
  // sits there with no feedback. Each code gets a distinct UX message
  // so the user knows why the request was rejected and what to do next.
  type BackendErrorBanner = { title: string; body: string }
  function backendErrorBanner(): BackendErrorBanner | null {
    if (!error) return null
    switch (error.code) {
      case 'PIN_NOT_CONFIGURED':
        return {
          title: 'Branch PIN not set up',
          body:
            "This branch hasn't configured its Redeemo PIN yet. Ask the merchant or branch manager to set it in their merchant portal — or contact Redeemo support if it's already set.",
        }
      case 'BRANCH_UNAVAILABLE':
        return {
          title: 'Branch unavailable',
          body:
            'This branch is no longer available for redemption. Try a different branch or check back later.',
        }
      case 'BRANCH_MERCHANT_MISMATCH':
        return {
          title: 'Branch mismatch',
          body:
            "This branch doesn't belong to this voucher's merchant. Please reopen the branch picker and try again.",
        }
      case 'PHONE_NOT_VERIFIED':
        return {
          title: 'Verify your phone',
          body:
            'Your phone number must be verified before you can redeem vouchers. Open the Profile tab to verify.',
        }
      case 'SUBSCRIPTION_REQUIRED':
        return {
          title: 'Subscription required',
          body:
            'You need an active subscription to redeem vouchers. Tap "Maybe later" and re-open the voucher to subscribe.',
        }
      case 'VOUCHER_NOT_FOUND':
        return {
          title: 'Voucher unavailable',
          body:
            "This voucher isn't available for redemption right now — it may have expired or been removed by the merchant.",
        }
      default:
        return null
    }
  }
  const errorBanner = backendErrorBanner()

  // ── Shake animation on wrong PIN ────────────────────────────────────
  const shake = useSharedValue(0)
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }))

  useEffect(() => {
    if (error?.code !== 'INVALID_PIN') return
    errorHaptic()
    shake.value = withSequence(
      withTiming(6, { duration: 50, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
      withTiming(-6, { duration: 50, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
      withTiming(3, { duration: 50, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
      withTiming(-3, { duration: 50, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
      withTiming(0, { duration: 50, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
    )
    // Clear digits AFTER the shake is in flight so the user sees their
    // wrong digits briefly. submittedRef released so a fresh 4th digit
    // can re-fire onSubmit.
    setDigits('')
    submittedRef.current = false
    // Re-open the keypad after a wrong PIN.  Without this the
    // keyboard dismisses on the digit-clear (RN behaviour when a
    // controlled input's value goes empty) and the user has no
    // obvious way to bring it back — the visible PIN boxes are
    // <View>s, not pressables.  setTimeout matches the visibility-
    // effect pattern below; the focus call is also defended by the
    // tap-to-refocus Pressable around pinRow.  On-device QA
    // 2026-05-09.
    const t = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [error, shake])

  // ── Reset on visibility change + AppState background ─────────────────
  useEffect(() => {
    if (!visible) {
      setDigits('')
      submittedRef.current = false
    } else {
      // Focus the hidden input so the keypad opens.
      const t = setTimeout(() => inputRef.current?.focus(), 100)
      return () => clearTimeout(t)
    }
  }, [visible])

  // PIN must NEVER persist across app-background. Clear on background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s !== 'active') {
        setDigits('')
        submittedRef.current = false
      }
    })
    return () => sub.remove()
  }, [])

  // ── Auto-submit on 4th digit ────────────────────────────────────────
  const handleChange = useCallback(
    (raw: string) => {
      if (isLoading || isLocked) return
      // Strip non-digits + cap at 4. iOS / Android keypads sometimes deliver
      // extra characters; defensive normalization.
      const cleaned = raw.replace(/\D/g, '').slice(0, PIN_LENGTH)
      setDigits(cleaned)
      if (cleaned.length === PIN_LENGTH && !submittedRef.current) {
        submittedRef.current = true
        lightHaptic()
        onSubmit(cleaned)
      }
    },
    [isLoading, isLocked, onSubmit],
  )

  const handleManualSubmit = useCallback(() => {
    if (isLoading || isLocked) return
    if (digits.length !== PIN_LENGTH) return
    if (submittedRef.current) return
    submittedRef.current = true
    lightHaptic()
    onSubmit(digits)
  }, [digits, isLoading, isLocked, onSubmit])

  const submitDisabled =
    digits.length !== PIN_LENGTH || isLoading || isLocked

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      accessibilityLabel="Enter Branch PIN"
    >
      <View testID="pin-entry-sheet">
        {/* Merchant + branch line — anchors what the user is redeeming.
            Horizontal layout (2026-05-09 density refinement): 48×48
            logo on the left + stacked merchant name/branch on the
            right.  Reduces vertical height at the top of the sheet
            so it doesn't crowd the screen. Collapses to text-only
            (still horizontally centered) on null URL or image-load
            error. */}
        <View style={styles.headerRow}>
          <View style={styles.headerInner}>
            {showLogo ? (
              <Image
                testID="pin-merchant-logo"
                accessibilityLabel={`${merchantName} logo`}
                source={{ uri: merchantLogoUrl ?? undefined }}
                style={styles.merchantLogo}
                onError={() => setLogoError(true)}
              />
            ) : null}
            <View style={styles.headerText}>
              <Text variant="body.md" style={styles.merchantLine}>
                {merchantName}
              </Text>
              {branchName ? (
                <Text variant="body.sm" style={styles.branchLine}>
                  {branchName}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Title (PR-B T8m, impeccable pass) — Mustica Pro Semibold
            display.sm 22pt with tight tracking (-0.3) per DESIGN.md
            "Mustica-for-Display Rule".  This sheet is the gateway
            moment between branch confirmation and redemption; the
            display tier matches the surface importance.  Was
            heading.md (Lato Semibold 18) + fontWeight 800 override
            (the override doesn't synthesize cleanly on iOS Lato). */}
        <Text variant="display.sm" style={styles.title}>
          Enter Branch PIN
        </Text>
        {/* Subtitle — locked copy 2026-05-09 (PR-A shape brief §5.1).
            Two-line treatment: instruction + mechanic.  Plain-spoken,
            grounded in PRODUCT.md ## Tone (trust-first, precise about
            redemption mechanics).  See docs/design-briefs/2026-05-09-
            pin-sheet-success-popup-polish-shape-brief.md §5.1 for
            rationale + rejected alternatives. */}
        <Text variant="body.md" style={styles.subtitle}>
          Ask staff at {merchantName} for their 4-digit PIN.
        </Text>
        <Text variant="body.sm" style={styles.subtitleSecondary}>
          When you confirm it, we'll create the code staff can check.
        </Text>

        {/* Locked-out card replaces the PIN input.  Typography bumped
            2026-05-09 (cross-surface consistency pass): title heading.sm,
            timer heading.lg, body + label use design-system variants. */}
        {isLocked ? (
          <View style={styles.lockoutCard} testID="pin-lockout-card">
            <View style={styles.lockoutIconWrap}>
              <Lock size={22} color="#FFFFFF" strokeWidth={2.4} />
            </View>
            <Text variant="heading.sm" style={styles.lockoutTitle}>
              Too Many Attempts
            </Text>
            {/* Sentence-per-line layout — locked rule 2026-05-09:
                each sentence gets its own Text so word wrap doesn't
                land in awkward places. */}
            <Text variant="body.sm" style={styles.lockoutBody}>
              You've entered the wrong PIN too many times.
            </Text>
            <Text variant="body.sm" style={styles.lockoutBodySecondary}>
              Try again after the timer below.
            </Text>
            <Text
              variant="heading.md"
              style={styles.lockoutTimer}
              testID="pin-lockout-timer"
            >
              {lockout.mmss}
            </Text>
            <Text variant="label.md" style={styles.lockoutLabel}>
              minutes remaining
            </Text>
          </View>
        ) : (
          // Tap-to-refocus Pressable.  The visible PIN boxes are <View>s
          // (no native touch handling); the hidden TextInput is 1×1pt
          // and unreachable.  Wrapping in Pressable gives the user a
          // tap surface to bring the keypad back if focus ever drops
          // (e.g. system keyboard-dismiss gesture, OS interruption,
          // or — historically — after a wrong PIN clear before the
          // INVALID_PIN auto-refocus shipped 2026-05-09).
          <Pressable
            testID="pin-row-pressable"
            accessibilityRole="button"
            accessibilityLabel="Enter PIN"
            accessibilityHint="Opens the keypad to enter the 4-digit branch PIN"
            onPress={() => inputRef.current?.focus()}
          >
          <Animated.View style={[styles.pinRow, shakeStyle]}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => {
              const filled = i < digits.length
              const active = i === digits.length
              return (
                <View
                  key={i}
                  style={[
                    styles.pinBox,
                    filled && styles.pinBoxFilled,
                    active && styles.pinBoxActive,
                    error?.code === 'INVALID_PIN' && styles.pinBoxError,
                  ]}
                  testID={`pin-box-${i}`}
                >
                  <Text variant="heading.md" style={styles.pinDigit}>
                    {digits[i] ?? ''}
                  </Text>
                </View>
              )
            })}
            {/* Hidden input drives the keypad. Pin display is read-only
                visual layer above. */}
            <TextInput
              ref={inputRef}
              testID="pin-input-hidden"
              value={digits}
              onChangeText={handleChange}
              keyboardType="number-pad"
              maxLength={PIN_LENGTH}
              autoFocus={visible}
              caretHidden
              importantForAutofill="no"
              autoComplete="off"
              // PR #44 review fix #5: NOT `oneTimeCode` — that hint
              // makes iOS surface "From Messages" autofill suggestions
              // for SMS-delivered codes. The branch PIN is staff-supplied
              // verbally; SMS autofill is wrong + confusing here.
              textContentType="none"
              style={styles.hiddenInput}
              editable={!isLoading && !isLocked}
            />
          </Animated.View>
          </Pressable>
        )}

        {/* Inline error bar — only when INVALID_PIN, not while locked.
            If `remainingAttempts` is missing (older backend, dropped
            payload, etc.) fall back to "Wrong PIN. Try again." rather
            than rendering a blank counter. */}
        {showInvalidPinBar ? (
          <View style={styles.errorBar} testID="pin-error-bar">
            <Text variant="body.sm" style={styles.errorBarText}>
              {remainingAttempts !== null
                ? `Wrong PIN · ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining`
                : 'Wrong PIN. Try again.'}
            </Text>
          </View>
        ) : null}

        {/* Generic backend-error banner — covers the 6 non-PIN error codes
            (PIN_NOT_CONFIGURED, BRANCH_UNAVAILABLE, BRANCH_MERCHANT_MISMATCH,
            PHONE_NOT_VERIFIED, SUBSCRIPTION_REQUIRED, VOUCHER_NOT_FOUND).
            Distinct from the INVALID_PIN bar above (no attempts counter,
            different framing — these aren't the user's fault). */}
        {errorBanner && !isLocked ? (
          <View style={styles.backendErrorBanner} testID="pin-backend-error-banner">
            <Text variant="heading.sm" style={styles.backendErrorTitle}>
              {errorBanner.title}
            </Text>
            <Text variant="body.sm" style={styles.backendErrorBody}>
              {errorBanner.body}
            </Text>
          </View>
        ) : null}

        {/* Disclaimer — locked copy 2026-05-09 (PR-A shape brief §5.2).
            Cream-tinted card with brand-rose 12% ring + Lock icon.
            Density refinement 2026-05-09: text bumped DOWN to body.sm
            so the disclaimer reads as tertiary (still clear) under the
            primary PIN-entry instruction; padding reduced one step. */}
        {!isLocked ? (
          <View style={styles.disclaimer}>
            {/* Icon-left + single Text block (2026-05-09 final form).
                The two sentences live in one Text so RN flows them
                naturally; the wrap-row absorbs both the trailing
                words of sentence 1 AND sentence 2 → no orphan
                "cycle." on its own line.  D2 copy unchanged. */}
            <Lock size={16} color={color.brandRose} strokeWidth={2.4} />
            <Text variant="body.sm" style={styles.disclaimerText}>
              Confirming the correct PIN redeems this voucher for this cycle. Continue when you're ready to use it.
            </Text>
          </View>
        ) : null}

        {/* Submit — D3 idle copy "Confirm"; D4 loading state swaps to a
            small pulsing dot + "Confirming…".  Lightweight by design
            (Owner-clarification 2 / shape brief §6) — the spinner's
            job is to confirm the app is working, not to ceremoniously
            stage the redemption.
            Defense-in-depth on repeat-submit:
              1. accessibilityState.disabled + Pressable disabled (existing)
              2. submittedRef guard in handleChange / handleManualSubmit
              3. pointerEvents="none" while loading (NEW) — even if
                 disabled fails on a specific RN version, taps don't
                 reach the handler. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isLoading ? 'Confirming PIN' : 'Confirm PIN'}
          accessibilityState={{ disabled: submitDisabled, busy: isLoading }}
          testID="pin-submit"
          disabled={submitDisabled}
          onPress={handleManualSubmit}
          pointerEvents={isLoading ? 'none' : 'auto'}
          style={({ pressed }) => [
            styles.submit,
            submitDisabled && styles.submitDisabled,
            pressed && !submitDisabled && styles.submitPressed,
          ]}
        >
          <LinearGradient
            colors={color.brandGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
          {isLoading ? (
            <>
              <PulsingDot
                color={color.onBrand}
                size={6}
                testID="pin-submit-pulsing-dot"
              />
              <Text variant="heading.sm" style={styles.submitText}>
                Confirming…
              </Text>
            </>
          ) : (
            <Text variant="heading.sm" style={styles.submitText}>
              Confirm
            </Text>
          )}
        </Pressable>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  // Header rhythm — 2026-05-09 horizontal-layout + density refinement.
  // Padding/margin reduced one step from the initial PR-A bump so the
  // sheet starts a little lower and doesn't crowd the screen top.
  // PR-B T8m (impeccable pass): 1px border → StyleSheet.hairlineWidth
  // for a more refined separator (resolves to ~0.5pt on iOS, 1px on
  // Android — the right "barely there" weight per Flat-By-Default Rule).
  headerRow: {
    paddingBottom: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
    marginBottom: spacing[4],
  },
  // Horizontal block — logo (left) + merchant text (right), aligned
  // to the leading edge of the sheet (left in LTR locales).  Owner
  // direction 2026-05-09: left-align rather than centred so the
  // identity reads as a header bar, not a centred title block.
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing[3],
  },
  headerText: {
    flexDirection: 'column',
    flexShrink: 1,
  },
  // 48×48 merchant logo (D5 locked).  1px brand-rose ring at 8% alpha
  // anchors the merchant identity without competing with the title.
  // marginBottom removed (no longer below merchantLine in horizontal
  // layout).
  merchantLogo: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(226, 12, 4, 0.08)',
    backgroundColor: color.surface.tint,
  },
  // body.md (16) lifted to 700 weight — the merchant line is the
  // primary identity in the header.  Lato has a real Bold cut so
  // the 700 lift renders cleanly (unlike adding 800 on Semibold).
  merchantLine: {
    fontWeight: '700',
    color: color.text.primary,
  },
  // body.sm (14) — secondary supporting context.
  branchLine: {
    marginTop: 2,
    color: color.text.secondary,
  },
  // PR-B T8m (impeccable pass): title moved to display.sm Mustica Pro
  // Semibold 22pt with -0.3 tight tracking.  The Mustica Semibold
  // weight is what the brand calls for at display tier; the previous
  // fontWeight: 800 override on Lato Semibold doesn't synthesize
  // cleanly on iOS and is dropped.
  title: {
    color: color.text.primary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  // body.md (16 / 24) variant drives.  Two-line subtitle: line 1
  // (instruction) uses primary text; line 2 (mechanic) uses secondary.
  // Density refinement 2026-05-09 — top margin tightened.
  subtitle: {
    marginTop: spacing[2],
    color: color.text.primary,
    textAlign: 'center',
  },
  subtitleSecondary: {
    marginTop: spacing[1],
    color: color.text.secondary,
    textAlign: 'center',
  },
  // PIN boxes — gap 12 (spacing[3]) keeps 56×64 boxes visually
  // separated; PR-B T8m bumped from 14 to align with the spacing
  // token system.
  pinRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing[3],
    marginTop: spacing[4],
    marginBottom: spacing[4],
  },
  // 56×64 PIN boxes (D6 locked).  Comfortable 44pt+ tap target with
  // 26pt digit weight already proven readable in M2.
  // PR-B T8m (impeccable pass) refinements:
  //   • borderRadius radius.lg (16) → radius.md (12).  The lg radius
  //     read as chunkier than the brand voice; md keeps the box
  //     refined while still soft.
  //   • borderWidth 2 → 1.5.  Premium hairline weight; reads as
  //     "intentionally drawn" rather than "outlined chunky".
  //   • Idle bg color.cream → color.surface.tint.  DESIGN.md
  //     "Cream-for-Identity Rule" — cream is identity-zone framing,
  //     surface.tint is the quieter cream-adjacent reserved for
  //     state surfaces.
  //   • Idle border hardcoded `#E8E2DC` → color.border.subtle.
  //     Token alignment.
  pinBox: {
    width: 56,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.border.subtle,
    backgroundColor: color.surface.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBoxFilled: {
    borderColor: color.brandRose,
    backgroundColor: color.surface.raised,
  },
  pinBoxActive: {
    borderColor: color.brandRose,
    backgroundColor: color.surface.raised,
  },
  pinBoxError: {
    borderColor: color.danger,
    backgroundColor: '#FEF2F2',
  },
  pinDigit: {
    fontSize: 26,
    fontWeight: '800',
    color: color.text.primary,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  errorBar: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    marginBottom: spacing[3],
    alignItems: 'center',
  },
  // body.sm (14 / 21) variant drives.  fontSize override removed
  // 2026-05-09 (cross-surface consistency pass).
  errorBarText: {
    fontWeight: '600',
    color: color.danger,
  },
  // Generic backend-error banner — for the 6 non-PIN codes the backend
  // can return (PIN_NOT_CONFIGURED, BRANCH_UNAVAILABLE, etc.). Distinct
  // from the INVALID_PIN bar — slightly larger, two-line layout, less
  // alarming colour (these aren't user-fault errors).
  backendErrorBanner: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
    marginBottom: spacing[3],
  },
  // heading.sm (16 / 22) variant drives — backend errors are
  // user-actionable, must be readable.  PR-B T8m: dropped the
  // fontWeight: '800' override; Lato Semibold (already 600) doesn't
  // synthesize cleanly to 800 on iOS.  Switched amber tone from
  // hardcoded `#92400E` → `color.warning` (`#B45309`) per DESIGN.md
  // Status palette token alignment.
  backendErrorTitle: {
    color: color.warning,
    marginBottom: 2,
  },
  // body.sm (14 / 21) variant drives.
  backendErrorBody: {
    color: color.warning,
  },
  // Disclaimer banner — icon-left, vertically centred (2026-05-09).
  // Lock icon centred against the full text height (~2 lines) so
  // the icon visually balances the two-line copy block.  Text takes
  // the remaining card width via flex: 1 and wraps naturally.
  // Single Text holds both sentences so "cycle." never orphans.
  // PR-B T8m: bg color.cream → color.surface.tint per DESIGN.md
  // "Cream-for-Identity Rule" (cream is identity-zone framing;
  // surface.tint is the quieter cream-adjacent reserved for state
  // surfaces like this commitment-warning card).
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: color.surface.tint,
    borderColor: 'rgba(226, 12, 4, 0.12)',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    marginBottom: spacing[4],
  },
  // body.sm (14 / 21) drives.  flex: 1 so the Text claims the row
  // width remaining after the Lock icon column.
  disclaimerText: {
    flex: 1,
    color: color.text.primary,
  },
  // Submit button — PR-B T8m (impeccable pass) aligned to DESIGN.md
  // `button-primary-lg`:
  //   • borderRadius radius.md (12) — DESIGN.md "Buttons Shape:
  //     rounded-md (12px) on every variant".  Was radius.lg (16).
  //   • shadowOpacity 0.30 → 0.20, shadowRadius 24 → 18 — calmer
  //     brand glow per DESIGN.md "Glow-is-the-CTA Rule" (the glow
  //     is a brand pulse, not a marketing flare).
  //   • paddingHorizontal 24 explicit per the spec.
  //   • Label moves body.md (16) + fontWeight 700 override → heading.sm
  //     (Lato Semibold 16) so the variant carries the weight cleanly.
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    minHeight: 56,
    paddingVertical: spacing[4],
    paddingHorizontal: 24,
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: color.brandRose,
    shadowOpacity: 0.20,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  submitDisabled: {
    opacity: opacity.disabled,
  },
  submitPressed: {
    transform: [{ scale: 0.97 }],
  },
  submitText: {
    color: color.onBrand,
  },
  // ── Lockout card ──
  lockoutCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing[5],
    alignItems: 'center',
    marginVertical: spacing[5],
  },
  lockoutIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: color.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[3],
  },
  // heading.sm (16 / 22) variant drives the title; bumped from
  // label.md so "Too Many Attempts" reads with the weight the
  // moment deserves.  Cross-surface consistency pass 2026-05-09.
  // PR-B T8m: dropped the fontWeight: '800' override (Lato Semibold
  // already carries the 600 weight cleanly; the 800 lift doesn't
  // synthesize on iOS).
  lockoutTitle: {
    color: color.danger,
    marginBottom: spacing[2],
  },
  // body.sm (14 / 21) variant drives — readable explanation copy.
  // Split into two sibling Text blocks so each sentence is its own
  // line (sentence-per-line discipline).  PR-B T8m: hardcoded amber
  // `#92400E` → `color.text.secondary` (#4B5563 navy-grey).  The
  // amber body on a red-tinted danger card is inconsistent with the
  // brand-rose / danger title and timer above; switching to
  // text.secondary aligns the body to the DESIGN.md "three text
  // steps" rule and reads cleaner on the soft-danger bg.
  lockoutBody: {
    color: color.text.secondary,
    textAlign: 'center',
  },
  lockoutBodySecondary: {
    color: color.text.secondary,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: spacing[3],
  },
  // heading.lg (20 / 26) variant drives the mm:ss timer.  Bumped
  // from heading.sm so the countdown is the visual anchor of the
  // lockout card.  PR-B T8m: dropped fontWeight: '800' override
  // (Lato Semibold variant already carries the right weight).
  lockoutTimer: {
    color: color.danger,
    fontVariant: ['tabular-nums'],
  },
  // label.md (12 / 16) variant drives.  PR-B T8m: hardcoded amber
  // `#92400E` → `color.text.secondary` for the same alignment
  // reason as `lockoutBody` (consistent body tone on the
  // danger-tinted card).
  lockoutLabel: {
    marginTop: 2,
    color: color.text.secondary,
  },
})
