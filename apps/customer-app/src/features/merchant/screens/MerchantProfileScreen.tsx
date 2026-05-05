import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { View, StyleSheet, Share, Linking, Pressable, type LayoutChangeEvent } from 'react-native'
import Animated, {
  withTiming,
  withSequence,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  Easing,
} from 'react-native-reanimated'
import { useMotionScale } from '@/design-system/useMotionScale'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { Text, color } from '@/design-system'
import { ArrowLeft } from '@/design-system/icons'
import { useMerchantProfile } from '../hooks/useMerchantProfile'
import { useBranchSelection } from '../hooks/useBranchSelection'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { HeroBackdrop, HeroNav, HeroBannerSpacer } from '../components/HeroSection'
import { CollapsedHeader, COMPACT_BAR_HEIGHT } from '../components/CollapsedHeader'
import { RedeemoLoader } from '@/design-system/motion/RedeemoLoader'
import { MerchantDescriptor } from '../components/MerchantDescriptor'
import { MetaRow } from '../components/MetaRow'
import { ActionRow } from '../components/ActionRow'
import { TabBar, type TabId } from '../components/TabBar'
import { VouchersTab } from '../components/VouchersTab'
import { AboutTab } from '../components/AboutTab'
import { BranchesTab } from '../components/BranchesTab'
import { ReviewsTab } from '../components/ReviewsTab'
import { ContactSheet } from '../components/ContactSheet'
import { DirectionsSheet } from '../components/DirectionsSheet'
import { FreeUserGateModal } from '../components/FreeUserGateModal'
import { HoursPreviewSheet } from '../components/HoursPreviewSheet'
import { SuspendedBranchBanner } from '../components/SuspendedBranchBanner'
import { AllBranchesUnavailable } from '../components/AllBranchesUnavailable'
import { useFavourite } from '@/hooks/useFavourite'
import { useSubscription } from '@/hooks/useSubscription'
import { useUserLocation } from '@/hooks/useLocation'
import { MerchantHeadline } from '../components/MerchantHeadline'
import { BranchContextBand } from '../components/BranchContextBand'
import { BranchSwitchToast } from '../components/BranchSwitchToast'
import { branchShortName } from '../utils/branchShortName'

function buildBranchLine(branch: { city: string | null; name: string }): string | null {
  // Pass 1 fallback: city when available, else strip-prefix the branch name.
  // Branch.county schema migration (deferred §A) will eventually ship
  // "<city>, <county>"; until then we render city alone.
  if (branch.city) return branch.city
  const shortName = branchShortName(branch.name)
  return shortName || null
}

// M2 (collapsed sticky header): branch line for the COMPACT bar above
// the sticky TabBar. Format: `<branchShortName> · <city>` when both
// are present and distinct (e.g. "Old Foundry · Colchester"); falls
// back to either alone when the other is missing or they collapse
// to the same value (e.g. "Brightlingsea" branch in city
// "Brightlingsea" — middle-dot duplication looks ugly). Returns
// null when the merchant is single-branch (caller responsibility),
// in which case the collapsed header shows only the merchant name.
function buildCollapsedBranchLine(branch: { city: string | null; name: string }): string | null {
  const short = branchShortName(branch.name) || null
  if (short && branch.city && short !== branch.city) {
    return `${short} · ${branch.city}`
  }
  return short ?? branch.city ?? null
}

// Round 6 follow-up: custom entering animation for the tab
// content. Owner flagged the previous FadeIn(180ms) as too
// subtle on the Branches → Switch → Vouchers flow — there was
// no clear screen-transition cue. Now: 8pt translateY settle
// + fade over 280ms with the project-standard ease-out-expo
// curve. Spatial continuity (content arriving into place) +
// duration in the small-transition band per /interaction-
// design. Used by every tab transition, so the "you arrived"
// motion is consistent across Vouchers / About / Branches /
// Reviews.
const TAB_ENTER_MS = 280
const TAB_ENTER_EASING = Easing.bezier(0.16, 1, 0.3, 1)
function tabContentEnter() {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 8 }] },
    animations: {
      opacity: withTiming(1, { duration: TAB_ENTER_MS, easing: TAB_ENTER_EASING }),
      transform: [{ translateY: withTiming(0, { duration: TAB_ENTER_MS, easing: TAB_ENTER_EASING }) }],
    },
  }
}

