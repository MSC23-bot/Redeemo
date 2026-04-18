import React, { useState, useCallback, useMemo, useRef } from 'react'
import { View, ScrollView, StyleSheet, ActivityIndicator, Share, Linking, NativeSyntheticEvent, NativeScrollEvent } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useRouter } from 'expo-router'
import { Text } from '@/design-system/Text'
import { color, spacing } from '@/design-system/tokens'
import { useAuthStore } from '@/stores/auth'
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

export function MerchantProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { status } = useAuthStore()
  const isAuthed = status === 'authed'
  const { isSubscribed } = useSubscription()

  const { data: merchant, isLoading } = useMerchantProfile(id)

  const favourite = useFavourite({
    type: 'merchant',
    id: merchant?.id ?? '',
    isFavourited: merchant?.isFavourited ?? false,
  })

  const openStatus = useOpenStatus(merchant?.openingHours ?? [])

  const [activeTab, setActiveTab] = useState<TabId>('vouchers')
  const [showContact, setShowContact] = useState(false)
  const [showDirections, setShowDirections] = useState(false)
  const [showGateModal, setShowGateModal] = useState(false)
  const [isTabBarSticky, setIsTabBarSticky] = useState(false)
  const tabBarOffsetRef = useRef(0)

  const isSingleBranch = (merchant?.branches.length ?? 0) <= 1
  const nearestBranchId = merchant?.nearestBranch?.id ?? merchant?.branches[0]?.id ?? null

  const tabs = useMemo(() => {
    const t: Array<{ id: TabId; label: string; count?: number }> = [
      { id: 'vouchers', label: 'Vouchers', count: merchant?.vouchers.length ?? 0 },
      { id: 'about', label: 'About' },
    ]
    if (!isSingleBranch) {
      t.push({ id: 'branches', label: 'Branches', count: merchant?.branches.length ?? 0 })
    }
    t.push({ id: 'reviews', label: 'Reviews', count: merchant?.reviewCount ?? 0 })
    return t
  }, [merchant, isSingleBranch])

  const handleShare = useCallback(async () => {
    if (!merchant) return
    await Share.share({
      message: `Check out ${merchant.businessName} on Redeemo!`,
    })
  }, [merchant])

  const handleWebsite = useCallback(() => {
    if (merchant?.websiteUrl) Linking.openURL(merchant.websiteUrl)
  }, [merchant])

  const handleVoucherPress = useCallback((voucherId: string) => {
    if (!isSubscribed) {
      setShowGateModal(true)
      return
    }
    router.push(`/voucher/${voucherId}` as never)
  }, [isSubscribed, router])

  const singleBranchAddress = useMemo(() => {
    if (!isSingleBranch || !merchant?.branches[0]) return null
    const b = merchant.branches[0]
    return [b.addressLine1, b.city, b.postcode].filter(Boolean).join(', ')
  }, [isSingleBranch, merchant])

  const contactBranch = merchant?.nearestBranch ?? merchant?.branches[0]
  const dirAddress = contactBranch
    ? [contactBranch.addressLine1, contactBranch.city, contactBranch.postcode].filter(Boolean).join(', ')
    : ''

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y
    if (tabBarOffsetRef.current > 0) {
      setIsTabBarSticky(y >= tabBarOffsetRef.current)
    }
  }, [])

  if (isLoading || !merchant) {
    return (
      <View style={styles.loading} accessibilityLabel="Loading merchant profile">
        <ActivityIndicator size="large" color={color.brandRose} />
      </View>
    )
  }

  // TODO: Populate from backend once per-voucher redemption/favourite state is returned
  // by the merchant profile endpoint or a separate API call.
  const redeemedVoucherIds = new Set<string>()
  const favouritedVoucherIds = new Set<string>()

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        stickyHeaderIndices={[2]}
      >
        {/* Hero */}
        <HeroSection
          bannerUrl={merchant.bannerUrl}
          logoUrl={merchant.logoUrl}
          isFeatured={merchant.isFeatured}
          isTrending={merchant.isTrending}
          isFavourited={favourite.isFavourited}
          onToggleFavourite={favourite.toggle}
          onShare={handleShare}
        />

        {/* Meta */}
        <MetaSection
          businessName={merchant.businessName}
          category={merchant.primaryCategory?.name ?? null}
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
          onDirections={() => setShowDirections(true)}
        />

        {/* Tab Bar (sticky) */}
        <TabBar tabs={tabs} activeTab={activeTab} onTabPress={setActiveTab} />

        {/* Tab Content */}
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

      {/* Contact Sheet */}
      <ContactSheet
        visible={showContact}
        onDismiss={() => setShowContact(false)}
        branchName={contactBranch?.name ?? merchant.businessName}
        phone={contactBranch?.phone ?? null}
        email={contactBranch?.email ?? null}
        websiteUrl={merchant.websiteUrl}
      />

      {/* Directions Sheet */}
      <DirectionsSheet
        visible={showDirections}
        onDismiss={() => setShowDirections(false)}
        address={dirAddress}
        distance={merchant.distance}
        latitude={contactBranch?.latitude ?? null}
        longitude={contactBranch?.longitude ?? null}
      />

      {/* Free User Gate */}
      <FreeUserGateModal
        visible={showGateModal}
        onDismiss={() => setShowGateModal(false)}
        merchantName={merchant.businessName}
        voucherCount={merchant.vouchers.length}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  content: {
    backgroundColor: '#FFF',
    minHeight: 460,
    padding: 20,
  },
})
