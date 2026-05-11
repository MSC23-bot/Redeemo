import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react'
import { View, StyleSheet, Pressable, Alert, Platform } from 'react-native'
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import { ArrowLeft } from 'lucide-react-native'
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import { RedeemoLoader } from '@/design-system/motion/RedeemoLoader'
import { useSubscription } from '@/hooks/useSubscription'
import { useUserLocation } from '@/hooks/useLocation'
import { useMerchantProfile } from '@/features/merchant/hooks/useMerchantProfile'
import { useCustomerVoucher } from '../hooks/useCustomerVoucher'
import { useTimeLimited } from '../hooks/useTimeLimited'
import { CouponHeader } from '../components/CouponHeader'
import { CouponTopCard, CouponBodyCard } from '../components/CouponBody'
import { PerforationLine } from '../components/PerforationLine'
import { MerchantRow } from '../components/MerchantRow'
import { HowItWorks } from '../components/HowItWorks'
import { RedeemCTA } from '../components/RedeemCTA'
import { TimeLimitedBanner } from '../components/TimeLimitedBanner'
import { TimeLimitedDetailsCard } from '../components/TimeLimitedDetailsCard'
import { FrostedCountdown } from '../components/FrostedCountdown'
import { formatScheduleString } from '../utils/scheduleString'
import { CollapsedHeader } from '../components/CollapsedHeader'
import { SubscriptionPromptModal } from '../components/SubscriptionPromptModal'
import { VoucherTypeExplainerCard } from '../components/VoucherTypeExplainerCard'
import { CycleRulesCard } from '../components/CycleRulesCard'
// M2 Section B — redemption flow components + hook
import { BranchPickerSheet, type PickerBranch } from '../components/BranchPickerSheet'
import { PinEntrySheet } from '../components/PinEntrySheet'
import { SuccessPopup } from '../components/SuccessPopup'
import { RedemptionDetailsCard } from '../components/RedemptionDetailsCard'
import { ReviewPromptCard } from '../components/ReviewPromptCard'
import { RedeemedSeal } from '../components/RedeemedSeal'
import { ShowToStaff } from '../components/ShowToStaff'
import { useRedeem, type UseRedeemError } from '../hooks/useRedeem'
import { usePresentationActive } from '../utils/presentationWindow'
import { useScreenCaptureProtection } from '../hooks/useScreenCaptureProtection'
import { useScreenshotGuard } from '../hooks/useScreenshotGuard'
import { SCREENSHOT_GUARD_ENABLED } from '../hooks/screenshotGuardConfig'
import type { RedeemResponse } from '@/lib/api/redemption'
import { CTA_LABELS } from '../constants/productCopy'

/**
 * VoucherDetailScreen — orchestrates the 12-state UI for a voucher's
 * detail + redemption flow. Phase 3C.1c rebaseline (M1: view-only).
 *
 * Visual reference: `.superpowers/brainstorm/88554-1776435672/content/
 * voucher-detail-v4.html` (locked design baseline).
 *
 * **Round 5 — safe-area chrome + back navigation:**
 *   • Hero NavRow scrolls away with the coupon header (per v4
 *     §vd-topnav).
 *   • CollapsedHeader takes over once the hero starts to leave —
 *     frosted safe-area surface + back / title / actions row +
 *     "REDEEM AT <branch>" eyebrow when branch is resolved.
 *   • Single-threshold pointerEvents handoff (round-5 plan §2): a
 *     `useAnimatedReaction` flips a JS `collapsedActive` flag exactly
 *     once per crossing of `HANDOFF_AT`. Hero NavRow is tappable
 *     below the threshold; CollapsedHeader is tappable above it. No
 *     overlap zone, no gap.
 *   • Back navigation is URL-driven and works EVEN WHEN the voucher
 *     query hasn't resolved (round-5 plan §1). Push side appends
 *     `from=merchant&returnMerchantId=<id>&tab=vouchers` from
 *     MerchantProfileScreen.handleVoucherPress.
 *
 * Data sources (locked dual-endpoint pattern, plan §3 D2):
 *   • `useCustomerVoucher(voucherId)` → voucher row + isRedeemedThisCycle
 *     + isFavourited from `GET /api/v1/customer/vouchers/:id`.
 *   • `useMerchantProfile(merchantId, { branchId })` → branch list +
 *     selectedBranch + distance for the branch-attribution UX.
 *
 * Branch-attribution contract (plan §11):
 *   • The redemption branch comes ONLY from `merchant.selectedBranch.id`,
 *     resolved server-side from the URL's `?branch=<id>` param OR
 *     cold-open fallback (nearest by GPS / `isMainBranch`).
 *   • Display surface MUST surface "Redeem at <branchName>" prominently
 *     before any redeem attempt (handled by `<MerchantRow>`).
 *   • Branch is attribution-only; voucher eligibility
 *     (`isRedeemedThisCycle`) is branch-INDEPENDENT.
 *   • Vouchers are MERCHANT-LEVEL; redemption is BRANCH-LEVEL.
 */

// M4b-8 state-key union. The previous `time-limited-available` and
// `time-limited-unavailable` keys are GONE. The new five-way split
// covers the real TIME_LIMITED state machine driven by
// `useTimeLimited` (M4b-4) + the redeemedWindow → redeemed-this-window
// branch (TIME_LIMITED-specific replacement for redeemed-this-cycle
// per spec §5.1, locked D4 — expired precedes redeemed for ALL types).
type VoucherStateKey =
  | 'loading'
  | 'error'
  | 'free-user'
  | 'expired'
  | 'redeemed-this-cycle'
  | 'redeemed-this-window'                  // NEW M4b-8 (TIME_LIMITED only)
  | 'time-limited-active'                   // RENAMED from -available
  | 'time-limited-urgent'
  | 'time-limited-unavailable-today'        // NEW M4b-8
  | 'time-limited-unavailable-future-day'   // NEW M4b-8
  | 'can-redeem'

const PAGE_BG = '#F5F0EB'      // v4 cream-stone page background
// Coupon card horizontal inset — bumped 14 → 18 in round 6 to give
// the card more breathing room against the page background, making
// it read more clearly as a SHAPED coupon object rather than a
// full-bleed body section.
const COUPON_INSET = 18

// Animated.ScrollView typed reference — Reanimated wraps RN's
// ScrollView and forwards onScroll worklets via useAnimatedScrollHandler.
const AnimatedScrollView = Animated.ScrollView

// Round 22 part 5: free-user subscription prompt is delayed slightly
// after the screen becomes interactive so the user sees the voucher
// itself first instead of being met with a hard gate. 800ms sits in
// the comfortable middle of the 700–1000ms band requested by owner —
// long enough to not feel gate-like, short enough to remain part of
// the same micro-task as opening the screen. Timer is cancellable
// (see scheduling effect for cleanup paths).
const SUBSCRIPTION_PROMPT_DELAY_MS = 800

/**
 * Build the back-navigation URL from explicit return-context URL
 * params. Pure function — does NOT read voucher / merchant query
 * state. Intentionally pure so back navigation works even when
 * Voucher Detail's own queries are still loading (round-5 plan §1).
 *
 * Returns null when the URL params don't carry enough context to
 * deterministically construct a return route — caller falls through
 * to `router.back()` then to the Discovery default.
 */
export function buildReturnUrl(params: {
  from?: string | undefined
  returnMerchantId?: string | undefined
  branch?: string | undefined
  tab?: string | undefined
  /**
   * When true, append `branchChanged=1` to the return URL so the
   * Merchant Profile screen can show a one-time confirmation toast
   * ("Now viewing <branch>"). Locked 2026-05-07 from device QA — the
   * user might not realise the branch context changed when they
   * back-navigate from voucher detail to merchant profile, especially
   * when the chip + band are off-screen below the fold.
   */
  branchChanged?: boolean
}): string | null {
  if (params.from === 'merchant' && params.returnMerchantId && params.branch) {
    const enc = encodeURIComponent
    const tab = params.tab ?? 'vouchers'
    let url = `/(app)/merchant/${enc(params.returnMerchantId)}?branch=${enc(params.branch)}&tab=${enc(tab)}`
    if (params.branchChanged) url += '&branchChanged=1'
    return url
  }
  return null
}