// M2 — full Merchant Profile surface. Composes hero / meta / sticky tab bar
// and the four tabs (vouchers / about / branches / reviews) plus three
// sheets (contact / directions / free-user gate). Free users can BROWSE
// vouchers (per owner decision §9.1) but tapping a voucher's redeem-flow
// route shows the gate; subscribed users navigate to /voucher/[id] (route
// not yet on main — Voucher Detail is a separate next-next PR; tap-through
// 404s until that lands per owner decision §9.2).
//
// P2.8 — branch-aware rewire. The screen now reads every branch-scoped
// value from `merchant.selectedBranch.*` (resolved by the backend per
// `?branch=` query param + cold-open fallback). Legacy top-level fields
// (`merchant.openingHours`, `merchant.photos`, `merchant.amenities`,
// `merchant.distance`, `merchant.isOpenNow`, `merchant.nearestBranch`)
// remain in the schema for R1 dual-write compat but are no longer read.
// Open-status pill reads `sb.isOpenNow` directly; AboutTab still calls
// `useOpenStatus` internally for the schedule grid's TODAY-row marker.
type Props = { id: string | undefined }

export function MerchantProfileScreen({ id }: Props) {
  const { isSubscribed, isSubLoading } = useSubscription()

  // URL ↔ branch selection (P2.3). `branchId` from `?branch=`; `select`
  // pushes a new branch via router.replace; `reconcile` aligns the URL
  // with whatever the server resolved (cold-open or fallback path).
  const merchantId = id ?? ''
  const { branchId, select, reconcile } = useBranchSelection({ merchantId })

  // Pass GPS so the server can compute `distance` + resolve a nearest
  // candidate on cold-open. `branchId` (when present) pins selectedBranch.
  const { location } = useUserLocation()
  const profileOpts: { lat?: number; lng?: number; branchId?: string } = {
    ...(location ? { lat: location.lat, lng: location.lng } : {}),
    ...(branchId ? { branchId } : {}),
  }
  const { data: merchant, isLoading, isError, error } = useMerchantProfile(id, profileOpts)

  // Reconcile the URL with the server-resolved branch ONLY when the server
  // fell back from the user's candidate (cold-open / candidate-inactive /
  // candidate-not-found / no-candidate). For 'used-candidate' the URL
  // already matches the response — no reconcile needed.
  //
  // Why this gate matters: with `keepPreviousData`, when the user picks a
  // new branch via the chip, the URL flips immediately but `merchant` keeps
  // the prior fetch's data on screen for a frame (selectedBranch.id=prev,
  // fallbackReason='used-candidate'). Without the gate, the reconcile
  // effect re-fires (because `reconcile`'s identity tracks `branchId`),
  // sees URL=new !== resolved=prev, and writes the OLD id back to the URL.
  // Net effect: "tap a branch, nothing happens; tap again, it works."
  // The gate stops the spurious replace because 'used-candidate' means the
  // prior URL was already correct for the prior data — there's nothing to
  // reconcile against.
  useEffect(() => {
    if (
      merchant?.selectedBranch?.id &&
      merchant.selectedBranchFallbackReason !== 'used-candidate'
    ) {
      reconcile(merchant.selectedBranch.id)
    }
  }, [merchant?.selectedBranch?.id, merchant?.selectedBranchFallbackReason, reconcile])

  const favourite = useFavourite({
    type: 'merchant',
    id: merchant?.id ?? '',
    isFavourited: merchant?.isFavourited ?? false,
  })

  const [activeTab,           setActiveTab]           = useState<TabId>('vouchers')
  const [showContact,         setShowContact]         = useState(false)
  const [showDirs,            setShowDirs]            = useState(false)
  const [showGate,            setShowGate]            = useState(false)
  const [bannerDismissed,     setBannerDismissed]     = useState(false)
  const [hoursPreviewBranchId, setHoursPreviewBranchId] = useState<string | null>(null)
  // dirsBranchId: null → DirectionsSheet shows the SELECTED branch (sb) — the
  // existing ActionRow path. When set to a non-current branch id (from an
  // Other Locations card), DirectionsSheet shows THAT branch's address +
  // coords instead. Resets on close + on branch switch.
  const [dirsBranchId,        setDirsBranchId]        = useState<string | null>(null)
  // Visual correction round §4: branch-switch confirmation toast. When the
  // user taps Switch on an Other Locations card, the chip + band may be
  // off-screen (they scrolled). We show a small "Now viewing {branch}"
  // toast for 2.4s as a confirmation. `pendingToastForBranchId` tracks
  // the branch we're EXPECTING to land on; once `sb.id` matches it, the
  // toast fires. Suppressed for chip-picker switches (band motion is
  // visible there).
  const [pendingToastForBranchId, setPendingToastForBranchId] = useState<string | null>(null)
  const [toastBranchName,         setToastBranchName]         = useState<string | null>(null)

  // On branch switch (URL `?branch=` change): close any open sheets, close
  // the free-user gate, and re-arm the SuspendedBranchBanner so the new
  // branch's resolution gets a fresh chance to surface (spec §4.7).
  // ScrollView keeps its position. Active tab handling note: when the
  // switch came from a Branches-tab Switch button (round 3 §C3), the
  // BranchesTab handler ALSO sets activeTab='vouchers' so the user lands
  // on the primary surface; chip-picker switches preserve the current
  // tab (chip removed in §C1; if a future round re-introduces a header
  // entry, this contract still holds).
  useEffect(() => {
    setShowContact(false)
    setShowDirs(false)
    setDirsBranchId(null)
    setShowGate(false)
    setBannerDismissed(false)
  }, [branchId])

  // Visual correction round §4: when the pending Other-Locations switch
  // lands (the screen has rerendered with the new selectedBranch data),
  // show the confirmation toast. `branchId` from useBranchSelection
  // mirrors `selectedBranch.id` once the page settles.
  useEffect(() => {
    if (!pendingToastForBranchId) return
    if (branchId !== pendingToastForBranchId) return
    const newBranchName = merchant?.branches.find(b => b.id === branchId)?.name
    if (!newBranchName) return
    setToastBranchName(branchShortName(newBranchName))
    setPendingToastForBranchId(null)
  }, [branchId, pendingToastForBranchId, merchant])

  const tabs = useMemo(() => {
    const isMultiBranch = (merchant?.branches.length ?? 0) > 1
    const t: Array<{ id: TabId; label: string; count?: number }> = [
      { id: 'vouchers', label: 'Vouchers', count: merchant?.vouchers.length ?? 0 },
      { id: 'about',    label: 'About' },
    ]
    if (isMultiBranch) {
      const selectedId = merchant?.selectedBranch?.id
      const otherActive = (merchant?.branches.filter(b => b.id !== selectedId && b.isActive).length) ?? 0
      if (otherActive > 0) {
        // Round 3 §C2: label "Other Locations" → "Branches". The label is
        // shorter, fits the 4-tab row better on 375pt phones, and is
        // consistent with how other surfaces (Discovery, Map, Search) refer
        // to a merchant's other branches. Tab id stays 'branches'.
        t.push({ id: 'branches', label: 'Branches', count: otherActive })
      }
    }
    // Branch-scoped count matches the Reviews tab's default scope (the
    // toggle defaults to 'branch'). Showing the merchant-wide aggregate
    // here while the tab content showed only the selected branch's
    // reviews was the misleading shape flagged in 2026-05-03 QA. When the
    // user flips the toggle to 'All branches' the badge under-reports —
    // an accepted limitation given the toggle lives inside the tab body.
    t.push({ id: 'reviews', label: 'Reviews', count: merchant?.selectedBranch?.reviewCount ?? merchant?.reviewCount ?? 0 })
    return t
  }, [merchant])

  const handleShare = useCallback(async () => {
    if (!merchant) return
    // Web canonical lives at `/merchants/:id` (see apps/customer-web). iOS uses
    // `url` directly; Android only reads `message`, so the URL is also embedded
    // inline so recipients on either platform get a clickable link.
    const shareUrl = `https://redeemo.com/merchants/${merchant.id}`
    await Share.share({
      message: `Check out ${merchant.businessName} on Redeemo! ${shareUrl}`,
      url: shareUrl,
    })
  }, [merchant])

  // Voucher tap — free-user gate per owner decision §9.1. Subscribed
  // users navigate to /voucher/[id]?branch=<sb.id> per the locked
  // branch-attribution contract (Voucher Detail rebaseline plan §11
  // C1): the redemption branch is sourced from the merchant-profile's
  // selectedBranch, passed via URL so Voucher Detail's
  // useMerchantProfile fetches against the same branch context. Cold-
  // open (no branch param) falls through to the merchant-profile
  // resolver's nearest-by-GPS / isMainBranch logic — but every entry
  // from this screen passes the param so the branch carries forward.
  const handleVoucherPress = useCallback((voucherId: string) => {
    if (isSubLoading) return
    if (!isSubscribed) { setShowGate(true); return }
    const sbId = merchant?.selectedBranch?.id
    // encodeURIComponent both the voucherId and the branchId
    // defensively. Both are Prisma-generated UUIDs today (no special
    // chars) but encoding is cheap insurance against future ID
    // format changes that could otherwise produce malformed URLs.
    const enc = encodeURIComponent
    const url = sbId
      ? `/voucher/${enc(voucherId)}?branch=${enc(sbId)}`
      : `/voucher/${enc(voucherId)}`
    router.push(url as never)
  }, [isSubscribed, isSubLoading, merchant])

  // Round 6 follow-up: screen-wide dim+restore pulse on branch
  // switch. Owner flagged that the previous tab-content settle
  // animation didn't carry — the page chrome (banner, headline,
  // metadata, action row, tab bar) stayed static while the branch
  // data updated silently underneath. Now the entire ScrollView
  // wrapper opacity briefly dips to 0.6 and restores to 1.0 when
  // selectedBranch.id changes, so the user gets a clear page-wide
  // "you switched" cue even when their eye is at the top of the
  // screen far from the bottom toast.
  //
  // Timing: 140ms dim + 240ms restore = 380ms total, in the
  // medium-transition band per /interaction-design (300-500ms for
  // page-level transitions). Same ease-out-expo curve used elsewhere.
  // Reduced motion: skipped entirely (motionScale === 0 path).
  const motionScale = useMotionScale()
  const screenOpacity = useSharedValue(1)
  const screenAnimatedStyle = useAnimatedStyle(() => ({ opacity: screenOpacity.value }))
  const isFirstSwitchRender = useRef(true)
  const selectedBranchId = merchant?.selectedBranch?.id ?? null

  // M1 — Stretchy hero. ScrollView's `scrollY` shared value drives
  // the absolutely-positioned `<HeroBanner>` layer mounted as a
  // sibling of the scrollWrap (rendered AFTER ScrollView in JSX so
  // it sits on top in z-order). `useAnimatedScrollHandler` runs on
  // the UI thread — no JS-bridge cost per frame; banner transforms
  // are GPU-accelerated. See plan §2.2 + the HeroSection.tsx
  // module header for the two-layer (translate / scale) rationale
  // and the bottom-origin stretch math.
  const scrollY = useSharedValue(0)
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet'
      scrollY.value = event.contentOffset.y
    },
  })

  // SuspendedBranchBanner stays a scroll child (existing behaviour
  // — it scrolls naturally with content). Because the absolute
  // `<HeroBanner>` layer would otherwise render on top of SBB at
  // screen y=0, we measure SBB's height via onLayout and pass it
  // as `topOffset` so the banner sits BELOW SBB at rest. When SBB
  // is hidden it returns null → the wrapper has 0 height → offset
  // collapses to 0.
  const [sbbHeight, setSbbHeight] = useState(0)
  const handleSbbLayout = useCallback((event: LayoutChangeEvent) => {
    setSbbHeight(event.nativeEvent.layout.height)
  }, [])

  // M2 (collapsed sticky header) — capture the identity zone's end-Y
  // in scroll coordinates. The TabBar's natural in-flow Y position
  // equals identityZoneEnd (TabBar is the next scroll child after the
  // identity zone). This value depends on the identity zone's measured
  // height (descriptor present, single vs multi-branch, rating block,
  // etc.), so we measure it at runtime rather than hardcoding.
  const [identityZoneEnd, setIdentityZoneEnd] = useState(0)
  const handleIdentityZoneLayout = useCallback((event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout
    setIdentityZoneEnd(y + height)
  }, [])

  // M2.1 (sticky-chrome fix) — TabBar is now mounted as an absolute
  // sibling of the scrollWrap, NOT as a sticky scroll child. The
  // previous M2 implementation kept TabBar as `stickyHeaderIndices=
  // [3]`, which pinned it at scrollView-top = screen-y=0 — exactly
  // where the absolutely-positioned CollapsedHeader sits. The
  // CollapsedHeader covered the sticky TabBar, leaving deep-scrolled
  // users with no tab navigation.
  //
  // New approach: TabBar's screen-Y is driven by an animated style:
  //   tabBarY = max(tabPinPoint, identityZoneEnd - scrollY)
  // where tabPinPoint = insets.top + COMPACT_BAR_HEIGHT. So:
  //   • scrollY = 0:                tabBarY = identityZoneEnd
  //                                 (TabBar at its natural in-flow Y)
  //   • scrollY = identityZoneEnd
  //              - tabPinPoint:     tabBarY = tabPinPoint
  //                                 (TabBar pins, directly below
  //                                 CollapsedHeader)
  //   • scrollY beyond:             tabBarY stays at tabPinPoint
  //
  // The in-flow position is preserved via a TabBarSpacer (a View
  // matching the TabBar's measured height) at the same scroll index,
  // so the tab-content body's Y position is unchanged from before.
  // The CollapsedHeader's fade range now ends at `tabPinPoint` (=
  // identityZoneEnd - tabPinPoint in scrollY) so the header reaches
  // opacity 1 exactly when the TabBar pins — single visual handoff.
  const insets = useSafeAreaInsets()
  const tabPinPoint = insets.top + COMPACT_BAR_HEIGHT

  const [tabBarHeight, setTabBarHeight] = useState(0)
  const handleTabBarLayout = useCallback((event: LayoutChangeEvent) => {
    setTabBarHeight(event.nativeEvent.layout.height)
  }, [])

  const tabBarAnimatedStyle = useAnimatedStyle(() => {
    'worklet'
    const inFlowY = identityZoneEnd - scrollY.value
    return { transform: [{ translateY: Math.max(tabPinPoint, inFlowY) }] }
  })
  useEffect(() => {
    // Skip first render (initial profile load) and any state where the
    // branch isn't yet resolved. Only fire on a true post-mount switch.
    if (isFirstSwitchRender.current) {
      if (selectedBranchId) isFirstSwitchRender.current = false
      return
    }
    if (!selectedBranchId) return
    if (motionScale === 0) return
    screenOpacity.value = withSequence(
      withTiming(0.6, { duration: 140, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
      withTiming(1.0, { duration: 240, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    )
  }, [selectedBranchId, motionScale, screenOpacity])

  // ─── Loading / error early returns ──────────────────────────────────────────
  if (!id) {
    return (
      <View style={styles.errorScreen}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
          <ArrowLeft size={24} color={color.text.primary} />
        </Pressable>
        <View style={styles.errorCard} accessibilityRole="alert">
          <Text variant="heading.sm">No merchant id</Text>
          <Text variant="body.sm" color="secondary">The route is missing a merchant identifier.</Text>
        </View>
      </View>
    )
  }
  if (isLoading || (!merchant && !isError)) {
    return (
      <View style={styles.loading}>
        <RedeemoLoader size="lg" accessibilityLabel="Loading merchant profile" />
      </View>
    )
  }
  if (isError || !merchant) {
    return (
      <View style={styles.errorScreen}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
          <ArrowLeft size={24} color={color.text.primary} />
        </Pressable>
        <View style={styles.errorCard} accessibilityRole="alert">
          <Text variant="heading.sm">Couldn't load merchant</Text>
          <Text variant="body.sm" color="secondary">
            {error instanceof Error ? error.message : 'Please try again.'}
          </Text>
        </View>
      </View>
    )
  }

  // All-suspended early return (spec §4.6 + §6). Backend signals this with
  // selectedBranch=null + fallbackReason='all-suspended'. The merchant
  // identity (banner + logo + name) still renders as a courtesy so the
  // user knows where they landed — but no chip / picker / tabs / sheets.
  if (merchant.selectedBranch === null) {
    return (
      <AllBranchesUnavailable
        businessName={merchant.businessName}
        bannerUrl={merchant.bannerUrl}
        logoUrl={merchant.logoUrl}
      />
    )
  }

  const sb = merchant.selectedBranch
  const isMultiBranch = merchant.branches.length > 1
  const showBanner = merchant.selectedBranchFallbackReason === 'candidate-inactive' && !bannerDismissed

  // Per-voucher state placeholders. cefaf45 documented these as TODO until
  // the merchant detail endpoint surfaces redeemed/favourited per voucher.
  // Out of scope for M2 — the Voucher Detail rebaseline will resolve.
  const redeemedVoucherIds   = new Set<string>()
  const favouritedVoucherIds = new Set<string>()

  const handleWebsite = () => {
    const url = sb.websiteUrl ?? merchant.websiteUrl
    if (url) Linking.openURL(url)
  }

  // DirectionsSheet target: the Other-Locations-tapped branch when
  // dirsBranchId is set; otherwise the currently-selected branch.
  // Falls back to sb if the id no longer resolves (defensive — e.g. branch
  // suspended between tap and render).
  const dirsBranch = (dirsBranchId
    ? merchant.branches.find(b => b.id === dirsBranchId) ?? sb
    : sb)
  const dirAddress = [dirsBranch.addressLine1, dirsBranch.city, dirsBranch.postcode].filter(Boolean).join(', ')

  // HoursPreviewSheet target: resolved once per render so the JSX below
  // doesn't re-find the same branch three times. Returns null when the
  // sheet is closed (hoursPreviewBranchId === null) — JSX uses fallback
  // defaults in that case so the sheet props stay typed.
  const hoursPreviewBranch = hoursPreviewBranchId
    ? merchant.branches.find(b => b.id === hoursPreviewBranchId) ?? null
    : null

  return (
    <View style={styles.container}>
      {/* M1 — Banner BACKDROP. Mounted BEFORE the scrollWrap in JSX so
          it sits BEHIND scroll content in z-order. The merchant logo
          (positioned in <MerchantHeadline> with `top: -36` to overlap
          the banner/cream boundary by half) renders ON TOP of this
          backdrop because it lives inside the scroll content. The
          backdrop's image grows in height on overscroll so its
          aspect ratio is preserved (cover-mode crop) — see the
          HeroSection module header for the full rationale. */}
      <HeroBackdrop
        bannerUrl={sb.bannerUrl ?? merchant.bannerUrl}
        scrollY={scrollY}
        topOffset={sbbHeight}
      />

      {/* Round 6 follow-up: screen-wide dim+restore pulse driven
          by `selectedBranchId` changes. Wraps only the ScrollView
          (everything that scrolls — identity zone, sticky tab bar,
          tab content). The HeroBackdrop above and HeroNav below
          sit OUTSIDE this wrapper so they stay at full opacity
          during the page pulse, same pattern as the toast / modals
          below: the banner image is a static asset that doesn't
          change with the branch switch, so dimming it would be
          visual noise. */}
      <Animated.View style={[styles.scrollWrap, screenAnimatedStyle]}>
        <Animated.ScrollView
          testID="merchant-profile-scroll"
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        >
        <View onLayout={handleSbbLayout}>
          <SuspendedBranchBanner
            visible={showBanner}
            onDismiss={() => setBannerDismissed(true)}
          />
        </View>

        <HeroBannerSpacer />

        {/* Round 5 §12: bottom stop hue calibrated into the Redeemo
            brand family. §11 used `#FAF1E2` (L 0.94 C 0.04 H 80 —
            yellow-leaning, off-brand). The brand neutral hue is at
            H≈25-30 (red-orange, matching the brand red `#E20C04`,
            the orange gradient end `#E84A00`, the onboarding cream
            `#FFF9F5`, and the customer-web Discount pastel
            `#FEF2F2`). New bottom stop `#FAEAE0` sits at L 0.93
            C 0.03 H 28 — same hue family as the top stop, creating
            a coherent brand surface treatment instead of a hue
            drift.
            Same craft style as the round 5 §10 tab bar gradient —
            no blur, just a flat vertical gradient for
            architectural depth.
            Round 4 §8 base: identity zone wrapped in its own view
            so the cream is bounded to the top section, body below
            stays white all the way down.
            M2: onLayout captures this wrapper's Y + height so the
            collapsed sticky header knows when to fade in (it
            reaches full opacity at scrollY = identityZoneEnd, which
            is exactly when the TabBar pins). */}
        <View style={styles.identityZone} onLayout={handleIdentityZoneLayout}>
          <LinearGradient
            colors={['#FFF9F5', '#FCF0E5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <MerchantHeadline
            merchantName={merchant.businessName}
            logoUrl={sb.logoUrl ?? merchant.logoUrl}
            avgRating={sb.avgRating}
            reviewCount={sb.reviewCount}
          />

          <BranchContextBand
            isMultiBranch={isMultiBranch}
            branchLine={isMultiBranch && sb ? buildBranchLine(sb) : null}
            switchTrigger={sb.id}
          >
            <MerchantDescriptor descriptor={merchant.descriptor || null} />

            <MetaRow
              isOpenNow={sb.isOpenNow}
              openingHours={sb.openingHours}
              distanceMetres={sb.distance}
            />
          </BranchContextBand>

          <ActionRow
            hasWebsite={!!(sb.websiteUrl ?? merchant.websiteUrl)}
            onWebsite={handleWebsite}
            onContact={() => setShowContact(true)}
            onDirections={() => setShowDirs(true)}
          />
        </View>

        {/* M2.1 — TabBarSpacer. Reserves the same height the TabBar
            occupies in flow, so the tab-content body's Y position is
            unchanged from before. The actual <TabBar /> is mounted
            below as an absolute sibling driven by scrollY. */}
        <View style={{ height: tabBarHeight }} testID="tab-bar-spacer" />

        {/* Round 6 follow-up: tab-content entrance upgraded from
            a 180ms pure fade to a 280ms fade + 8pt Y-settle.
            Owner flagged that the Branches → Switch → Vouchers
            flow had no clear screen-transition cue on device —
            the previous fade was too short and direction-neutral.
            Per /interaction-design + /interface-design: small
            transitions live in the 200-300ms band, motion should
            have spatial purpose, ease-out for entering. The
            8pt translateY settle adds spatial continuity (content
            arriving into place) without being jarring like a
            full slide. Curve is the project-standard ease-out-
            expo (matches voucher card press scale, modal
            entrance, etc.). */}
        <Animated.View
          key={activeTab}
          entering={tabContentEnter}
          style={styles.content}
        >
          {activeTab === 'vouchers' && (
            <VouchersTab
              vouchers={merchant.vouchers}
              redeemedVoucherIds={redeemedVoucherIds}
              favouritedVoucherIds={favouritedVoucherIds}
              onVoucherPress={handleVoucherPress}
              branchShortName={branchShortName(sb.name)}
              isMultiBranch={isMultiBranch}
              switchTrigger={sb.id}
            />
          )}
          {activeTab === 'about' && (
            <AboutTab
              businessName={merchant.businessName}
              // Branch-scoped about / photos / amenities / hours win;
              // about falls back to the merchant-level description when
              // the branch hasn't customised its own copy.
              description={sb.about ?? merchant.about}
              photos={sb.photos}
              amenities={sb.amenities}
              openingHours={sb.openingHours}
              serverIsOpenNow={sb.isOpenNow}
            />
          )}
          {activeTab === 'branches' && isMultiBranch && (
            <BranchesTab
              branches={merchant.branches}
              currentBranchId={sb.id}
              selectedOpeningHours={sb.openingHours}
              onCall={(_id, phone) => {
                if (phone) Linking.openURL(`tel:${phone}`)
              }}
              onDirections={(branchId) => {
                const target = merchant.branches.find(b => b.id === branchId)
                if (!target) return
                // Branches tab card → show THIS branch's directions, not sb's.
                setDirsBranchId(branchId)
                setShowDirs(true)
              }}
              onHoursPreview={(branchId) => setHoursPreviewBranchId(branchId)}
              onSwitch={(branchId) => {
                // Round 3 §C3: arm the confirmation toast AND return to
                // the Vouchers tab. Vouchers is the primary surface; after
                // switching branches, the user almost always wants to see
                // the new branch's vouchers, not stay on the Branches tab
                // that's now showing a different branch list.
                setPendingToastForBranchId(branchId)
                select(branchId)
                setActiveTab('vouchers')
              }}
            />
          )}
          {activeTab === 'reviews' && (
            <ReviewsTab
              merchantId={merchant.id}
              currentBranchId={sb.id}
              currentBranchName={branchShortName(sb.name)}
              myReview={sb.myReview}
              isMultiBranch={isMultiBranch}
              currentBranchCount={sb.reviewCount}
              allBranchesCount={merchant.reviewCount}
            />
          )}
        </Animated.View>
      </Animated.ScrollView>
      </Animated.View>

      {/* M1 — Banner NAV. Mounted AFTER the scrollWrap in JSX so it
          sits ABOVE scroll content in z-order — back / share / heart
          stay tappable even though the backdrop image is behind
          scroll. `pointerEvents="box-none"` on HeroNav itself so
          taps in non-button areas pass through to the ScrollView's
          pan-gesture detector for normal scrolling. */}
      <HeroNav
        isFavourited={favourite.isFavourited}
        onToggleFavourite={favourite.toggle}
        onShare={handleShare}
        scrollY={scrollY}
        topOffset={sbbHeight}
      />

      {/* M2.1 — Floating TabBar layer. Mounted as an absolute sibling
          of the scrollWrap, between HeroNav (z=10) and CollapsedHeader
          (z=20). When expanded, sits at its natural in-flow Y (=
          identityZoneEnd in scroll coords, translated by scrollY);
          when scrolled enough, pins at screen-y = `tabPinPoint`
          (= insets.top + COMPACT_BAR_HEIGHT, directly below the
          collapsed header). The cream-on-cream seam at that boundary
          is invisible (TabBar's gradient top stop = #FFF9F5 = the
          collapsed header's solid bg).
          The matching <View testID="tab-bar-spacer"> inside the
          ScrollView reserves the same vertical space so tab-content
          body Y is unchanged. */}
      <Animated.View
        pointerEvents="box-none"
        onLayout={handleTabBarLayout}
        style={[styles.floatingTabBar, tabBarAnimatedStyle]}
      >
        <TabBar tabs={tabs} activeTab={activeTab} onTabPress={setActiveTab} />
      </Animated.View>

      {/* M2 — Collapsed sticky header. Topmost chrome layer; fades in
          over a 60pt scroll window ending at `tabPinPoint` (=
          identityZoneEnd - insets.top - COMPACT_BAR_HEIGHT in scrollY)
          so opacity reaches 1 exactly when the floating TabBar
          arrives at its pinned position directly beneath. Cream-on-
          cream seam to the TabBar. Always rendered (not conditionally)
          so the fade is gesture-driven rather than mount/unmount-
          driven. The interpolate clamps opacity to [0, 1], so when
          the user is at the top, the header is fully transparent and
          the user sees the hero unchanged. */}
      <CollapsedHeader
        scrollY={scrollY}
        fadeEndY={Math.max(0, identityZoneEnd - tabPinPoint)}
        merchantName={merchant.businessName}
        branchLine={isMultiBranch ? buildCollapsedBranchLine(sb) : null}
        logoUrl={sb.logoUrl ?? merchant.logoUrl}
      />

      <ContactSheet
        visible={showContact}
        onDismiss={() => setShowContact(false)}
        branchName={sb.name}
        phone={sb.phone}
        email={sb.email}
        websiteUrl={sb.websiteUrl ?? merchant.websiteUrl}
      />

      <DirectionsSheet
        visible={showDirs}
        onDismiss={() => { setShowDirs(false); setDirsBranchId(null) }}
        address={dirAddress}
        distance={dirsBranch.distance}
        latitude={dirsBranch.latitude}
        longitude={dirsBranch.longitude}
      />

      <FreeUserGateModal
        visible={showGate}
        onDismiss={() => setShowGate(false)}
        merchantName={merchant.businessName}
        voucherCount={merchant.vouchers.length}
      />

      <HoursPreviewSheet
        visible={hoursPreviewBranchId !== null}
        branchName={branchShortName(hoursPreviewBranch?.name ?? '')}
        isOpenNow={hoursPreviewBranch?.isOpenNow ?? false}
        openingHours={hoursPreviewBranch?.openingHours ?? []}
        onDismiss={() => setHoursPreviewBranchId(null)}
      />

      <BranchSwitchToast
        branchName={toastBranchName}
        merchantName={merchant.businessName}
        onDismiss={() => setToastBranchName(null)}
      />
    </View>
  )
}

// Round 4 §8: container itself flips to white. Round 4 §7 had the
// container cream `#FFF9F5` and only the content view explicitly
// white, but on tall screens (16 Pro Max etc.) the content's
// minHeight ran out before the viewport bottom — the cream
// container bg bled through BELOW the content card, so the body
// still read as cream. Now the container is white everywhere; the
// identity zone (banner-adjacent name + branch + meta + action row)
// gets its own cream-bg wrapper view so the cream is bounded to
// the top section only.
//
// Surface stack:
//   IDENTITY ZONE (wrapped View)  #FFF9F5  (warm cream)
//   TAB BAR                       #FFFFFF  + header drop shadow
//   BODY (container + content)    #FFFFFF
//   CARDS                         #FFFFFF  + card shadow
// Round 5 §15: palette lightened toward HomeScreen brand-canonical
// (`#FFF9F5`) per user direction "feels too warm — should be
// lighter, look at the discovery home / welcome page colours". §14
// pushed too deep into cream. Body now matches HomeScreen container
// exactly. Section split between metadata / nav bar / body
// preserved via subtle gradient deltas (~3pt lightness steps, down
// from §14's 4-5pt) — clearly differentiated but no longer heavy.
//
// Surface stack — all in brand H 30:
//   IDENTITY ZONE   #FFF9F5 → #FCF0E5   cream gradient (light)
//   TAB BAR         #FCF0E5 → #F8E5D5   subtle anchor band
//   BODY            #FFF9F5             HomeScreen-canonical
//   CARDS           #FFFFFF + shadow    pops via 2pt step + shadow
const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#FFF9F5' },
  loading:      { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF9F5' },
  scroll:       { flex: 1 },
  // Round 6 follow-up: wrapper around ScrollView for the screen-
  // wide dim+restore pulse on branch switch. flex:1 so it occupies
  // the same space as the ScrollView would on its own.
  scrollWrap:   { flex: 1 },
  scrollContent:{ paddingBottom: 40 },
  // M2.1 — floating TabBar layer. position:absolute at top:0; the
  // animated style overrides translateY frame-by-frame so the bar
  // reads as either in-flow or pinned. zIndex sits between HeroNav
  // (10) and CollapsedHeader (20) — TabBar is "below" the header
  // in z so the cream collapsed header always paints over the
  // bar's top edge cleanly when collapsed.
  floatingTabBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 15 },
  identityZone: { backgroundColor: '#FFF9F5', position: 'relative' },
  content:      { backgroundColor: '#FFF9F5', minHeight: 460, padding: 20 },
  errorScreen:  { flex: 1, backgroundColor: '#FFF9F5', padding: 16 },
  backBtn:      { paddingVertical: 12 },
  errorCard:    { padding: 20, backgroundColor: '#FEF6F5', borderRadius: 16, gap: 8, marginTop: 16 },
})
