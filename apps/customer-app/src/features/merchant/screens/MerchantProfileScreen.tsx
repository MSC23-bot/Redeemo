import React, { useState, useCallback, useMemo } from 'react'
import { View, ScrollView, StyleSheet, ActivityIndicator, Share, Linking, Pressable } from 'react-native'
import { router } from 'expo-router'
import { Text, color } from '@/design-system'
import { ArrowLeft } from '@/design-system/icons'
import { useMerchantProfile } from '../hooks/useMerchantProfile'
import { useOpenStatus } from '../hooks/useOpenStatus'
import { HeroSection } from '../components/HeroSection'
import { MetaSection } from '../components/MetaSection'
import { TabBar, type TabId } from '../components/TabBar'
import { VouchersTab } from '../components/VouchersTab'
import { AboutTab } from '../components/AboutTab'
import { BranchesTab } from '../components/BranchesTab'
import { ReviewsTab } from '../components/ReviewsTab'
import { ContactSheet } from '../components/ContactSheet'
import { DirectionsSheet } from '../components/DirectionsSheet'
import { FreeUserGateModal } from '../components/FreeUserGateModal'
import { useFavourite } from '@/hooks/useFavourite'
import { useSubscription } from '@/hooks/useSubscription'
import { useUserLocation } from '@/hooks/useLocation'

// M2 — full Merchant Profile surface. Composes hero / meta / sticky tab bar
// and the four tabs (vouchers / about / branches / reviews) plus three
// sheets (contact / directions / free-user gate). Free users can BROWSE
// vouchers (per owner decision §9.1) but tapping a voucher's redeem-flow
// route shows the gate; subscribed users navigate to /voucher/[id] (route
// not yet on main — Voucher Detail is a separate next-next PR; tap-through
// 404s until that lands per owner decision §9.2).
type Props = { id: string | undefined }