export function VoucherDetailScreen() {
  const params = useLocalSearchParams<{
    id?: string
    branch?: string
    from?: string
    returnMerchantId?: string
    tab?: string
    /**
     * Round 22: when set to "1", suppresses the auto-show of the
     * SubscriptionPromptModal on this screen visit. Set by
     * SubscribePromptScreen when the user picks "Continue with Free
     * Account" — they just made a deliberate decision and we don't
     * want to nag-loop the same prompt back at them. Sticky CTA
     * remains visible and tappable; only the auto-modal is gated.
     */
    suppressSubscribePrompt?: string
  }>()
  const voucherId = typeof params.id === 'string' ? params.id : undefined
  const branchIdParam = typeof params.branch === 'string' ? params.branch : undefined
  const suppressPrompt = params.suppressSubscribePrompt === '1'

  const router = useRouter()
  const insets = useSafeAreaInsets()

  const { isSubscribed, isSubLoading } = useSubscription()
  const { location } = useUserLocation()

  const voucherQuery = useCustomerVoucher(voucherId)
  const voucher = voucherQuery.data ?? null

  const merchantProfileOpts: { lat?: number; lng?: number; branchId?: string } = {
    ...(location ? { lat: location.lat, lng: location.lng } : {}),
    ...(branchIdParam ? { branchId: branchIdParam } : {}),
  }
  const merchantQuery = useMerchantProfile(voucher?.merchant.id, merchantProfileOpts)
  const merchant = merchantQuery.data ?? null

  const timeLimited = useTimeLimited(voucher)

  // Branch context for the redemption attribution UX.
  //
  // `selectedBranch` is the server-resolved cold-open fallback only;
  // never used for display when the URL or picker has a target.
  // See `displayBranch` below for the URL-first resolver that actually
  // drives the screen.
  const selectedBranch = merchant?.selectedBranch ?? null
  const isMultiBranch  = (merchant?.branches.length ?? 0) > 1
  const merchantDescriptor = merchant?.descriptor ?? null

  // ── Scroll-driven chrome handoff ─────────────────────────────────────
  // FADE_START / FADE_END define the visual crossfade band; HANDOFF_AT
  // is a single threshold that flips the JS state controlling
  // pointerEvents (round-5 plan §2). Single threshold ⇒ no scroll
  // range with both layers tappable, no scroll range with neither.
  const FADE_START = insets.top + 80
  const FADE_END   = insets.top + 200
  const HANDOFF_AT = insets.top + 130

  const scrollY = useSharedValue(0)
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y
    },
  })

  // Scroll-reset on each fresh focus event. Round-6 fix #1 — when a
  // user opens a voucher, scrolls to mid-page, backs to Merchant
  // Profile, then taps the SAME voucher again, expo-router (via
  // React Navigation) reuses the screen instance and the ScrollView
  // retains its scrollY position. `useFocusEffect` fires on every
  // focus event regardless of mount status, so we reset both the
  // scroll handler's UI-thread shared value AND the underlying
  // ScrollView's scroll position. `animated: false` keeps the reset
  // instant — animating would imply a state change to the user.
  const scrollViewRef = useRef<Animated.ScrollView>(null)
  useFocusEffect(
    useCallback(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false })
      scrollY.value = 0
    }, [scrollY]),
  )

  // Auto-scroll when a collapsible card expands (locked 2026-05-08
  // from device QA). Without this, expanding HowItWorks or
  // VoucherTypeExplainerCard near the bottom of the page leaves the
  // newly-revealed body underneath the sticky CTA wrap, forcing the
  // user to manually scroll. The card calls this with its `layoutY`
  // (in scroll content coords); we scroll its top to a small fixed
  // offset from the viewport top so the body lands well above the
  // sticky CTA. RN clamps to 0 if `target` would be negative (card
  // already visible at the top).
  const handleCardExpand = useCallback((cardLayoutY: number) => {
    const TOP_OFFSET = insets.top + 80  // safe-area top + collapsed-header room
    const target = Math.max(0, cardLayoutY - TOP_OFFSET)
    scrollViewRef.current?.scrollTo({ y: target, animated: true })
  }, [insets.top])

  const [collapsedActive, setCollapsedActive] = useState(false)
  useAnimatedReaction(
    () => scrollY.value > HANDOFF_AT,
    (active, prev) => {
      if (active !== prev) {
        runOnJS(setCollapsedActive)(active)
      }
    },
    [HANDOFF_AT],
  )

  // Round-16: subscription prompt for free users browsing a voucher.
  // Shows after voucher data loads, dismissible via "Maybe later" or
  // tap-out. Tracked separately from sticky-CTA / How It Works so the
  // user can dismiss the modal but still see the conversion path on
  // the page itself.
  //
  // Round 22 part 5 added a small delay before auto-show. `modalReady`
  // is the gate that flips true once the delay timer fires; the modal
  // never renders until then, regardless of voucher/sub state. `isFocused`
  // is tracked so the timer cancels when the user navigates away (e.g.
  // taps the sticky CTA mid-delay → blur → cleanup → clearTimeout).
  const [promptDismissed, setPromptDismissed] = useState(false)
  const [modalReady, setModalReady] = useState(false)
  const [isFocused, setIsFocused] = useState(true)
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true)
      setPromptDismissed(false)
      setModalReady(false)
      return () => {
        setIsFocused(false)
        setModalReady(false)
      }
    }, []),
  )

  // ── M2 Section B: redemption flow state ──────────────────────────────
  // Three-tier branch source for the redemption mutation. See plan §B11
  // for the full priority rationale. `pickerConfirmedBranchId` is the
  // local/ref source set synchronously when the user confirms a branch
  // in the picker; it bridges the render gap before the URL ?branch=
  // catches up via router.replace, then auto-clears once URL matches.
  const [pickerVisible, setPickerVisible] = useState(false)
  // Why the user opened the picker (locked 2026-05-07 from device QA):
  //   • 'change' — tapped the "Change ▾" pill on MerchantRow. They
  //     want to update the branch context only; do NOT open PIN
  //     entry on confirm.
  //   • 'redeem' — tapped the sticky "Redeem This Voucher" CTA on a
  //     multi-branch merchant. The picker is the final
  //     branch-confirmation step; on confirm, open PIN entry.
  // handlePickerConfirm reads this to decide what happens after
  // the URL/picker-local branch is updated.
  const [pickerIntent, setPickerIntent] = useState<'change' | 'redeem'>('redeem')
  // The branch id the user picked via 'change' intent on this voucher
  // detail session, when different from the URL branch at confirm
  // time. Stored as the explicit id (not a boolean flag) so
  // `handleBack` can route to that branch DIRECTLY without depending
  // on `useLocalSearchParams` having caught up after the
  // `router.replace` inside the picker confirm. Locked 2026-05-07
  // from device QA — a back tap immediately after Confirm could
  // otherwise carry the stale URL branch into the return URL while
  // still appending branchChanged=1, producing a contradictory toast
  // ("changed to B2") and destination ("B1").
  //
  // Null means: no change-intent confirm has happened yet, OR the
  // user picked the same branch they were already on (no-op).
  // `handleBack` reads this first; the URL branch is the cold-open
  // fallback when the local id is null.
  const [changedBranchOnVoucherId, setChangedBranchOnVoucherId] = useState<string | null>(null)
  const [pinSheetVisible, setPinSheetVisible] = useState(false)
  const [successPopup, setSuccessPopup] = useState<RedeemResponse | null>(null)
  const [lastRedemption, setLastRedemption] = useState<RedeemResponse | null>(null)
  // M3 — Show-to-Staff full-screen modal target. Non-null while
  // visible. Drives the Modal mount at the bottom of the JSX.
  // PR-B T1 — `voucherDescription` + `merchantLogoUrl` captured at
  // open-time so the vertical-receipt surface has the full identity
  // payload without re-reading the voucher query (which can race with
  // a branch-switch refetch). Both fields are nullable upstream.
  const [showToStaff, setShowToStaff] = useState<{
    code:               string
    redeemedAt:         string
    branchName:         string
    voucherDescription: string | null
    merchantLogoUrl:    string | null
  } | null>(null)
  // M3 — validated-this-session override. Set by ShowToStaff's
  // onValidated callback when polling reaches `phase: 'validated'`.
  // Drives the RedemptionDetailsCard validated pill on the
  // post-dismiss return-to-VoucherDetail render. Without this, the
  // in-memory `lastRedemption` branch would hardcode `isValidated:
  // false` and the user would see "Verified by staff" inside
  // ShowToStaff but no pill on the card. Tracks the redemption code
  // it validated for so a follow-up redemption (e.g. cycle reset
  // mid-session in QA) clears the stale flag automatically.
  const [validatedSession, setValidatedSession] = useState<string | null>(null)
  const [pickerConfirmedBranchId, setPickerConfirmedBranchId] = useState<string | null>(null)

  // Clear the picker-local source once the URL catches up to its value.
  // After this clear, `getBranchId()` falls back to URL → selectedBranch.
  useEffect(() => {
    if (pickerConfirmedBranchId == null) return
    if (branchIdParam === pickerConfirmedBranchId) {
      setPickerConfirmedBranchId(null)
    }
  }, [branchIdParam, pickerConfirmedBranchId])

  // ── URL-first display branch resolver (locked 2026-05-07 from device QA) ──
  //
  // The display surface (MerchantRow, CollapsedHeader, PinEntrySheet
  // header, SuccessPopup branch line, RedemptionDetailsCard branch line,
  // CTA gating) MUST mirror the mutation's three-tier priority so the
  // user never sees a different branch than the one redemption would
  // actually attribute to.
  //
  // Priority (matches `useRedeem({ getBranchId })` at the call site below):
  //   1. pickerConfirmedBranchId — synchronous local state from the
  //      picker confirm. Bridges the render gap before URL catches up.
  //   2. branchIdParam — URL `?branch=<id>`. The user's intended target.
  //   3. selectedBranch — server-resolved cold-open fallback. Used ONLY
  //      when no URL/picker target exists. Never displayed when it
  //      conflicts with the URL/picker target.
  //
  // Behaviour when a URL/picker target exists but the matching branch
  // is not yet in `merchant.branches` (race during cold-open or
  // refetch): displayBranch is `null` and the screen shows a NEUTRAL
  // unresolved state — never the stale selectedBranch. CTA is hidden
  // (no alarming "Resolving Branch…" primary button). Once the
  // refetch completes and the matching branch lands in
  // `merchant.branches`, displayBranch resolves and the CTA appears.
  const targetBranchId =
    pickerConfirmedBranchId ?? branchIdParam ?? null

  // Display branch is a thin shape carrying the four fields the
  // screen actually renders (name, distance, logoUrl, id). Two
  // sources contribute, in priority order:
  //   • merchant.selectedBranch — rich; carries logoUrl. Used when
  //     its id matches the target (or on cold-open).
  //   • merchant.branches[i] (BranchTile) — lighter; no logoUrl.
  //     Used during the keepPreviousData refetch window when
  //     selectedBranch is stale but the new target IS in the
  //     branches list.
  // The CollapsedHeader logo falls back to merchant.logoUrl when
  // displayBranch.logoUrl is null, so the BranchTile path is a
  // graceful degradation rather than a missing-asset bug.
  type DisplayBranch = {
    id: string
    name: string
    distance: number | null
    logoUrl: string | null
  }

  const displayBranch = useMemo<DisplayBranch | null>(() => {
    if (!merchant) return null
    if (targetBranchId) {
      // URL/picker target: prefer the rich selectedBranch when it
      // matches; otherwise the lighter BranchTile. Either path is
      // gated on `isActive` — a deactivated/suspended branch must
      // never resolve as display-ready, even if its row is still in
      // merchant.branches. Without this gate, the active Redeem CTA
      // could appear for an inactive target and the user would only
      // see BRANCH_UNAVAILABLE after entering a PIN. Locked
      // 2026-05-07 from device QA edge-case review.
      if (
        merchant.selectedBranch?.id === targetBranchId
        && merchant.selectedBranch.isActive
      ) {
        const sb = merchant.selectedBranch
        return { id: sb.id, name: sb.name, distance: sb.distance, logoUrl: sb.logoUrl }
      }
      const tile = merchant.branches.find(
        (b) => b.id === targetBranchId && b.isActive,
      )
      if (!tile) return null
      return { id: tile.id, name: tile.name, distance: tile.distance, logoUrl: null }
    }
    // No URL/picker target → cold-open fallback to selectedBranch,
    // also gated on isActive (defense-in-depth: the backend should
    // never resolve selectedBranch to an inactive row, but if it
    // ever does we don't want the customer to see it).
    const sb = merchant.selectedBranch
    if (!sb || !sb.isActive) return null
    return { id: sb.id, name: sb.name, distance: sb.distance, logoUrl: sb.logoUrl }
  }, [merchant, targetBranchId])

  const branchName     = displayBranch?.name ?? null
  const branchDistance = displayBranch?.distance ?? null
  const branchReady    = !!displayBranch
  // Error semantics:
  //   - merchantQuery isError → error.
  //   - merchant data settled (NOT fetching) AND we have a target id
  //     AND it's not in merchant.branches as ACTIVE → branch
  //     genuinely missing (deleted / wrong merchant) OR inactive
  //     (suspended / deactivated). Either way, error.
  //   - merchant data settled AND no target AND no active
  //     selectedBranch → cold-open with no resolvable branch. Error.
  //   - merchant data still fetching → not an error; the UI just
  //     waits in the unresolved state until the refetch lands.
  const branchErrored = merchantQuery.isError || (
    !!merchant
    && !merchantQuery.isFetching
    && (
      targetBranchId
        ? !merchant.branches.find((b) => b.id === targetBranchId && b.isActive)
        : !merchant.selectedBranch || !merchant.selectedBranch.isActive
    )
  )

  // Resolve the actual REDEMPTION branch from `lastRedemption.branchId`
  // (the in-memory mutation response) against `merchant.branches`. This
  // is the branch the redemption was attributed to — distinct from
  // `displayBranch`, which tracks the URL/picker target. On
  // immediate-after-redemption, both are usually the same branch; on
  // a hypothetical drift (URL changed mid-flow) they could differ —
  // the MerchantRow eyebrow + branch name should always reflect
  // WHERE THE REDEMPTION HAPPENED, not where the user is currently
  // pointing the URL.
  //
  // Returns null when:
  //   • `lastRedemption` isn't in memory. On a return visit during
  //     the active cycle the persisted `voucher.lastRedemption` block
  //     (M3 Task 5) drives the RedemptionDetailsCard via the FALLBACK
  //     branch in the `displayRedemption` derivation below; this
  //     local branch-tile lookup is only relevant for the in-memory
  //     PRIMARY path right after redemption.
  //   • `lastRedemption.branchId` doesn't match any row in
  //     `merchant.branches` (race or merchant data missing).
  const lastRedemptionBranch = useMemo(() => {
    if (!lastRedemption || !merchant) return null
    const tile = merchant.branches.find((b) => b.id === lastRedemption.branchId)
    if (!tile) return null
    return { name: tile.name, distance: tile.distance }
  }, [lastRedemption, merchant])

  // ── Presentation-window gate (locked 2026-05-08, owner direction PR #49) ──
  //
  // Resolve the `redeemedAt` we'll pin the 2-hour window to, using the
  // same source priority as the displayRedemption IIFE below: in-memory
  // (PRIMARY) → persisted (FALLBACK) → null. Lifted out of the IIFE so
  // `usePresentationActive` can be called unconditionally per rules of
  // hooks, and so the boolean threads down to multiple surfaces (card,
  // hero opacity, ShowToStaff handler guards) from a single source.
  //
  // After this redeemedAt + 2 hours elapse, the QR / code / Show-to-Staff
  // entry points disappear from Voucher Detail. See
  // `utils/presentationWindow.ts` for the contract.
  const redemptionRedeemedAt = useMemo<string | null>(() => {
    if (lastRedemption) return lastRedemption.redeemedAt
    return voucher?.lastRedemption?.redeemedAt ?? null
  }, [lastRedemption, voucher?.lastRedemption?.redeemedAt])
  const isPresentationActive = usePresentationActive(redemptionRedeemedAt)
  // Validated session covers the in-memory branch (which can't observe
  // staff scan otherwise). For the persisted branch, the voucher
  // payload's `lastRedemption.isValidated` is authoritative. Combined
  // here so the hero treatment / ShowToStaff guard / card all read from
  // a single resolved boolean.
  const isRedemptionValidated = useMemo<boolean>(() => {
    if (validatedSession && lastRedemption?.redemptionCode === validatedSession) return true
    return voucher?.lastRedemption?.isValidated ?? false
  }, [validatedSession, lastRedemption?.redemptionCode, voucher?.lastRedemption?.isValidated])
  // (Redeemed-state visual treatment — `showRedeemedSeal` +
  // `blockShowToStaffMount` — is computed BELOW after `stateKey` is
  // defined; can't be hoisted up here because `stateKey` depends on
  // `voucher`, `subscription`, `timeLimited`, etc.)
  // Schedule the auto-show timer. All gates must hold:
  //   • screen is focused (cancels mid-delay if user navigates away)
  //   • voucher data has loaded (no flash before content)
  //   • subscription state has resolved
  //   • user is NOT subscribed
  //   • user has NOT dismissed it this focus visit
  //   • URL does NOT carry suppressSubscribePrompt=1 (set by the
  //     subscription screen on "Continue with Free Account" return)
  // The sticky free-user CTA stays visible regardless — only the
  // auto-modal is gated on this list. If the user taps that CTA before
  // the timer fires, the resulting navigation blurs this screen, which
  // re-runs this effect with isFocused=false → cleanup → clearTimeout.
  useEffect(() => {
    if (
      !isFocused ||
      !voucher ||
      isSubLoading ||
      isSubscribed ||
      promptDismissed ||
      suppressPrompt
    ) {
      return
    }
    const t = setTimeout(() => setModalReady(true), SUBSCRIPTION_PROMPT_DELAY_MS)
    return () => clearTimeout(t)
  }, [isFocused, voucher, isSubLoading, isSubscribed, promptDismissed, suppressPrompt])

  // Two-layer gate: modalReady (the delay timer fired) AND every
  // scheduling gate still holds. The second layer matters for "Maybe
  // later" / close — those only flip promptDismissed; modalReady
  // remains true from the earlier timer fire, so without this guard
  // the modal would stay visible after dismiss.
  const showSubscriptionPrompt =
    modalReady &&
    !!voucher &&
    !isSubLoading &&
    !isSubscribed &&
    !promptDismissed &&
    !suppressPrompt

  // Hero anchoring during overscroll — round-7 fix #2. Replaces the
  // round-6 overscroll bg gradient (which the user perceived as a
  // "green banner anchored at the top" during normal scroll). New
  // behaviour: when the user pulls DOWN at the top (scrollY < 0),
  // the hero's translateY compensates by moving UP an equal amount,
  // keeping the hero anchored at screen y=0. The body content below
  // the perforation (top card + body card + merchant row + how-it-
  // works) still moves DOWN with the gesture as a normal ScrollView
  // overscroll, opening a cream gap at the perforation boundary that
  // the user sees as "the coupon tearing at the perforation".
  //
  // During NORMAL scroll (scrollY >= 0), translateY = 0 — hero
  // scrolls away with content as before. Math.min ensures the
  // anchoring only kicks in for negative scrollY values.
  const heroAnchorStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: Math.min(scrollY.value, 0) }],
    }
  })

  // ── State derivation (M4b-8) ────────────────────────────────────────
  //
  // State precedence (locked per spec §5.1, do NOT reopen):
  //   loading / error → expired → redeemed (cycle/window) → free-user
  //                  → TIME_LIMITED states → can-redeem
  //
  // Two redeemed branches by voucher type:
  //   • TIME_LIMITED → `voucher.redeemedWindow` (per-window entitlement)
  //                     → state `redeemed-this-window`
  //   • all others    → `voucher.isRedeemedThisCycle` (cycle entitlement)
  //                     → state `redeemed-this-cycle`
  //
  // D4 lock — expired-first across ALL voucher types. A TIME_LIMITED
  // voucher that has been redeemed in its current window AND whose
  // merchant has set a hard expiryDate that has passed still surfaces
  // as `expired` (the hard expiry overrides the redeemed signal because
  // the offer is no longer redeemable in any future window either).
  const stateKey: VoucherStateKey = useMemo(() => {
    if (voucherQuery.isLoading || isSubLoading) return 'loading'
    if (voucherQuery.isError || !voucher) return 'error'
    if (branchErrored) return 'error'

    if (voucher.expiryDate) {
      const exp = new Date(voucher.expiryDate)
      if (exp.getTime() <= Date.now()) return 'expired'
    }

    // Redeemed branches by voucher type (M4b-8).
    const isTimeLimited = voucher.type === 'TIME_LIMITED'
    if (isTimeLimited) {
      if (voucher.redeemedWindow !== null) return 'redeemed-this-window'
    } else {
      if (voucher.isRedeemedThisCycle) return 'redeemed-this-cycle'
    }

    if (!isSubscribed) return 'free-user'

    if (isTimeLimited) {
      switch (timeLimited.windowState) {
        case 'active':                 return 'time-limited-active'
        case 'urgent':                 return 'time-limited-urgent'
        case 'unavailable-today':      return 'time-limited-unavailable-today'
        case 'unavailable-future-day': return 'time-limited-unavailable-future-day'
        case 'no-windows':             return 'can-redeem'  // degenerate fallback
      }
    }

    return 'can-redeem'
  }, [voucherQuery.isLoading, voucherQuery.isError, voucher, isSubLoading, isSubscribed, timeLimited.windowState, branchErrored])

  // ── Redeemed-state visual treatment ─────────────────────────────────
  //
  // Owner direction (locked 2026-05-09 PR #49 device QA wave 8): the
  // hero washed-out + seal overlay must appear AS SOON AS the voucher
  // is redeemed — not gated on presentation-window expiry. The user
  // needs an immediate visual confirmation that the voucher is now
  // redeemed, even while the code is still being shown for the 2h
  // handoff window. Previously these were gated on
  // `(!isPresentationActive || isRedemptionValidated)`, so the hero
  // stayed unchanged until the window closed — exactly the QA report.
  //
  // The two concerns are now intentionally separate:
  //
  //   • `showRedeemedSeal` — VISUAL treatment (hero dim + seal
  //     overlay). True whenever the voucher is redeemed in this
  //     cycle and we have a redeemedAt source to anchor the seal.
  //     Independent of the presentation window — "your voucher is
  //     redeemed" is true the moment you tap Redeem, regardless of
  //     whether the code is still on screen.
  //
  //   • `blockShowToStaffMount` — HANDLER guard (defense-in-depth
  //     against synthesised press / re-render race against the
  //     hidden CTA). True only when the code surface itself is
  //     hidden (out-of-window OR validated). During the in-window
  //     state the user CAN legitimately tap the "View voucher code"
  //     CTA from the card; this guard must NOT fire then.
  // `isRedeemedState` covers BOTH redeemed-this-cycle (cycle vouchers)
  // AND redeemed-this-window (TIME_LIMITED). Most JSX checks that
  // previously read `stateKey === 'redeemed-this-cycle'` for the
  // "show redeemed-state UI" purpose should now flow through this
  // constant so both voucher types render the same redeemed surfaces.
  // The few remaining `stateKey === 'redeemed-this-cycle'`-only checks
  // are intentional — they're specifically about cycle-based behaviour
  // (e.g. CycleRulesCard copy that only makes sense for cycle vouchers).
  const isRedeemedState =
    stateKey === 'redeemed-this-cycle' || stateKey === 'redeemed-this-window'
  const isRedeemed = isRedeemedState && !!redemptionRedeemedAt
  const showRedeemedSeal = isRedeemed
  const blockShowToStaffMount =
    isRedeemed && (!isPresentationActive || isRedemptionValidated)

  // ── Review prompt entry point (PR-C T16, locked 2026-05-09) ─────────
  //
  // Voucher Detail's redeemed state needs a second entry point into the
  // verified-review flow.  SuccessPopup carries it for the just-redeemed
  // moment, but once the popup is dismissed (Done / swipe-back / app
  // backgrounded) the user has no obvious path to leave a verified
  // review for the redeemed branch on subsequent visits during the
  // active cycle.  ReviewPromptCard (mounted below, immediately after
  // RedemptionDetailsCard) closes that gap.
  //
  // Two source priorities for the redemption attribution, mirroring
  // `displayRedemption` derivation in the JSX:
  //   1. PRIMARY (just-redeemed): in-memory `lastRedemption` is a
  //      RedeemResponse — carries the redemption `id`, so we route
  //      with `fromRedemption=<id>` (Path A backend validation).
  //      The user lands on WriteReviewSheet with the verified-review
  //      banner already showing (banner depends on the URL param).
  //   2. FALLBACK (return visit): persisted `voucher.lastRedemption`
  //      payload exposes `branch.id` but NOT the redemption `id`
  //      (the persisted shape only carries `code` + branch + dates,
  //      see `voucherDetailLastRedemptionSchema` — see deferred-
  //      followup if/when we want banner upfront on this path too).
  //      We route with `branch` only, no `fromRedemption`; backend
  //      Path B auto-link verifies on submit via the user's current-
  //      cycle redemption at this branch.  No banner upfront — the
  //      verified badge appears AFTER the user submits.
  //
  // Visibility gate: redeemed-this-cycle AND we have a real branchId.
  // Hide rule mirrors SuccessPopup's CTA — never route into a malformed
  // URL (no fall-back to branchName, locked).  Always-show during
  // redeemed cycle per option 1 (we don't know `myReview` from
  // `useCustomerVoucher`; smarter "edit/hide-after-reviewed" is
  // deferred to a follow-up).
  const reviewPromptContext = useMemo<
    { branchId: string; redemptionId: string | null } | null
  >(() => {
    // M4b-8: redeemed-this-window (TIME_LIMITED) also surfaces the
    // review prompt — same redeemed-state semantics as cycle.
    if (!isRedeemedState) return null
    if (lastRedemption && lastRedemption.branchId) {
      return { branchId: lastRedemption.branchId, redemptionId: lastRedemption.id }
    }
    if (voucher?.lastRedemption?.branch.id) {
      return { branchId: voucher.lastRedemption.branch.id, redemptionId: null }
    }
    return null
  }, [isRedeemedState, lastRedemption, voucher?.lastRedemption])

  const handleReviewPromptPress = useCallback(() => {
    if (!reviewPromptContext) return
    if (!voucher) return
    // Build the params shape with the literal `id` field required by
    // expo-router's typed route, then conditionally spread the
    // optional redemption id.  Conditional spread (vs assigning
    // undefined) keeps the typed-route tagged-union happy under
    // exactOptionalPropertyTypes.
    router.push({
      pathname: '/(app)/merchant/[id]',
      params: {
        id:              voucher.merchant.id,
        branch:          reviewPromptContext.branchId,
        tab:             'reviews',
        openWriteReview: '1',
        ...(reviewPromptContext.redemptionId
          ? { fromRedemption: reviewPromptContext.redemptionId }
          : {}),
      },
    })
  }, [reviewPromptContext, voucher, router])

  // ── Screen-capture protection on Voucher Detail ─────────────────────
  //
  // Locked rule (2026-05-08, owner direction PR #49 review): ANY surface
  // that displays the redemption code or QR must have screen-capture
  // protection active. ShowToStaff already does this via its own hook;
  // SuccessPopup does this via the shared hook; Voucher Detail must too,
  // because the persisted RedemptionDetailsCard surfaces the code on
  // return visits during the 2-hour presentation window.
  //
  // Active when ALL hold:
  //   • redeemed-this-cycle (the only state that can show the code).
  //   • a redemption exists to display (in-memory OR persisted).
  //   • presentation window is open (under 2h since redeemedAt).
  //   • staff has NOT validated yet (validation is terminal — once the
  //     code is hidden, protection is no longer needed).
  //
  // Mirrors the `showCodeSurface` gate inside RedemptionDetailsCard so
  // protection lifts the moment the code surface collapses (boundary
  // expiry OR validation transition). Cleanup on the hook releases
  // prevention so other app screens can be recorded normally afterwards.
  //
  // Android: FLAG_SECURE blocks BOTH screenshots and recordings.
  // iOS 11+: system overlays a blurred snapshot during active recording
  //   / mirroring. iOS screenshots cannot be PREVENTED by Apple's
  //   SDK — see `useScreenshotGuard` below for the post-fact path.
  // M4b-8: redeemed-this-window (TIME_LIMITED) also surfaces the code
  // via the persisted RedemptionDetailsCard, so screen-capture
  // protection must apply equally to both redeemed states.
  const codeVisibleOnVoucherDetail =
    isRedeemedState
    && !!redemptionRedeemedAt
    && isPresentationActive
    && !isRedemptionValidated
  // AND-gated with the shared kill-switch (locked 2026-05-09 from
  // deferred-followups §AG5). Same gate as ShowToStaff so flipping
  // the constant in `screenshotGuardConfig` disables BOTH surfaces'
  // capture protection at once. With the default `SCREENSHOT_GUARD_
  // ENABLED = true` the behaviour is byte-for-byte identical to the
  // pre-§AG5 unconditional call.
  useScreenCaptureProtection(SCREENSHOT_GUARD_ENABLED && codeVisibleOnVoucherDetail)

  // ── iOS post-fact screenshot detection on Voucher Detail ───────────
  //
  // Owner direction (locked 2026-05-09, PR #49 device QA): the
  // `useScreenCaptureProtection` hook above blocks SCREEN RECORDINGS
  // on iOS (system blur during active capture / mirroring) and BOTH
  // screenshots + recordings on Android (FLAG_SECURE). It does NOT
  // prevent iOS screenshots — Apple has no SDK to do so.
  //
  // QA finding: Voucher Detail allowed an iOS screenshot of the code,
  // expected behaviour is to match Show-to-Staff (which detects
  // post-fact via `addScreenshotListener` and shows a banner). This
  // installs the same listener on Voucher Detail when the code is
  // visible — best-effort post-fact mitigation; the captured photo
  // contains the unblurred code, but the live screen surfaces a
  // banner so the user sees we noticed.
  //
  // The banner is a screen-level overlay; the code itself stays
  // rendered (hiding it AFTER the screenshot is already taken adds
  // no value — see §AB locked iOS framing). The banner is the user-
  // visible signal + telemetry firing is the operational signal.
  const [screenshotBannerVisible, setScreenshotBannerVisible] = useState(false)
  // The code we'd telemetry against — same priority as displayRedemption.
  // Empty string when no redemption (the hook is also gated on
  // `active`, but we keep `code` non-load-bearing).
  const screenshotGuardCode =
    lastRedemption?.redemptionCode
    ?? voucher?.lastRedemption?.code
    ?? ''
  useScreenshotGuard(screenshotGuardCode, {
    // AND-gated with the shared kill-switch — see comment on
    // `useScreenCaptureProtection` above and §AG5.
    active: SCREENSHOT_GUARD_ENABLED && codeVisibleOnVoucherDetail,
    onBannerShown: () => setScreenshotBannerVisible(true),
  })
  // Auto-dismiss the screenshot banner after 4 seconds. ShowToStaff
  // keeps its banner up until the user taps the QR to clear the blur,
  // but Voucher Detail has no equivalent "tap to clear" gesture, so
  // a timed auto-dismiss is the user-visible exit. Clears immediately
  // if the gate flips closed (window expiry, validation, navigation
  // away) — no point keeping the banner up after the code surface
  // collapses.
  useEffect(() => {
    if (!screenshotBannerVisible) return
    if (!codeVisibleOnVoucherDetail) {
      setScreenshotBannerVisible(false)
      return
    }
    const id = setTimeout(() => setScreenshotBannerVisible(false), 4_000)
    return () => clearTimeout(id)
  }, [screenshotBannerVisible, codeVisibleOnVoucherDetail])

  // Back navigation — URL-only, does NOT depend on voucher/merchant
  // queries having resolved. Round-5 plan §1.
  const handleBack = useCallback(() => {
    lightHaptic()
    // Branch source priority for the return URL:
    //   1. `changedBranchOnVoucherId` — synchronous local store of
    //      the most recent change-intent confirm (when different
    //      from URL). Reading this FIRST means the back URL routes
    //      to the user's intended branch even if they tap back
    //      before `useLocalSearchParams` has caught up to the
    //      `router.replace` fired by the picker.
    //   2. `params.branch` — URL truth, the cold-open / steady-state
    //      source.
    //
    // `branchChanged` flips on if and only if the local id is
    // non-null, i.e. the user actually changed branch this session
    // (not a no-op same-branch confirm).
    const returnBranch = changedBranchOnVoucherId ?? params.branch
    const returnUrl = buildReturnUrl({
      from:             params.from,
      returnMerchantId: params.returnMerchantId,
      branch:           returnBranch,
      tab:              params.tab,
      branchChanged:    changedBranchOnVoucherId !== null,
    })
    if (returnUrl) {
      // router.replace ensures Voucher Detail leaves the stack
      // cleanly (rather than push, which would stack on top of the
      // existing stack and require two backs).
      router.replace(returnUrl as never)
      return
    }
    if (router.canGoBack()) {
      router.back()
      return
    }
    router.replace('/(app)/' as never)
  }, [router, params.from, params.returnMerchantId, params.branch, params.tab, changedBranchOnVoucherId])

  const handleFav = useCallback(() => {
    Alert.alert('Coming next milestone', 'Voucher favourite toggle ships in M2.')
  }, [])

  const handleShare = useCallback(() => {
    Alert.alert('Coming next milestone', 'Voucher share ships in M2.')
  }, [])

  // Round 21: build the voucher-origin subscription URL with full
  // return-context params. SubscribePromptScreen reads these to:
  //   • initialise the plan selector to the user's pre-pick
  //     (annual/monthly) instead of the onboarding default,
  //   • swap CTA copy for voucher-origin (Continue with Annual /
  //     Continue with Free Account),
  //   • route the secondary CTA back to THIS exact voucher detail
  //     page rather than dumping the user on Discovery.
  // Defined ahead of handleChangeBranch / handleCTA / handlePickerConfirm
  // so the subscription-gate fallbacks in those handlers (PR #44
  // review fix #1) can call into it without TS hoisting errors.
  const buildSubscriptionUrl = useCallback(
    (plan: 'annual' | 'monthly'): string => {
      const enc = encodeURIComponent
      const qs: string[] = [`source=voucher`, `plan=${plan}`]
      if (voucher) qs.push(`returnVoucherId=${enc(voucher.id)}`)
      // Branch return value (post-merge follow-up — symmetric to §O7
      // fix in MerchantProfileScreen.handleVoucherPress): URL
      // `branchIdParam` wins so the free-user sticky CTA / modal plan
      // buttons can be tapped even before merchantQuery resolves
      // selectedBranch. Without this the URL would omit `branch=`,
      // leaving SubscribePromptScreen's "Continue with Free Account"
      // unable to rebuild the exact return URL — it would fall back
      // to router.back() and miss the suppressSubscribePrompt=1
      // contract on the way back. Fallback to selectedBranch?.id
      // only when there's no URL branch param (cold-open before
      // anything resolves).
      const branchForReturn = branchIdParam ?? selectedBranch?.id
      if (branchForReturn) qs.push(`branch=${enc(branchForReturn)}`)
      if (voucher) qs.push(`returnMerchantId=${enc(voucher.merchant.id)}`)
      qs.push(`tab=vouchers`)
      return `/(auth)/subscription-prompt?${qs.join('&')}`
    },
    [voucher, branchIdParam, selectedBranch],
  )

  // M2 Section B — change branch opens the voucher-scoped picker. The
  // picker's onConfirm wires through to `handlePickerConfirm` below
  // (sets pickerConfirmedBranchId, fires router.replace, then opens
  // PinEntrySheet).
  //
  // Subscription gate (PR #44 review fix #1): free users tapping the
  // MerchantRow's "Change ▾" pill MUST NOT open the picker, because
  // the picker → PinEntrySheet wiring would let them reach PIN entry
  // without an active subscription. Owner constraint #1 — free users
  // never reach PIN. Route them through the conversion flow instead.
  //
  // Redeemed-this-cycle gate (locked 2026-05-07 from device QA): the
  // voucher's one-redemption rule is keyed on (userId, voucherId)
  // across ALL branches. If we let a redeemed-this-cycle user re-open
  // the picker → PIN sheet, the backend would correctly reject with
  // ALREADY_REDEEMED, but the user has already wasted three taps and
  // a PIN entry. Hard-block here. The MerchantRow also hides the
  // affordance via `disableChangeBranch` — this handler guard is
  // defence in depth.
  const handleChangeBranch = useCallback(() => {
    // M4b-8: both redeemed states (cycle + window) hard-block branch
    // change — same fraud-protection / wasted-taps rationale.
    if (isRedeemedState) return
    if (!isSubscribed) {
      router.push(buildSubscriptionUrl('monthly') as never)
      return
    }
    // 'change' intent — confirm updates the branch context only and
    // closes the picker. PIN entry MUST NOT open. The user is just
    // changing what branch the voucher detail page is talking about.
    setPickerIntent('change')
    setPickerVisible(true)
  }, [isRedeemedState, isSubscribed, router, buildSubscriptionUrl])

  const handleMerchantTap = useCallback(() => {
    if (voucher && merchant) {
      router.push(`/(app)/merchant/${voucher.merchant.id}` as never)
    }
  }, [router, voucher, merchant])

  // ── M2 Section B: useRedeem mutation ─────────────────────────────────
  // Three-tier branch source priority — read AT MUTATION TIME:
  //   1. pickerConfirmedBranchId — synchronous local state set by the
  //      picker confirm; bridges the render gap before URL catches up.
  //   2. branchIdParam — URL `?branch=<id>` from useLocalSearchParams.
  //   3. merchant.selectedBranch?.id — server-resolved cold-open fallback.
  //   4. null → useRedeem throws { code: 'NULL_BRANCH' } → reopens picker.
  const redeem = useRedeem({
    voucherId: voucher?.id ?? '',
    getBranchId: () =>
      pickerConfirmedBranchId
      ?? branchIdParam
      ?? selectedBranch?.id
      ?? null,
  })

  // Picker → URL replace → open PinEntrySheet.
  //
  // Subscription gate (PR #44 review fix #1): defensive in-depth guard.
  // The picker should never open for a free user (handleChangeBranch +
  // handleCTA both gate above), but if a future code path opens it
  // without going through those, this guard ensures we still don't
  // open PIN entry for non-subscribed users.
  //
  // Redeemed-this-cycle gate (locked 2026-05-07 from device QA): same
  // defence-in-depth philosophy as handleChangeBranch above. If a
  // future code path opens the picker for a redeemed user, this guard
  // ensures we still don't open PIN entry → backend ALREADY_REDEEMED
  // → confused user.
  const handlePickerConfirm = useCallback((branchId: string) => {
    // M4b-8: both redeemed states (cycle + window) hard-block picker
    // confirm — same defence-in-depth rationale as handleChangeBranch.
    if (isRedeemedState) {
      setPickerVisible(false)
      return
    }
    if (!isSubscribed) {
      setPickerVisible(false)
      router.push(buildSubscriptionUrl('monthly') as never)
      return
    }
    // Branch context is updated for BOTH intents — the URL replace
    // and the synchronous local picker source happen regardless.
    // Only the post-confirm step differs:
    //   • 'change' — close the picker, stay on Voucher Detail.
    //   • 'redeem' — close the picker, open PinEntrySheet.
    //
    // For 'change' intent specifically, store the confirmed branch
    // id locally so `handleBack` can route to that branch directly
    // (independent of `useLocalSearchParams` having caught up after
    // the router.replace below). `buildReturnUrl` reads this id to
    // append `branchChanged=1` AND to set the return URL's `branch`
    // param. Doesn't fire when the user picks the same branch they
    // were already on (no-op).
    if (pickerIntent === 'change' && branchId !== branchIdParam) {
      setChangedBranchOnVoucherId(branchId)
    }
    // Local source set FIRST (synchronous, ref-like). Subsequent
    // router.replace fires; URL catches up next render and the
    // useEffect above clears the local source.
    setPickerConfirmedBranchId(branchId)
    if (voucher) {
      const enc = encodeURIComponent
      const qs: string[] = [
        `branch=${enc(branchId)}`,
        `from=${enc(params.from ?? 'merchant')}`,
        `returnMerchantId=${enc(params.returnMerchantId ?? voucher.merchant.id)}`,
        `tab=${enc(params.tab ?? 'vouchers')}`,
      ]
      if (suppressPrompt) qs.push('suppressSubscribePrompt=1')
      router.replace(`/voucher/${enc(voucher.id)}?${qs.join('&')}` as never)
    }
    setPickerVisible(false)
    if (pickerIntent === 'redeem') {
      setPinSheetVisible(true)
    }
    // 'change' intent: stop here. PIN sheet stays closed; user
    // remains on Voucher Detail with the new branch context.
  }, [isRedeemedState, isSubscribed, router, buildSubscriptionUrl, voucher, params.from, params.returnMerchantId, params.tab, suppressPrompt, pickerIntent, branchIdParam])

  // PIN submit → mutate → success | typed error.
  const handlePinSubmit = useCallback(async (pin: string) => {
    try {
      const result = await redeem.mutateAsync({ pin })
      setPinSheetVisible(false)
      setSuccessPopup(result)
      setLastRedemption(result)
    } catch (err) {
      const e = err as UseRedeemError
      // NULL_BRANCH (client-side defensive) → reopen picker as
      // 'redeem' intent. The user was mid-redeem-flow; on confirm
      // they should proceed to PIN (not just update branch context).
      if (e?.code === 'NULL_BRANCH') {
        setPinSheetVisible(false)
        setPickerIntent('redeem')
        setPickerVisible(true)
        return
      }
      // ALREADY_REDEEMED → close sheet, refetch voucher (state machine
      // will re-derive to 'redeemed-this-cycle' on next render), and
      // call redeem.reset() so the typed error doesn't linger in
      // mutation state. Without the reset, `redeem.error` stays set
      // until the next mutation runs, which would render through
      // PinEntrySheet's `error` prop the next time the sheet opens
      // (defensive only — sheet's own backendErrorBanner switch has
      // no ALREADY_REDEEMED branch, but the residual state still
      // makes test assertions and on-device debug overlays misleading).
      if (e?.code === 'ALREADY_REDEEMED') {
        setPinSheetVisible(false)
        voucherQuery.refetch()
        redeem.reset()
        return
      }
      // INVALID_PIN / PIN_RATE_LIMIT_EXCEEDED / others — stay on the
      // sheet; the typed error flows to PinEntrySheet via the `error`
      // prop and drives the shake / attempts-remaining / lockout UI.
    }
  }, [redeem, voucherQuery])

  // Picker branches list — filter + sort (locked 2026-05-07 from
  // device QA).
  //
  //   Filter: active only. Inactive branches must NOT appear because
  //   the backend rejects redemption with BRANCH_UNAVAILABLE per
  //   PR #43, and surfacing them would be a usability bug (user
  //   picks, then gets rejected at submit).
  //
  //   Sort:
  //     1. Current/target branch first — matches the picker's
  //        already-selected pre-state (BranchPickerSheet's
  //        `currentBranchId` defaults to the same three-tier source).
  //        Putting it on top means "tap Confirm" is a one-step
  //        confirmation, not a scroll-and-find.
  //     2. Remaining branches sorted by ascending distance.
  //     3. Branches without distance (null) sit AFTER all
  //        branches with distance — those rows are usually the
  //        far-away ones where GPS didn't apply or the row is
  //        fixture/seed data without coords.
  //     4. Final tie-break on name (A→Z) for deterministic order
  //        when two branches have the same distance (rare).
  const pickerBranches: PickerBranch[] = useMemo(() => {
    if (!merchant) return []
    const currentId =
      pickerConfirmedBranchId ?? branchIdParam ?? selectedBranch?.id ?? null

    const active = merchant.branches.filter((b) => b.isActive)
    return [...active]
      .sort((a, b) => {
        // Current first.
        if (a.id === currentId && b.id !== currentId) return -1
        if (b.id === currentId && a.id !== currentId) return 1
        // Distance: nulls after non-nulls.
        if (a.distance == null && b.distance != null) return 1
        if (b.distance == null && a.distance != null) return -1
        // Both non-null, ascending distance.
        if (a.distance != null && b.distance != null && a.distance !== b.distance) {
          return a.distance - b.distance
        }
        // Tie-break: alphabetical by name.
        return a.name.localeCompare(b.name)
      })
      .map((b) => ({
        id:             b.id,
        name:           b.name,
        city:           b.city,
        distanceMetres: b.distance,
      }))
  }, [merchant, pickerConfirmedBranchId, branchIdParam, selectedBranch])

  // RedeemCTA derivation per state. Active states gate on `branchReady`.
  //
  // M4b-8 — the CTA `variant: 'disabled-window'` is a NEW shape returned
  // here for the two time-limited-unavailable-* states. The existing
  // `<RedeemCTA>` component doesn't render that variant; the JSX
  // consumer below branches on `cta.variant === 'disabled-window'` and
  // mounts a navy two-line inline view instead of the standard primary
  // CTA. The `scheduleSubline` field flows through to that inline render.
  const cta = useMemo(() => {
    switch (stateKey) {
      case 'free-user':
        return { label: CTA_LABELS.redeemSubscribe, disabled: false, variant: 'subscribe' as const, testID: 'redeem-cta-subscribe' }
      case 'can-redeem':
      case 'time-limited-active':
      case 'time-limited-urgent':
        if (!branchReady) {
          // Branch unresolved — URL/picker target hasn't matched a
          // row in `merchant.branches` yet (refetch race), or the
          // cold-open fallback hasn't completed. Return `null` so
          // the sticky CTA wrap doesn't render. Locked 2026-05-07
          // from device QA — the previous "Resolving Branch…"
          // disabled primary button flashed as the customer's first
          // CTA impression on hard-load / app relaunch / post-login,
          // which read as "broken/uncertain" rather than "loading".
          // Hiding the wrap is preferable to a large alarming
          // disabled button.
          return null
        }
        return { label: CTA_LABELS.redeemActive, disabled: false, variant: 'primary' as const, testID: 'redeem-cta-active' }
      case 'redeemed-this-cycle':
      case 'redeemed-this-window':
        return { label: CTA_LABELS.redeemed, disabled: true, variant: 'primary' as const, testID: 'redeem-cta-redeemed' }
      case 'expired':
        return { label: CTA_LABELS.expired, disabled: true, variant: 'primary' as const, testID: 'redeem-cta-expired' }
      case 'time-limited-unavailable-today':
      case 'time-limited-unavailable-future-day':
        // Disabled navy two-line CTA. Uses a NEW variant string so the
        // existing brand-red primary CTA can keep its current visual
        // treatment for the standard disabled cases (expired /
        // redeemed). The schedule is shown as the supporting line.
        return {
          label: 'Not Available Right Now',
          disabled: true,
          variant: 'disabled-window' as const,
          testID: 'redeem-cta-unavailable-window',
          scheduleSubline: formatScheduleString(voucher?.availabilityWindows ?? []),
        }
      default:
        return null
    }
  }, [stateKey, branchReady, voucher?.availabilityWindows])

  const handleCTA = useCallback(() => {
    if (stateKey === 'free-user') {
      // Sticky free-user CTA copy is "Subscribe to Redeem · £6.99/mo"
      // so plan=monthly matches the price the user just tapped.
      router.push(buildSubscriptionUrl('monthly') as never)
      return
    }
    // M2 Section B — active redeem states open the picker (multi-branch)
    // or PIN sheet directly (single-branch).
    //
    // Multi-branch picker is opened with `pickerIntent='redeem'` —
    // confirm updates the branch context AND opens PIN entry. This
    // is the inverse of the change-branch intent set in
    // handleChangeBranch.
    if (
      stateKey === 'can-redeem' ||
      stateKey === 'time-limited-active' ||
      stateKey === 'time-limited-urgent'
    ) {
      if (isMultiBranch) {
        setPickerIntent('redeem')
        setPickerVisible(true)
      } else {
        setPinSheetVisible(true)
      }
      return
    }
    // Other states (redeemed-this-cycle, redeemed-this-window, expired,
    // time-limited-unavailable-*) — disabled CTAs, no handler.
  }, [stateKey, router, buildSubscriptionUrl, isMultiBranch])

  // ── Render ───────────────────────────────────────────────────────────

  if (stateKey === 'loading') {
    return (
      <View style={[styles.fullscreen, { paddingTop: insets.top }]} testID="voucher-detail-loading">
        <FallbackNav onBack={handleBack} insetTop={insets.top} />
        <View style={styles.loadingCenter}>
          <RedeemoLoader size="lg" accessibilityLabel="Loading voucher" />
        </View>
      </View>
    )
  }

  if (stateKey === 'error' || !voucher) {
    const errorReason: 'voucher' | 'branch' =
      (!voucher || voucherQuery.isError) ? 'voucher' : 'branch'
    const errorTitle = errorReason === 'voucher' ? 'Voucher unavailable' : 'Couldn’t load branch'
    const errorBody  = errorReason === 'voucher'
      ? 'This voucher is no longer available. The merchant may have removed it or it expired.'
      : 'We couldn’t resolve the branch you’re redeeming at. Check your connection and try again.'
    return (
      <View style={[styles.fullscreen, { paddingTop: insets.top }]} testID="voucher-detail-error" data-error-reason={errorReason}>
        <FallbackNav onBack={handleBack} insetTop={insets.top} />
        <View style={styles.errorCenter}>
          <Text variant="heading.sm" style={styles.errorTitle}>{errorTitle}</Text>
          <Text variant="body.sm" color="secondary" style={styles.errorBody}>{errorBody}</Text>
          <Pressable onPress={handleBack} style={styles.errorBack} accessibilityRole="button" accessibilityLabel="Go back">
            <Text variant="label.md" style={styles.errorBackText}>Go back</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.fullscreen]} testID={`voucher-detail-state-${stateKey}`}>
      <AnimatedScrollView
        ref={scrollViewRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* ── Coupon stack ── */}
        <View style={styles.coupon}>
          {/* Hero + outer perforation — wrapped TOGETHER in an
              Animated.View so the perforation cutouts stay locked
              to the hero's bottom edge during overscroll (round-9
              fix). Round-7 anchored only the hero, leaving the
              perforation cutouts to drift down with the body
              cards — visible in QA as the cutouts moving away
              from the hero on pull-down. The body cards (top card
              + body card + merchant row + how-it-works) remain
              outside this wrapper so they still rubber-band with
              the gesture, opening the cream gap below the
              perforation. */}
          <Animated.View style={heroAnchorStyle}>
            {/* Hero treatment when redeemed (locked 2026-05-09 from
                PR #49 device QA wave 4 — owner direction):
                  • Dimmed hero (opacity 0.55) — applied SELECTIVELY
                    to the voucher visual layer (gradient + content +
                    saveBadge) via the CouponHeader `dimmed` prop.
                    The nav row (back / share / favourite) stays at
                    full opacity per PR-B T8h owner direction
                    "navigation buttons are washed out".
                  • RedeemedSeal moved ONTO the hero as an absolute
                    overlay, like a physical stamp on the voucher
                    itself, instead of sitting as a standalone block
                    between the voucher and the merchant card.
                  • Sized to overlap the title/saving area so the
                    voucher reads as visibly "stamped redeemed".
                  • Owner direction: "It is okay if it overlaps the
                    voucher text slightly, as long as the text is
                    still somewhat readable."
                Defers full washed-out coupon visual + polished SVG
                stamp to §Q1. */}
            <View style={styles.heroSealWrap}>
              <CouponHeader
                type={voucher.type}
                title={voucher.title}
                description={voucher.description}
                estimatedSaving={voucher.estimatedSaving}
                insetTop={insets.top}
                onBack={handleBack}
                onShare={handleShare}
                onFav={handleFav}
                isFavourited={voucher.isFavourited}
                scrollY={scrollY}
                fadeStart={FADE_START}
                fadeEnd={FADE_END}
                collapsedActive={collapsedActive}
                dimmed={showRedeemedSeal}
              />
              {showRedeemedSeal ? (
                <View
                  style={[styles.heroSealOverlay, { top: insets.top + 96 }]}
                  pointerEvents="none"
                  testID="voucher-detail-hero-seal"
                >
                  <RedeemedSeal
                    voucherType={voucher.type}
                    availableAgainAt={voucher.availableAgainAt ?? null}
                    nextWindowStartsAt={voucher.nextWindow?.startsAt ?? null}
                  />
                </View>
              ) : null}
            </View>
            <PerforationLine pageBg={PAGE_BG} variant="outer" />
          </Animated.View>

          {/* RedemptionDetailsCard — sits BETWEEN the hero (CouponHeader
              + outer perforation) AND the coupon body card on
              redeemed-this-cycle state. Locked 2026-05-07 from device
              QA: the card is the dominant post-redemption content
              (code + voucher summary + saved amount), but the hero
              still anchors visual identity, so the card belongs UNDER
              the hero, not above it.

              **§Q6 invariant (locked 2026-05-08):** the LOAD-BEARING
              gate is `stateKey === 'redeemed-this-cycle'`, NOT the
              presence of any redemption data. After cycle rollover
              `voucher.isRedeemedThisCycle` flips false → stateKey
              reverts → this branch returns null even if a stale
              `voucher.lastRedemption` persists in the payload.

              Source priority (post-M3 Task 17): in-memory
              `lastRedemption` (just-redeemed, freshest data + branch
              tile from merchant.branches) takes precedence over the
              persisted `voucher.lastRedemption` block from the
              backend payload (return visits during the active
              cycle). Both are merged into a single `displayRedemption`
              shape so the JSX stays readable. */}
          {(() => {
            // M4b-8: redeemed-this-window (TIME_LIMITED) surfaces the
            // RedemptionDetailsCard with the same in-memory PRIMARY +
            // persisted FALLBACK source priority as redeemed-this-cycle.
            if (!isRedeemedState) return null
            // Base shape from in-memory (PRIMARY) or persisted (FALLBACK).
            const baseDisplay = lastRedemption
              ? {
                  code:        lastRedemption.redemptionCode,
                  redeemedAt:  lastRedemption.redeemedAt,
                  branchName:  branchName,
                  // In-memory branch can't observe staff validation by
                  // itself (the redeem mutation response always returns
                  // isValidated:false). The session-scoped override
                  // below merges in the validated signal from
                  // ShowToStaff.onValidated.
                  isValidated: false,
                }
              : voucher.lastRedemption
                ? {
                    code:        voucher.lastRedemption.code,
                    redeemedAt:  voucher.lastRedemption.redeemedAt,
                    branchName:  voucher.lastRedemption.branch.name,
                    isValidated: voucher.lastRedemption.isValidated,
                  }
                : null
            if (!baseDisplay) return null
            // Apply validated-session override: if ShowToStaff's polling
            // observed validation for THIS code in this session, the
            // pill shows even before the next voucher payload refetch
            // lands. The refetch fires alongside the override (see the
            // ShowToStaff `onValidated` handler below) so subsequent
            // navigation away + back without a full relaunch picks up
            // the persisted truth too.
            const displayRedemption = {
              ...baseDisplay,
              isValidated: baseDisplay.isValidated || (validatedSession === baseDisplay.code),
            }
            return (
              <>
              <View style={styles.redeemedDetailsInStack}>
                <RedemptionDetailsCard
                  redemptionCode={displayRedemption.code}
                  redeemedAt={displayRedemption.redeemedAt}
                  branchName={displayRedemption.branchName}
                  voucherType={voucher.type}
                  voucherTitle={voucher.title}
                  merchantName={voucher.merchant.businessName}
                  estimatedSaving={voucher.estimatedSaving}
                  isValidated={displayRedemption.isValidated}
                  isPresentationActive={isPresentationActive}
                  onShowToStaff={() => {
                    // Defense-in-depth: even if the card's hidden CTA
                    // is somehow reached (re-render race, stale render
                    // tree, programmatic test invocation), refuse to
                    // mount ShowToStaff once the code surface has
                    // collapsed (out-of-window OR validated). The
                    // card hides the button visually; this guard
                    // hides the SURFACE. Uses `blockShowToStaffMount`
                    // (NOT `showRedeemedSeal`) so the seal can fire
                    // its visual treatment immediately on redemption
                    // without blocking the in-window Show-to-Staff
                    // flow. Locked 2026-05-09, PR #49 wave 8.
                    if (blockShowToStaffMount) return
                    setShowToStaff({
                      code:               displayRedemption.code,
                      redeemedAt:         displayRedemption.redeemedAt,
                      branchName:         displayRedemption.branchName ?? '',
                      // PR-B T1 — capture identity payload at open-time
                      // so the vertical-receipt surface always has it,
                      // even if the voucher query races with a branch
                      // switch.
                      voucherDescription: voucher.description,
                      merchantLogoUrl:    voucher.merchant.logoUrl ?? null,
                    })
                  }}
                />
              </View>
              {/* Review prompt — second entry point into the
                  verified-review flow (PR-C T16, locked 2026-05-09).
                  Mounts immediately after RedemptionDetailsCard in
                  the redeemed-this-cycle state.  Visibility is
                  load-bearing on `reviewPromptContext` (computed
                  above): non-null only when we have a real branchId
                  for the URL.  Routing prefers the in-memory
                  `lastRedemption.id` (Path A backend validation +
                  banner upfront on the sheet) and falls back to
                  branch-only when only the persisted shape is
                  available (Path B auto-link verifies on submit). */}
              {reviewPromptContext ? (
                <View style={styles.reviewPromptInStack}>
                  <ReviewPromptCard onPress={handleReviewPromptPress} />
                </View>
              ) : null}
              </>
            )
          })()}

          {/* CycleRulesCard / TimeLimitedDetailsCard — REDEEMED-STATE
              position (locked 2026-05-08 from device QA, M4b-8
              extension). Sits inside the coupon stack between
              RedemptionDetailsCard and the coupon body card.
              Once redeemed, the most-asked-question copy varies by
              voucher type:
                • cycle voucher → CycleRulesCard ("Renews on …")
                • TIME_LIMITED  → TimeLimitedDetailsCard (schedule
                                  + "Next available" copy)
              Both mount sites (in-stack here, out-of-stack below)
              are mutually exclusive via `stateKey` so the card never
              renders twice. */}
          {isRedeemedState ? (
            <View style={styles.redeemedCycleInStack}>
              {voucher.type === 'TIME_LIMITED' ? (
                <TimeLimitedDetailsCard
                  scheduleString={formatScheduleString(voucher.availabilityWindows)}
                  expiryDate={voucher.expiryDate}
                  windowState={timeLimited.windowState}
                  currentWindowEndsAt={voucher.currentWindow ? new Date(voucher.currentWindow.endsAt) : null}
                  nextWindowStartsAt={voucher.nextWindow ? new Date(voucher.nextWindow.startsAt) : null}
                />
              ) : (
                <CycleRulesCard
                  isMultiBranch={isMultiBranch}
                  availableAgainAt={voucher.availableAgainAt}
                  isRedeemed
                />
              )}
            </View>
          ) : null}

          <View style={styles.couponCardWrap}>
            <View style={styles.couponTopRound}>
              <CouponTopCard
                type={voucher.type}
                imageUrl={voucher.imageUrl}
                expiryDate={voucher.expiryDate}
                isMultiBranch={isMultiBranch}
                terms={voucher.terms}
              />
            </View>

            <View style={styles.innerPerfWrap}>
              <PerforationLine pageBg={PAGE_BG} variant="inner" />
            </View>

            <View style={styles.couponBottomRound}>
              <CouponBodyCard type={voucher.type} terms={voucher.terms} />
            </View>
          </View>
        </View>

        {/* Note (locked 2026-05-09, PR #49 device QA wave 4):
            previously we mounted a green "Redeemed this cycle"
            RedeemedBadge here AND a standalone RedeemedSeal block
            between the voucher and the merchant card. Owner direction
            consolidated both into a SINGLE surface — the seal is now
            an absolute overlay on the hero/banner above (see
            heroSealOverlay). No separate badge or middle-of-page
            seal mount remains: the page now signals "redeemed" with
            ONE visual treatment (stamped voucher) rather than two
            redundant indicators. */}

        {voucher.type === 'TIME_LIMITED' && !isRedeemed && timeLimited.windowState !== 'no-windows' ? (
          <View style={styles.tlBanner}>
            <TimeLimitedBanner
              windowState={timeLimited.windowState}
              scheduleString={formatScheduleString(voucher.availabilityWindows)}
              currentWindowEndsAt={voucher.currentWindow ? new Date(voucher.currentWindow.endsAt) : null}
              nextWindowStartsAt={voucher.nextWindow ? new Date(voucher.nextWindow.startsAt) : null}
            />
          </View>
        ) : null}

        {/* FrostedCountdown — TIME_LIMITED hero/secondary countdown
            (M4b-8). Mounts AFTER the coupon body, BEFORE the
            TimeLimitedBanner. Hidden in redeemed state (the seal + the
            persisted RedemptionDetailsCard carry the post-redemption
            messaging). Uses real-time `new Date()` — the underlying
            useTimeLimited hook already drives a 60s tick, so re-renders
            propagate naturally; the countdown helper formats from the
            current clock at render time. */}
        {voucher.type === 'TIME_LIMITED' && !isRedeemed && timeLimited.windowState !== 'no-windows' ? (
          <View style={styles.frostedCountdownWrap}>
            <FrostedCountdown
              windowState={timeLimited.windowState}
              now={new Date()}
              boundaryAt={
                (timeLimited.windowState === 'active' || timeLimited.windowState === 'urgent')
                  ? (voucher.currentWindow ? new Date(voucher.currentWindow.endsAt) : null)
                  : (voucher.nextWindow    ? new Date(voucher.nextWindow.startsAt)  : null)
              }
              scheduleString={formatScheduleString(voucher.availabilityWindows)}
            />
          </View>
        ) : null}

        {/* MerchantRow mode + branch values per state (locked 2026-05-07
            from device QA):
              • active redeemable          → mode='redeem',
                                             branchName/distance from displayBranch.
              • redeemed + lastRedemption  → mode='redeemed-known',
                                             branchName/distance from
                                             lastRedemptionBranch (the
                                             actual redemption branch,
                                             NOT the URL target).
              • redeemed return-visit (M3+) → resolved from
                                             `voucher.lastRedemption.
                                             branch.name` via the
                                             FALLBACK path in
                                             `displayRedemption`
                                             above. The
                                             `redeemed-unknown`
                                             mode survives only
                                             when both in-memory and
                                             persisted sources are
                                             null (defensive).
        */}
        {/* CycleRulesCard / TimeLimitedDetailsCard — NON-REDEEMED-STATE
            position (locked 2026-05-08 from device QA, M4b-8
            extension). Sits between the coupon body card and
            MerchantRow so the rule + dates are visible BEFORE the
            user hits the redeem CTA.
              • cycle voucher → CycleRulesCard (early-returns if
                                availableAgainAt is null, so free
                                users / guests show nothing).
              • TIME_LIMITED  → TimeLimitedDetailsCard with the
                                schedule + window-state-aware copy.
            Both redeemed-state mount-sites are inside the coupon
            stack (above). Mutually exclusive via `isRedeemedState`. */}
        {!isRedeemedState ? (
          voucher.type === 'TIME_LIMITED' && timeLimited.windowState !== 'no-windows' ? (
            <View style={styles.tlDetailsCardWrap}>
              <TimeLimitedDetailsCard
                scheduleString={formatScheduleString(voucher.availabilityWindows)}
                expiryDate={voucher.expiryDate}
                windowState={timeLimited.windowState}
                currentWindowEndsAt={voucher.currentWindow ? new Date(voucher.currentWindow.endsAt) : null}
                nextWindowStartsAt={voucher.nextWindow ? new Date(voucher.nextWindow.startsAt) : null}
              />
            </View>
          ) : (
            <CycleRulesCard
              isMultiBranch={isMultiBranch}
              availableAgainAt={voucher.availableAgainAt}
              isRedeemed={false}
            />
          )
        ) : null}

        <MerchantRow
          merchantName={voucher.merchant.businessName}
          merchantLogoUrl={voucher.merchant.logoUrl}
          merchantDescriptor={merchantDescriptor}
          branchName={
            isRedeemedState && lastRedemptionBranch
              ? lastRedemptionBranch.name
              : branchName
          }
          branchDistanceMeters={
            isRedeemedState && lastRedemptionBranch
              ? lastRedemptionBranch.distance
              : branchDistance
          }
          isMultiBranch={isMultiBranch}
          onChangeBranch={handleChangeBranch}
          disableChangeBranch={isRedeemedState}
          mode={
            isRedeemedState
              ? (lastRedemptionBranch ? 'redeemed-known' : 'redeemed-unknown')
              : 'redeem'
          }
          onPress={handleMerchantTap}
        />

        {/* "What is a <type> voucher?" — voucher-type explainer card.
            Collapsed by default (locked 2026-05-08 from device QA);
            tap the header to expand. Educates first-time customers
            on what THIS TYPE of voucher (BOGO, FREEBIE, etc.) means
            in general. Distinct from the merchant-authored offer
            description (which lives in the hero teaser) — this card
            is type-driven, not description-driven. */}
        <VoucherTypeExplainerCard type={voucher.type} onExpand={handleCardExpand} />

        {/* "How It Works" — round 16: shown for ALL states with
            subscription-aware copy. Free-user variant inserts the
            "Subscribe to Unlock" step inline so the user sees the
            full journey including the conversion gate. Subscribed
            variant is the redemption flow without that detour. Both
            variants include the "Tell Staff Before Ordering" fairness
            step. See productCopy.ts for the exact copy.
            Round 15 hid this for free users; round 16 owner direction
            restored it with a free-user-specific 7-step list. */}
        <HowItWorks isSubscribed={isSubscribed} onExpand={handleCardExpand} />

        {/* Spacer above the sticky CTA. Round-7 trim: insets.bottom
            + 30 (= 64 on iPhone Pro Max). Step 4's bottom edge
            tucks just under the CTA wrap when fully scrolled — the
            CTA wrap covers ~134pt at the bottom, of which 64pt is
            this spacer + ~70pt above (which is mostly step 4's
            natural margin). Visible blank below "Enjoy Your Deal!"
            during normal reading drops from ~104pt → ~64pt. */}
        <View style={{ height: insets.bottom + 30 }} />
      </AnimatedScrollView>

      {/* CollapsedHeader overlay — pinned at top, cream-gradient
          surface, opacity scroll-driven, single-threshold
          pointerEvents. Round-12: back + logo + merchant + branch,
          with the same vertical cream gradient as the merchant
          profile's identity zone (#FFF9F5 → #FCF0E5).
          Logo is branch-aware — displayBranch.logoUrl wins over
          merchant.logoUrl, mirroring the merchant profile pattern.
          (Reads displayBranch instead of selectedBranch so the logo
          tracks the URL/picker target, not stale selectedBranch.) */}
      <CollapsedHeader
        merchantName={voucher.merchant.businessName}
        branchName={branchName}
        logoUrl={displayBranch?.logoUrl ?? voucher.merchant.logoUrl ?? null}
        insetTop={insets.top}
        scrollY={scrollY}
        fadeStart={FADE_START}
        fadeEnd={FADE_END}
        isActive={collapsedActive}
        onBack={handleBack}
      />

      {cta ? (
        <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
          {cta.variant === 'disabled-window' ? (
            // M4b-8: TIME_LIMITED unavailable-today / unavailable-future-day
            // disabled-navy two-line CTA. The standard <RedeemCTA> only
            // knows 'primary' | 'subscribe'; rendering the new variant
            // here inline keeps the existing component focused on the
            // two active CTA paths while giving the unavailable state
            // its own visual register (navy not red, supports a
            // schedule subline).
            <View
              style={styles.ctaDisabledNavy}
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              accessibilityLabel={cta.label}
              testID={cta.testID}
            >
              <Text variant="heading.sm" style={styles.ctaDisabledNavyTitle}>{cta.label}</Text>
              {cta.scheduleSubline ? (
                <Text variant="label.md" style={styles.ctaDisabledNavySub}>
                  {cta.scheduleSubline}
                </Text>
              ) : null}
            </View>
          ) : (
            <RedeemCTA
              label={cta.label}
              disabled={cta.disabled}
              variant={cta.variant}
              onPress={handleCTA}
              testID={cta.testID}
            />
          )}
        </View>
      ) : null}

      {/* Round-16: subscription prompt for non-subscribed users
          browsing a voucher. Shown ONCE per focus visit after
          voucher data loads; dismissible via "Maybe later" or tap-
          out. Plan buttons + the embedded primary CTA all route to
          /(auth)/subscription-prompt — the actual plan selection
          happens there. */}
      <SubscriptionPromptModal
        visible={showSubscriptionPrompt}
        onDismiss={() => setPromptDismissed(true)}
        onSubscribe={(plan) => {
          setPromptDismissed(true)
          router.push(buildSubscriptionUrl(plan) as never)
        }}
      />

      {/* ── M2 Section B: redemption flow surfaces ──────────────────── */}
      {/* Picker `currentBranchId` MUST use the same URL-first priority
          as the redemption mutation (per PR #44 review fix #2). Without
          this, a user who switched branches recently (URL=B2) but is
          still seeing keepPreviousData merchant snapshot (selectedBranch=B1)
          would open the picker pre-selected on B1 and confirm B1 by
          accident. Three-tier priority match:
          pickerConfirmedBranchId ?? branchIdParam ?? selectedBranch?.id */}
      <BranchPickerSheet
        visible={pickerVisible}
        branches={pickerBranches}
        currentBranchId={
          pickerConfirmedBranchId
          ?? branchIdParam
          ?? selectedBranch?.id
          ?? null
        }
        onConfirm={handlePickerConfirm}
        onDismiss={() => setPickerVisible(false)}
        intent={pickerIntent}
      />
      <PinEntrySheet
        visible={pinSheetVisible}
        merchantName={voucher?.merchant.businessName ?? ''}
        branchName={branchName}
        merchantLogoUrl={voucher?.merchant.logoUrl ?? null}
        isLoading={redeem.isPending}
        error={redeem.error}
        onSubmit={handlePinSubmit}
        onDismiss={() => setPinSheetVisible(false)}
      />
      {/* SuccessPopup mounts only when we have BOTH a redemption response
          AND the voucher data — guards against rendering with placeholder
          fallbacks (PR #44 review cleanup). */}
      {successPopup && voucher ? (
        <SuccessPopup
          visible
          redeemedAt={successPopup.redeemedAt}
          estimatedSaving={successPopup.estimatedSaving}
          voucherType={voucher.type}
          voucherTitle={voucher.title}
          merchantName={voucher.merchant.businessName}
          merchantLogoUrl={voucher.merchant.logoUrl ?? null}
          branchName={branchName}
          onShowToStaff={() => {
            // Primary CTA — "View voucher code" (D11 / §0.10).  Opens
            // the dedicated ShowToStaff screen where the live, anti-
            // fraud-protected code surface lives.  The popup itself
            // no longer renders the code (§0.9).
            //
            // `branchName` is `string | null` (display branch may not
            // resolve in races / cold-open paths); the `setShowToStaff`
            // state shape and the `<ShowToStaff>` prop both require
            // `string`. Coerce the null case to '' here at the
            // assignment boundary — same fallback as the persisted-
            // card path at displayRedemption.branchName ?? '' above.
            // Closes deferred-followups §AG9 (post-PR-#49).
            setSuccessPopup(null)
            setShowToStaff({
              code:               successPopup.redemptionCode,
              redeemedAt:         successPopup.redeemedAt,
              branchName:         branchName ?? '',
              // PR-B T1 — capture identity payload at open-time so the
              // vertical-receipt surface always has it.
              voucherDescription: voucher.description,
              merchantLogoUrl:    voucher.merchant.logoUrl ?? null,
            })
          }}
          onDone={() => setSuccessPopup(null)}
          // PR-C T13 (LOCKED 2026-05-09 §0.3.1): Rate & Review CTA
          // routes to the merchant profile reviews tab with the
          // verified-review URL contract:
          //   /merchant/<merchantId>?branch=<branchId>&tab=reviews
          //     &openWriteReview=1&fromRedemption=<redemptionId>
          // MerchantProfileScreen reads these params, forces
          // activeTab='reviews', forwards `initialOpenWriteFor` to
          // ReviewsTab (which auto-opens WriteReviewSheet), then
          // scrubs `openWriteReview` + `fromRedemption` via
          // router.replace so back-nav doesn't re-trigger the flow.
          //
          // Hide rule (§0.3.1 owner-locked): only render the CTA
          // when we have a reliable branchId.  `successPopup.branchId`
          // comes straight from the redemption response (RedeemResponse
          // schema pins it as a non-empty string), so when the popup
          // mounts, this prop is always present.  The defensive
          // truthiness guard below covers the (currently impossible
          // but defensive) empty-string case — empty branchId ⇒ no
          // prop ⇒ CTA hidden, NOT a malformed URL.  We do NOT fall
          // back to `branchName` (locked).
          {...(successPopup.branchId
            ? {
                onRateReview: () => {
                  setSuccessPopup(null)
                  router.push({
                    pathname: '/(app)/merchant/[id]',
                    params: {
                      id:              voucher.merchant.id,
                      branch:          successPopup.branchId,
                      tab:             'reviews',
                      openWriteReview: '1',
                      fromRedemption:  successPopup.id,
                    },
                  })
                },
              }
            : {})}
        />
      ) : null}
      {/* ShowToStaff full-screen Modal (M3 Task 16). Mounts only
          when both `showToStaff` state is set AND voucher data is
          present. customerName="" per the M3 §U1 lock — see
          ShowToStaff component header for the suppression contract. */}
      {showToStaff && voucher ? (
        <ShowToStaff
          visible
          redemptionCode={showToStaff.code}
          voucherTitle={voucher.title}
          voucherType={voucher.type}
          // PR-B T1 — vertical-receipt payload.  Captured in
          // `showToStaff` state alongside the existing `branchName`
          // snapshot for visual consistency on the receipt: branch
          // attribution can flip mid-modal via the URL param +
          // `displayBranch` resolver, and once we're snapshotting one
          // identity field we keep the description + logo on the
          // same snapshot rhythm.  `voucherTitle` / `voucherType` /
          // `merchantName` continue to read from the live `voucher`
          // query — voucher-level identity is stable mid-session by
          // contract (voucher id doesn't change while the modal is
          // open).
          voucherDescription={showToStaff.voucherDescription}
          merchantName={voucher.merchant.businessName}
          merchantLogoUrl={showToStaff.merchantLogoUrl}
          branchName={showToStaff.branchName}
          customerName=""
          redeemedAt={showToStaff.redeemedAt}
          onValidated={() => {
            // Two-layer update so the validated pill reflects truth on
            // BOTH the immediate post-dismiss render AND on subsequent
            // navigation away + back:
            //   (1) Session override — paints the pill on the in-memory
            //       branch (which can't observe staff scan otherwise).
            //   (2) Refetch — pulls the persisted
            //       `voucher.lastRedemption.isValidated` so the FALLBACK
            //       branch picks up reality after a relaunch / cache
            //       eviction (PR #49 review fix).
            setValidatedSession(showToStaff.code)
            voucherQuery.refetch().catch(() => { /* best-effort */ })
          }}
          onDone={() => setShowToStaff(null)}
        />
      ) : null}

      {/* iOS post-fact screenshot banner. Surfaces only when
          `useScreenshotGuard` fires while the code is visible.
          Non-blocking overlay anchored to the safe-area top so it
          floats above the scroll without taking layout space. Auto-
          dismisses after 4s (see effect above) or immediately when
          the gate flips closed. Locked 2026-05-09, PR #49 device QA. */}
      {screenshotBannerVisible ? (
        <View
          style={[styles.screenshotBanner, { top: insets.top + 12 }]}
          pointerEvents="none"
          testID="voucher-detail-screenshot-banner"
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          <Text variant="label.md" style={styles.screenshotBannerText}>
            Screenshot detected. Staff verify only the live screen.
          </Text>
        </View>
      ) : null}
    </View>
  )
}

