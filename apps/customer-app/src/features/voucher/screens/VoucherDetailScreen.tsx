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
import { RedeemedBadge } from '../components/RedeemedBadge'
import { TimeLimitedBanner } from '../components/TimeLimitedBanner'
import { CollapsedHeader } from '../components/CollapsedHeader'
import { SubscriptionPromptModal } from '../components/SubscriptionPromptModal'
// M2 Section B — redemption flow components + hook
import { BranchPickerSheet, type PickerBranch } from '../components/BranchPickerSheet'
import { PinEntrySheet } from '../components/PinEntrySheet'
import { SuccessPopup } from '../components/SuccessPopup'
import { RedemptionDetailsCard } from '../components/RedemptionDetailsCard'
import { useRedeem, type UseRedeemError } from '../hooks/useRedeem'
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

type VoucherStateKey =
  | 'loading'
  | 'error'
  | 'free-user'
  | 'expired'
  | 'redeemed-this-cycle'
  | 'time-limited-unavailable'
  | 'time-limited-urgent'
  | 'time-limited-available'
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
}): string | null {
  if (params.from === 'merchant' && params.returnMerchantId && params.branch) {
    const enc = encodeURIComponent
    const tab = params.tab ?? 'vouchers'
    return `/(app)/merchant/${enc(params.returnMerchantId)}?branch=${enc(params.branch)}&tab=${enc(tab)}`
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
  const selectedBranch = merchant?.selectedBranch ?? null
  const isMultiBranch  = (merchant?.branches.length ?? 0) > 1
  const branchName     = selectedBranch?.name ?? null
  const branchDistance = selectedBranch?.distance ?? null
  const merchantDescriptor = merchant?.descriptor ?? null
  const branchReady    = !!selectedBranch
  const branchErrored  = merchantQuery.isError || (
    !!merchant && !merchant.selectedBranch
  )

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
  const [pinSheetVisible, setPinSheetVisible] = useState(false)
  const [successPopup, setSuccessPopup] = useState<RedeemResponse | null>(null)
  const [lastRedemption, setLastRedemption] = useState<RedeemResponse | null>(null)
  const [pickerConfirmedBranchId, setPickerConfirmedBranchId] = useState<string | null>(null)

  // Clear the picker-local source once the URL catches up to its value.
  // After this clear, `getBranchId()` falls back to URL → selectedBranch.
  useEffect(() => {
    if (pickerConfirmedBranchId == null) return
    if (branchIdParam === pickerConfirmedBranchId) {
      setPickerConfirmedBranchId(null)
    }
  }, [branchIdParam, pickerConfirmedBranchId])
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

  // ── 12-state derivation ────────────────────────────────────────────
  const stateKey: VoucherStateKey = useMemo(() => {
    if (voucherQuery.isLoading || isSubLoading) return 'loading'
    if (voucherQuery.isError || !voucher) return 'error'
    if (branchErrored) return 'error'

    if (voucher.expiryDate) {
      const exp = new Date(voucher.expiryDate)
      if (exp.getTime() <= Date.now()) return 'expired'
    }

    if (voucher.isRedeemedThisCycle) return 'redeemed-this-cycle'

    if (!isSubscribed) return 'free-user'

    if (timeLimited.isTimeLimited) {
      if (!timeLimited.isCurrentlyAvailable) return 'time-limited-unavailable'
      if (timeLimited.isUrgent) return 'time-limited-urgent'
      return 'time-limited-available'
    }

    return 'can-redeem'
  }, [voucherQuery.isLoading, voucherQuery.isError, voucher, isSubLoading, isSubscribed, timeLimited, branchErrored])

  // Back navigation — URL-only, does NOT depend on voucher/merchant
  // queries having resolved. Round-5 plan §1.
  const handleBack = useCallback(() => {
    lightHaptic()
    const returnUrl = buildReturnUrl({
      from:             params.from,
      returnMerchantId: params.returnMerchantId,
      branch:           params.branch,
      tab:              params.tab,
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
  }, [router, params.from, params.returnMerchantId, params.branch, params.tab])

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
  const handleChangeBranch = useCallback(() => {
    if (!isSubscribed) {
      router.push(buildSubscriptionUrl('monthly') as never)
      return
    }
    setPickerVisible(true)
  }, [isSubscribed, router, buildSubscriptionUrl])

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
  const handlePickerConfirm = useCallback((branchId: string) => {
    if (!isSubscribed) {
      setPickerVisible(false)
      router.push(buildSubscriptionUrl('monthly') as never)
      return
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
    setPinSheetVisible(true)
  }, [isSubscribed, router, buildSubscriptionUrl, voucher, params.from, params.returnMerchantId, params.tab, suppressPrompt])

  // PIN submit → mutate → success | typed error.
  const handlePinSubmit = useCallback(async (pin: string) => {
    try {
      const result = await redeem.mutateAsync({ pin })
      setPinSheetVisible(false)
      setSuccessPopup(result)
      setLastRedemption(result)
    } catch (err) {
      const e = err as UseRedeemError
      // NULL_BRANCH (client-side defensive) → reopen picker.
      if (e?.code === 'NULL_BRANCH') {
        setPinSheetVisible(false)
        setPickerVisible(true)
        return
      }
      // ALREADY_REDEEMED → close sheet, refetch voucher (state machine
      // will re-derive to 'redeemed-this-cycle' on next render).
      if (e?.code === 'ALREADY_REDEEMED') {
        setPinSheetVisible(false)
        voucherQuery.refetch()
        return
      }
      // INVALID_PIN / PIN_RATE_LIMIT_EXCEEDED / others — stay on the
      // sheet; the typed error flows to PinEntrySheet via the `error`
      // prop and drives the shake / attempts-remaining / lockout UI.
    }
  }, [redeem, voucherQuery])

  // Picker branches list — filter to active branches only. Inactive
  // branches must NOT appear because the backend rejects redemption
  // with BRANCH_UNAVAILABLE per PR #43 (and surfacing them in a picker
  // would be a usability bug — user picks, gets rejected at submit).
  const pickerBranches: PickerBranch[] = useMemo(() => {
    if (!merchant) return []
    return merchant.branches
      .filter((b) => b.isActive)
      .map((b) => ({
        id: b.id,
        name: b.name,
        city: b.city,
        distanceMetres: b.distance,
      }))
  }, [merchant])

  // RedeemCTA derivation per state. Active states gate on `branchReady`.
  const cta = useMemo(() => {
    switch (stateKey) {
      case 'free-user':
        return { label: CTA_LABELS.redeemSubscribe, disabled: false, variant: 'subscribe' as const, testID: 'redeem-cta-subscribe' }
      case 'can-redeem':
      case 'time-limited-available':
      case 'time-limited-urgent':
        if (!branchReady) {
          return { label: CTA_LABELS.branchLoading, disabled: true, variant: 'primary' as const, testID: 'redeem-cta-branch-loading' }
        }
        return { label: CTA_LABELS.redeemActive, disabled: false, variant: 'primary' as const, testID: 'redeem-cta-active' }
      case 'redeemed-this-cycle':
        return { label: CTA_LABELS.redeemed, disabled: true, variant: 'primary' as const, testID: 'redeem-cta-redeemed' }
      case 'expired':
        return { label: CTA_LABELS.expired, disabled: true, variant: 'primary' as const, testID: 'redeem-cta-expired' }
      case 'time-limited-unavailable':
        return { label: CTA_LABELS.unavailable, disabled: true, variant: 'primary' as const, testID: 'redeem-cta-unavailable' }
      default:
        return null
    }
  }, [stateKey, branchReady])

  const handleCTA = useCallback(() => {
    if (stateKey === 'free-user') {
      // Sticky free-user CTA copy is "Subscribe to Redeem · £6.99/mo"
      // so plan=monthly matches the price the user just tapped.
      router.push(buildSubscriptionUrl('monthly') as never)
      return
    }
    // M2 Section B — active redeem states open the picker (multi-branch)
    // or PIN sheet directly (single-branch).
    if (
      stateKey === 'can-redeem' ||
      stateKey === 'time-limited-available' ||
      stateKey === 'time-limited-urgent'
    ) {
      if (isMultiBranch) {
        setPickerVisible(true)
      } else {
        setPinSheetVisible(true)
      }
      return
    }
    // Other states (redeemed-this-cycle, expired, time-limited-unavailable)
    // — disabled CTA, no handler. RedeemCTA already early-returns on
    // disabled, so this branch is defensive only.
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
            />
            <PerforationLine pageBg={PAGE_BG} variant="outer" />
          </Animated.View>

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

        {stateKey === 'redeemed-this-cycle' ? (
          <>
            <RedeemedBadge redeemedAt={lastRedemption?.redeemedAt ?? null} />
            {/* M2 Section B: full RedemptionDetailsCard ONLY when we have
                the redemption response in memory (immediately after
                successful redeem, before the user navigates away). On
                return-visit lastRedemption is null → fall back to the
                M1 RedeemedBadge above. Persisted return-visit details
                are §O6 in the deferred-followups index (M3 backend dep
                on lastRedeemedAt + redemptionCode + availableAgainAt
                fields on the voucher payload). */}
            {lastRedemption ? (
              <View style={styles.tlBanner}>
                <RedemptionDetailsCard
                  redemptionCode={lastRedemption.redemptionCode}
                  redeemedAt={lastRedemption.redeemedAt}
                  branchName={branchName}
                />
              </View>
            ) : null}
          </>
        ) : null}

        {timeLimited.isTimeLimited ? (
          <View style={styles.tlBanner}>
            <TimeLimitedBanner
              isCurrentlyAvailable={timeLimited.isCurrentlyAvailable}
              isUrgent={timeLimited.isUrgent}
              minutesRemaining={timeLimited.minutesRemaining}
            />
          </View>
        ) : null}

        <MerchantRow
          merchantName={voucher.merchant.businessName}
          merchantLogoUrl={voucher.merchant.logoUrl}
          merchantDescriptor={merchantDescriptor}
          branchName={branchName}
          branchDistanceMeters={branchDistance}
          isMultiBranch={isMultiBranch}
          onChangeBranch={handleChangeBranch}
          onPress={handleMerchantTap}
        />

        {/* "How It Works" — round 16: shown for ALL states with
            subscription-aware copy. Free-user variant inserts the
            "Subscribe to Unlock" step inline so the user sees the
            full journey including the conversion gate. Subscribed
            variant is the redemption flow without that detour. Both
            variants include the "Tell Staff Before Ordering" fairness
            step. See productCopy.ts for the exact copy.
            Round 15 hid this for free users; round 16 owner direction
            restored it with a free-user-specific 7-step list. */}
        <HowItWorks isSubscribed={isSubscribed} />

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
          Logo is branch-aware — selectedBranch.logoUrl wins over
          merchant.logoUrl, mirroring the merchant profile pattern. */}
      <CollapsedHeader
        merchantName={voucher.merchant.businessName}
        branchName={branchName}
        logoUrl={selectedBranch?.logoUrl ?? voucher.merchant.logoUrl ?? null}
        insetTop={insets.top}
        scrollY={scrollY}
        fadeStart={FADE_START}
        fadeEnd={FADE_END}
        isActive={collapsedActive}
        onBack={handleBack}
      />

      {cta ? (
        <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
          <RedeemCTA
            label={cta.label}
            disabled={cta.disabled}
            variant={cta.variant}
            onPress={handleCTA}
            testID={cta.testID}
          />
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
      />
      <PinEntrySheet
        visible={pinSheetVisible}
        merchantName={voucher?.merchant.businessName ?? ''}
        branchName={branchName}
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
          redemptionCode={successPopup.redemptionCode}
          redeemedAt={successPopup.redeemedAt}
          voucherTitle={voucher.title}
          voucherType={voucher.type}
          merchantName={voucher.merchant.businessName}
          branchName={branchName}
          onShowToStaff={() => {
            // M3 stub — full QR + brightness boost ships in M3.
            // For M2 the button routes to a small alert acknowledging
            // the deferral.
            Alert.alert(
              'Show to Staff',
              'The full-screen redemption display ships in the next milestone (M3). Your code is shown above — please show it to staff.',
            )
          }}
          onRateReview={() => {
            // M2 keeps the review path unchanged — closes the popup;
            // future milestones will route into the existing review flow.
            setSuccessPopup(null)
          }}
          onDone={() => setSuccessPopup(null)}
        />
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