export function MerchantProfileScreen({ id }: Props) {
  const { isSubscribed, isSubLoading } = useSubscription()

  // Pass GPS to the profile endpoint so the server can compute `distance` and
  // resolve `nearestBranch`. Without lat/lng both come back null and the meta
  // row falls back to "Multiple locations". `opts` is built with conditional
  // assignment to satisfy `exactOptionalPropertyTypes` (no `lat: undefined`).
  const { location } = useUserLocation()
  const profileOpts: { lat?: number; lng?: number } =
    location ? { lat: location.lat, lng: location.lng } : {}
  const { data: merchant, isLoading, isError, error } = useMerchantProfile(id, profileOpts)

  const favourite = useFavourite({
    type: 'merchant',
    id: merchant?.id ?? '',
    isFavourited: merchant?.isFavourited ?? false,
  })

  const openStatus = useOpenStatus(merchant?.openingHours ?? [])

  const [activeTab,    setActiveTab]    = useState<TabId>('vouchers')
  const [showContact,  setShowContact]  = useState(false)
  // `dirsBranchId` overrides which branch the DirectionsSheet shows. When
  // null + showDirs=true → defaults to nearest/first branch (the legacy
  // MetaSection "Directions" CTA behaviour). Set by BranchesTab card tap.
  const [dirsBranchId, setDirsBranchId] = useState<string | null>(null)
  const [showDirs,     setShowDirs]     = useState(false)
  const [showGate,     setShowGate]     = useState(false)

  const isSingleBranch  = (merchant?.branches.length ?? 0) <= 1
  const nearestBranchId = merchant?.nearestBranch?.id ?? merchant?.branches[0]?.id ?? null

  const tabs = useMemo(() => {
    const t: Array<{ id: TabId; label: string; count?: number }> = [
      { id: 'vouchers', label: 'Vouchers', count: merchant?.vouchers.length ?? 0 },
      { id: 'about',    label: 'About' },
    ]
    if (!isSingleBranch) {
      t.push({ id: 'branches', label: 'Branches', count: merchant?.branches.length ?? 0 })
    }
    t.push({ id: 'reviews', label: 'Reviews', count: merchant?.reviewCount ?? 0 })
    return t
  }, [merchant, isSingleBranch])

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

  const handleWebsite = useCallback(() => {
    if (merchant?.websiteUrl) Linking.openURL(merchant.websiteUrl)
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

  const singleBranchAddress = useMemo(() => {
    if (!isSingleBranch || !merchant?.branches[0]) return null
    const b = merchant.branches[0]
    return [b.addressLine1, b.city, b.postcode].filter(Boolean).join(', ')
  }, [isSingleBranch, merchant])

  const contactBranch = merchant?.nearestBranch ?? merchant?.branches[0]

  // DirectionsSheet target — when BranchesTab sets `dirsBranchId`, point at
  // that branch; otherwise fall back to nearest/first (MetaSection default).
  const dirsBranch = dirsBranchId
    ? merchant?.branches.find(b => b.id === dirsBranchId) ?? contactBranch
    : contactBranch
  const dirAddress = dirsBranch
    ? [dirsBranch.addressLine1, dirsBranch.city, dirsBranch.postcode].filter(Boolean).join(', ')
    : ''

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

  // Per-voucher state placeholders. cefaf45 documented these as TODO until
  // the merchant detail endpoint surfaces redeemed/favourited per voucher.
  // Out of scope for M2 — the Voucher Detail rebaseline will resolve.
  const redeemedVoucherIds   = new Set<string>()
  const favouritedVoucherIds = new Set<string>()

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[2]}
      >
        <HeroSection
          bannerUrl={merchant.bannerUrl}
          logoUrl={merchant.logoUrl}
          isFavourited={favourite.isFavourited}
          onToggleFavourite={favourite.toggle}
          onShare={handleShare}
        />

        <MetaSection
          businessName={merchant.businessName}
          // Use the server-computed `descriptor` (Plan 1.5 §3.6 — built from
          // primaryDescriptorTag + subcategory.descriptorSuffix with de-dup)
          // rather than the raw subcategory name. For Covelum the backend
          // returns "Indian Restaurant"; the raw `primaryCategory.name` would
          // be just "Restaurant", which is what was rendering as the bug.
          // Plan §8.1 explicitly mandates this — descriptor / highlights /
          // subcategory must come from the server-computed field.
          category={merchant.descriptor || null}
          avgRating={merchant.avgRating}
          reviewCount={merchant.reviewCount}
          branchName={merchant.nearestBranch?.name ?? null}
          distance={merchant.distance}
          isOpenNow={openStatus.isOpen}
          hoursText={openStatus.hoursText}
          singleBranchAddress={singleBranchAddress}
          hasWebsite={!!merchant.websiteUrl}
          onWebsite={handleWebsite}
          onContact={() => setShowContact(true)}
          onDirections={() => { setDirsBranchId(null); setShowDirs(true) }}
        />

        <TabBar tabs={tabs} activeTab={activeTab} onTabPress={setActiveTab} />

        <View style={styles.content}>
          {activeTab === 'vouchers' && (
            <VouchersTab
              vouchers={merchant.vouchers}
              redeemedVoucherIds={redeemedVoucherIds}
              favouritedVoucherIds={favouritedVoucherIds}
              onVoucherPress={handleVoucherPress}
            />
          )}
          {activeTab === 'about' && (
            <AboutTab
              businessName={merchant.businessName}
              description={merchant.about}
              photos={merchant.photos}
              amenities={merchant.amenities}
              openingHours={merchant.openingHours}
            />
          )}
          {activeTab === 'branches' && !isSingleBranch && (
            <BranchesTab
              branches={merchant.branches}
              nearestBranchId={nearestBranchId}
              onBranchPress={(branchId) => { setDirsBranchId(branchId); setShowDirs(true) }}
              onHoursPress={() => setActiveTab('about')}
            />
          )}
          {activeTab === 'reviews' && (
            <ReviewsTab
              merchantId={merchant.id}
              defaultBranchId={nearestBranchId}
            />
          )}
        </View>
      </ScrollView>

      <ContactSheet
        visible={showContact}
        onDismiss={() => setShowContact(false)}
        branchName={contactBranch?.name ?? merchant.businessName}
        phone={contactBranch?.phone ?? null}
        email={contactBranch?.email ?? null}
        websiteUrl={merchant.websiteUrl}
      />

      <DirectionsSheet
        visible={showDirs}
        onDismiss={() => { setShowDirs(false); setDirsBranchId(null) }}
        address={dirAddress}
        distance={dirsBranch?.distance ?? merchant.distance}
        latitude={dirsBranch?.latitude ?? null}
        longitude={dirsBranch?.longitude ?? null}
      />

      <FreeUserGateModal
        visible={showGate}
        onDismiss={() => setShowGate(false)}
        merchantName={merchant.businessName}
        voucherCount={merchant.vouchers.length}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#FFF' },
  loading:      { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' },
  scroll:       { flex: 1 },
  scrollContent:{ paddingBottom: 40 },
  content:      { backgroundColor: '#FFF', minHeight: 460, padding: 20 },
  errorScreen:  { flex: 1, backgroundColor: '#FFF', padding: 16 },
  backBtn:      { paddingVertical: 12 },
  errorCard:    { padding: 20, backgroundColor: '#FEF6F5', borderRadius: 16, gap: 8, marginTop: 16 },
})