// ── Fallback nav for loading / error states (no hero to attach to) ─────

function FallbackNav({ onBack, insetTop }: { onBack: () => void; insetTop: number }) {
  return (
    <View style={[styles.fallbackNavRow, { top: insetTop + 8 }]}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={10}
        style={({ pressed }) => [styles.fallbackNavBtn, pressed && styles.fallbackNavBtnPressed]}
      >
        {Platform.OS === 'android' ? (
          <View style={[StyleSheet.absoluteFillObject, styles.fallbackNavBtnFallback]} />
        ) : (
          <BlurView intensity={28} tint="default" style={StyleSheet.absoluteFillObject} />
        )}
        <ArrowLeft size={20} color={color.navy} strokeWidth={2.4} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 0,
  },

  // ── Fallback nav (loading / error states) ───────────────────────────
  fallbackNavRow: {
    position: 'absolute',
    left: 22,
    right: 22,
    zIndex: 20,
    flexDirection: 'row',
  },
  fallbackNavBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  fallbackNavBtnPressed: {
    opacity: 0.85,
  },
  fallbackNavBtnFallback: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },

  // ── Coupon stack ────────────────────────────────────────────────────
  // Round-7: even stronger card prominence so the voucher reads as a
  // distinct shaped object resting on the cream page. Shadow opacity
  // 0.12 → 0.18, radius 28 → 32, plus a faint hairline border on
  // both top + bottom cards to define the coupon silhouette against
  // the cream bg. Top card also gets a subtle horizontal-side
  // shadow so the whole stack reads as continuous elevation.
  coupon: {},
  couponCardWrap: {
    marginHorizontal: COUPON_INSET,
  },
  couponTopRound: {
    backgroundColor: '#FDFBF8',  // round-13: tinted warm white (brand hue family) — see CouponBody.tsx
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  couponBottomRound: {
    backgroundColor: '#FDFBF8',  // round-13: tinted warm white (brand hue family) — see CouponBody.tsx
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  innerPerfWrap: {
    backgroundColor: '#FDFBF8',  // round-13: tinted warm white (brand hue family) — see CouponBody.tsx
    overflow: 'visible',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },

  // ── Time-limited banner spacing ─────────────────────────────────────
  tlBanner: {
    marginTop: 14,
    marginHorizontal: 22,
  },
  // FrostedCountdown wrapper — same horizontal margin as the banner.
  // The component itself owns marginTop:14 internally, matching the
  // banner's rhythm.
  frostedCountdownWrap: {
    marginHorizontal: 22,
  },
  // TimeLimitedDetailsCard wrapper (M4b-8). Card has its own
  // marginTop:14 internally; only the horizontal inset is needed
  // to align with CycleRulesCard / sibling cards on the page.
  tlDetailsCardWrap: {
    marginHorizontal: 22,
  },

  // RedemptionDetailsCard wrapper — INSIDE the coupon stack between
  // hero+perforation and coupon body. Locked 2026-05-08 spacing
  // standardisation — every card-level gap on the page is 16pt;
  // marginTop here, no marginBottom. The next card (CycleRulesCard)
  // brings its own marginTop:16 for the gap.
  redeemedDetailsInStack: {
    marginTop: 16,
    marginHorizontal: 22,
  },
  // Review prompt sits 16pt below RedemptionDetailsCard with the same
  // horizontal margin so the two redeemed-state cards read as a
  // coherent vertical stack (staff-handoff card → secondary review
  // prompt → cycle rules below).  PR-C T16, locked 2026-05-09.
  reviewPromptInStack: {
    marginTop: 16,
    marginHorizontal: 22,
  },
  // CycleRulesCard wrapper for the IN-STACK redeemed-state mount.
  // CycleRulesCard's own card style has marginTop:16 (inherited
  // from the standardised card-gap pattern), but it has no
  // marginBottom — the next sibling (couponCardWrap) doesn't carry
  // a marginTop because it relies on perforation visual continuity
  // in the non-redeemed flow. So in the redeemed flow we add
  // marginBottom:16 here to keep the 16pt gap consistent.
  redeemedCycleInStack: {
    marginBottom: 16,
  },

  // (Hero dimming was previously a wrapping `<View style={heroDimmed}>`
  // around the entire CouponHeader subtree — that washed out the back /
  // share / favourite nav buttons too.  PR-B T8h moves the dim INTO
  // CouponHeader as a `dimmed` prop applied selectively to the gradient
  // + content + saveBadge.  The wrapper + style here are intentionally
  // gone.)

  // Hero-seal overlay positioning (locked 2026-05-09, PR #49 device
  // QA wave 4). The seal mounts as an absolute overlay anchored to
  // the hero so it sits ON TOP of the dimmed banner — like a
  // physical stamp on paper. `top` is set inline to `insets.top + 96`
  // so it lands over the title/saving area regardless of safe-area
  // device variance. `pointerEvents=none` so the seal doesn't
  // intercept hero taps.
  heroSealWrap: {
    position: 'relative',
  },
  heroSealOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },

  // iOS post-fact screenshot banner. Floats top-anchored over the
  // scroll; pointerEvents=none so it doesn't intercept taps.
  screenshotBanner: {
    position: 'absolute',
    left: 22,
    right: 22,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    zIndex: 30,
  },
  screenshotBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
    textAlign: 'center',
  },


  // ── Sticky CTA ──────────────────────────────────────────────────────
  ctaWrap: {
    paddingTop: 10,
    backgroundColor: PAGE_BG,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 },
    elevation: 5,
  },

  // ── Disabled-window CTA (M4b-8) ─────────────────────────────────────
  // Navy two-line static block used by the TIME_LIMITED
  // unavailable-today / unavailable-future-day states. Not a Pressable —
  // there's no action to take, the schedule subline tells the user
  // when to come back. Sits inside the same ctaWrap as the standard
  // <RedeemCTA>, so it inherits the wrap's safe-area padding and
  // top-shadow rhythm.
  ctaDisabledNavy: {
    backgroundColor: '#0A1B3A',  // brand navy
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginHorizontal: 22,
  },
  ctaDisabledNavyTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  ctaDisabledNavySub: {
    color: 'rgba(255,255,255,0.78)',
    marginTop: 2,
  },

  // ── Loading + error ─────────────────────────────────────────────────
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: color.navy,
  },
  errorBody: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
    paddingHorizontal: 16,
  },
  errorBack: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: color.navy,
  },
  errorBackText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
})
