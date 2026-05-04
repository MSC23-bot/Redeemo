import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { View, ScrollView, StyleSheet, ActivityIndicator, Share, Linking, Pressable } from 'react-native'
import { router } from 'expo-router'
import { Text, color } from '@/design-system'
import { ArrowLeft } from '@/design-system/icons'
import { useMerchantProfile } from '../hooks/useMerchantProfile'
import { useBranchSelection } from '../hooks/useBranchSelection'
import { HeroSection } from '../components/HeroSection'
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
import { BranchChip } from '../components/BranchChip'
import { BranchPickerSheet } from '../components/BranchPickerSheet'
import { HoursPreviewSheet } from '../components/HoursPreviewSheet'
import { SuspendedBranchBanner } from '../components/SuspendedBranchBanner'
import { AllBranchesUnavailable } from '../components/AllBranchesUnavailable'
import { useFavourite } from '@/hooks/useFavourite'
import { useSubscription } from '@/hooks/useSubscription'
import { useUserLocation } from '@/hooks/useLocation'
import { MerchantHeadline } from '../components/MerchantHeadline'
import { BranchContextBand } from '../components/BranchContextBand'
import { branchShortName } from '../utils/branchShortName'

function buildBranchLine(branch: { city: string | null; name: string }): string | null {
  // Pass 1 fallback: city when available, else strip-prefix the branch name.
  // Branch.county schema migration (deferred §A) will eventually ship
  // "<city>, <county>"; until then we render city alone.
  if (branch.city) return branch.city
  const shortName = branchShortName(branch.name)
  return shortName || null
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
  const [showPicker,          setShowPicker]          = useState(false)
  const [bannerDismissed,     setBannerDismissed]     = useState(false)
  const [hoursPreviewBranchId, setHoursPreviewBranchId] = useState<string | null>(null)
  // dirsBranchId: null → DirectionsSheet shows the SELECTED branch (sb) — the
  // existing ActionRow path. When set to a non-current branch id (from an
  // Other Locations card), DirectionsSheet shows THAT branch's address +
  // coords instead. Resets on close + on branch switch.
  const [dirsBranchId,        setDirsBranchId]        = useState<string | null>(null)

  // On branch switch (URL `?branch=` change): close any open sheets, close
  // the free-user gate, and re-arm the SuspendedBranchBanner so the new
  // branch's resolution gets a fresh chance to surface (spec §4.7). Active
  // tab is intentionally preserved; ScrollView keeps its position.
  useEffect(() => {
    setShowContact(false)
    setShowDirs(false)
    setDirsBranchId(null)
    setShowGate(false)
    setShowPicker(false)
    setBannerDismissed(false)
  }, [branchId])

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
        t.push({ id: 'branches', label: 'Other Locations', count: otherActive })
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

  // Voucher tap — free-user gate per owner decision §9.1. Subscribed users
  // navigate to /voucher/[id] (Voucher Detail rebaseline target — currently
  // 404s until that PR ships; routing call kept correct so future Voucher
  // Detail rebaseline works without re-wiring this screen).
  const handleVoucherPress = useCallback((voucherId: string) => {
    if (isSubLoading) return
    if (!isSubscribed) { setShowGate(true); return }
    // `as any` matches the existing codebase pattern for typed-route holes
    // (e.g. HomeScreen's `/merchant/${id}` push pre-M1). When the Voucher
    // Detail rebaseline lands and adds `app/(app)/voucher/[id].tsx`, the
    // cast becomes unnecessary and can be removed.
    router.push(`/voucher/${voucherId}` as any)
  }, [isSubscribed, isSubLoading])

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
      <View style={styles.loading} accessibilityLabel="Loading merchant profile">
        <ActivityIndicator size="large" color={color.brandRose} />
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
      <ScrollView
        testID="merchant-profile-scroll"
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[5]}
      >
        <SuspendedBranchBanner
          visible={showBanner}
          onDismiss={() => setBannerDismissed(true)}
        />

        <HeroSection
          // Branch-scoped imagery wins; merchant-level falls back when the
          // branch hasn't uploaded its own (typical for chains using the
          // master logo / banner across all branches).
          bannerUrl={sb.bannerUrl ?? merchant.bannerUrl}
          logoUrl={sb.logoUrl ?? merchant.logoUrl}
          isFavourited={favourite.isFavourited}
          onToggleFavourite={favourite.toggle}
          onShare={handleShare}
        />

        <MerchantHeadline merchantName={merchant.businessName} />

        {/* BranchContextBand wraps items 5–7 of spec §6.4 (chip / descriptor
            / meta row). On multi-branch, a brand-red-tinted band frames the
            branch identity as the page's signature anchor + adds the
            branch-line text at the top. On single-branch the band collapses
            to a flat layout (no tint, no branch-line text) — same children,
            same vertical rhythm, no branch chrome.

            `descriptor` defensive `|| null`: schema declares non-nullable
            but backend may emit "" for unclassified merchants. */}
        <BranchContextBand
          isMultiBranch={isMultiBranch}
          branchLine={isMultiBranch && sb ? buildBranchLine(sb) : null}
        >
          <BranchChip
            isMultiBranch={isMultiBranch}
            onPress={() => setShowPicker(true)}
          />

          <MerchantDescriptor descriptor={merchant.descriptor || null} />

          <MetaRow
            isOpenNow={sb.isOpenNow}
            openingHours={sb.openingHours}
            distanceMetres={sb.distance}
            avgRating={sb.avgRating}
            reviewCount={sb.reviewCount}
          />
        </BranchContextBand>

        <ActionRow
          hasWebsite={!!(sb.websiteUrl ?? merchant.websiteUrl)}
          onWebsite={handleWebsite}
          onContact={() => setShowContact(true)}
          onDirections={() => setShowDirs(true)}
        />

        <TabBar tabs={tabs} activeTab={activeTab} onTabPress={setActiveTab} />

        <View style={styles.content}>
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
                // Other Locations card → show THIS branch's directions, not sb's.
                setDirsBranchId(branchId)
                setShowDirs(true)
              }}
              onHoursPreview={(branchId) => setHoursPreviewBranchId(branchId)}
              onSwitch={(branchId) => select(branchId)}
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
        </View>
      </ScrollView>

      <BranchPickerSheet
        visible={showPicker}
        branches={merchant.branches.map(b => ({
          id:             b.id,
          name:           b.name,
          city:           b.city,
          county:         null,        // see deferred-followups §H
          distanceMetres: b.distance,
          isOpenNow:      b.isOpenNow,
          isActive:       b.isActive,
          // NEW (Task 11): plumb per-branch openingHours + ratings to the picker.
          // From Task 1 — every BranchTile now carries openingHours.
          openingHours:   b.openingHours,
          avgRating:      b.avgRating,
          reviewCount:    b.reviewCount,
        }))}
        currentBranchId={sb.id}
        onPick={(nextBranchId) => select(nextBranchId)}
        onDismiss={() => setShowPicker(false)}
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
    </View>
  )
}

// Visual correction round (post-PR-#35 QA): page surface shifts from pure
// `#FFF` to warm cream `#F5F1EB` (Redeemo-brand neutral, slightly tinted
// toward the brand-red hue per impeccable's "tint every neutral toward the
// brand" rule). Card surfaces stay near-white via Section 3 token tint
// `#FCFAF7`, so cards now read as elevated against the cream canvas
// without needing heavier borders or shadows.
const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F5F1EB' },
  loading:      { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F1EB' },
  scroll:       { flex: 1 },
  scrollContent:{ paddingBottom: 40 },
  content:      { backgroundColor: '#F5F1EB', minHeight: 460, padding: 20 },
  errorScreen:  { flex: 1, backgroundColor: '#F5F1EB', padding: 16 },
  backBtn:      { paddingVertical: 12 },
  errorCard:    { padding: 20, backgroundColor: '#FEF6F5', borderRadius: 16, gap: 8, marginTop: 16 },
})
