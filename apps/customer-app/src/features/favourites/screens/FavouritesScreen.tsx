import React, { useState, useMemo, useRef, useCallback } from 'react'
import {
  View, FlatList, RefreshControl, StyleSheet, ActivityIndicator,
  Pressable, Text as RNText,
} from 'react-native'
import { useRouter } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { ErrorState } from '@/design-system/components/ErrorState'
import { color, spacing } from '@/design-system/tokens'
import { FadeInDown } from '@/design-system/motion/FadeIn'
import { useSubscription } from '@/hooks/useSubscription'
import { useFavouriteMerchants } from '../hooks/useFavouriteMerchants'
import { useFavouriteVouchers } from '../hooks/useFavouriteVouchers'
import { useRemoveFavourite } from '../hooks/useRemoveFavourite'
import { FavouritesHeader } from '../components/FavouritesHeader'
import { MerchantFavCard } from '../components/MerchantFavCard'
import { VoucherFavCard } from '../components/VoucherFavCard'
import { SwipeToRemove } from '../components/SwipeToRemove'
import { NudgeBanner } from '../components/NudgeBanner'
import { FavouritesEmptyState } from '../components/FavouritesEmptyState'
import { FavouritesSkeleton } from '../components/FavouritesSkeleton'
import type { TabId } from '../components/FavouritesHeader'
import type { FavouriteMerchantItem, FavouriteVoucherItem } from '@/lib/api/favourites'

export function FavouritesScreen() {
  const router = useRouter()
  const { isSubscribed, isSubLoading } = useSubscription()
  const [activeTab, setActiveTab] = useState<TabId>('merchants')
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [undoVisible, setUndoVisible] = useState(false)
  const [undoMessage, setUndoMessage] = useState('')
  const undoFnRef = useRef<(() => Promise<void>) | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const merchants = useFavouriteMerchants()
  const vouchers  = useFavouriteVouchers()
  const merchantRemove = useRemoveFavourite('merchant')
  const voucherRemove  = useRemoveFavourite('voucher')

  const allMerchants: FavouriteMerchantItem[] = useMemo(
    () => merchants.data?.pages.flatMap(p => p.items) ?? [],
    [merchants.data],
  )
  const allVouchers: FavouriteVoucherItem[] = useMemo(
    () => vouchers.data?.pages.flatMap(p => p.items) ?? [],
    [vouchers.data],
  )

  const merchantTotal = merchants.data?.pages[0]?.total ?? 0
  const voucherTotal  = vouchers.data?.pages[0]?.total ?? 0

  const isLoading = merchants.isLoading || vouchers.isLoading || isSubLoading
  const isError   = merchants.isError || vouchers.isError

  const showUndoToast = useCallback((message: string, undoFn: () => Promise<void>) => {
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndoMessage(message)
    setUndoVisible(true)
    undoFnRef.current = undoFn
    undoTimer.current = setTimeout(() => {
      setUndoVisible(false)
      undoFnRef.current = null
    }, 4000)
  }, [])

  const handleRemoveMerchant = useCallback(async (id: string) => {
    const { undo } = await merchantRemove.remove(id)
    showUndoToast('Removed from favourites', undo)
  }, [merchantRemove, showUndoToast])

  const handleRemoveVoucher = useCallback(async (id: string) => {
    const { undo } = await voucherRemove.remove(id)
    showUndoToast('Removed from favourites', undo)
  }, [voucherRemove, showUndoToast])

  const handleUndo = useCallback(async () => {
    setUndoVisible(false)
    if (undoTimer.current) clearTimeout(undoTimer.current)
    if (undoFnRef.current) await undoFnRef.current()
    undoFnRef.current = null
  }, [])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await Promise.all([merchants.refetch(), vouchers.refetch()])
    setIsRefreshing(false)
  }, [merchants, vouchers])

  const handleLoadMoreMerchants = useCallback(() => {
    if (merchants.hasNextPage && !merchants.isFetchingNextPage) {
      merchants.fetchNextPage()
    }
  }, [merchants])

  const handleLoadMoreVouchers = useCallback(() => {
    if (vouchers.hasNextPage && !vouchers.isFetchingNextPage) {
      vouchers.fetchNextPage()
    }
  }, [vouchers])

  const isMerchantTab = activeTab === 'merchants'
  const items = isMerchantTab ? allMerchants : allVouchers
  const isEmpty = items.length === 0 && !isLoading
  const allLoaded = isMerchantTab
    ? allMerchants.length >= merchantTotal && merchantTotal > 0
    : allVouchers.length >= voucherTotal && voucherTotal > 0

  const ListHeader = (
    <View>
      <FavouritesHeader
        activeTab={activeTab}
        onTabPress={setActiveTab}
        merchantCount={merchantTotal}
        voucherCount={voucherTotal}
      />
      {!isSubscribed && !nudgeDismissed && !isEmpty && (
        <NudgeBanner
          onSubscribe={() => router.push('/(auth)/subscribe-prompt' as any)}
          onDismiss={() => setNudgeDismissed(true)}
        />
      )}
    </View>
  )

  if (isLoading) {
    return (
      <GestureHandlerRootView style={styles.root}>
        {ListHeader}
        <FavouritesSkeleton />
      </GestureHandlerRootView>
    )
  }

  if (isError) {
    return (
      <GestureHandlerRootView style={styles.root}>
        {ListHeader}
        <ErrorState
          title="Couldn't load your favourites"
          description="Something went wrong. Please try again."
          onRetry={() => { merchants.refetch(); vouchers.refetch() }}
        />
      </GestureHandlerRootView>
    )
  }

  const renderMerchant = ({ item, index }: { item: FavouriteMerchantItem; index: number }) => (
    <FadeInDown delay={index * 40}>
      <SwipeToRemove onRemove={() => handleRemoveMerchant(item.id)}>
        <MerchantFavCard
          merchant={item}
          onPress={(id) => router.push(`/(app)/merchant/${id}` as any)}
          onRemove={handleRemoveMerchant}
        />
      </SwipeToRemove>
    </FadeInDown>
  )

  const renderVoucher = ({ item, index }: { item: FavouriteVoucherItem; index: number }) => (
    <FadeInDown delay={index * 40}>
      <SwipeToRemove onRemove={() => handleRemoveVoucher(item.id)}>
        <VoucherFavCard
          voucher={item}
          onPress={(id) => router.push(`/(app)/voucher/${id}` as any)}
          onRemove={handleRemoveVoucher}
        />
      </SwipeToRemove>
    </FadeInDown>
  )

  const ListFooter = (
    <View style={styles.footer}>
      {isMerchantTab && merchants.isFetchingNextPage && (
        <ActivityIndicator color={color.brandRose} />
      )}
      {!isMerchantTab && vouchers.isFetchingNextPage && (
        <ActivityIndicator color={color.brandRose} />
      )}
      {allLoaded && (
        <Text style={styles.endLabel}>You're all caught up</Text>
      )}
    </View>
  )

  return (
    <GestureHandlerRootView style={styles.root}>
      <FlatList
        data={items as any[]}
        keyExtractor={(item: any) => item.id}
        renderItem={isMerchantTab ? renderMerchant as any : renderVoucher as any}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={isEmpty ? undefined : ListFooter}
        ListEmptyComponent={
          <FavouritesEmptyState
            onDiscover={() => router.push('/(app)/' as any)}
          />
        }
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        onEndReached={isMerchantTab ? handleLoadMoreMerchants : handleLoadMoreVouchers}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={color.brandRose}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {undoVisible && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(180)}
          style={styles.undoToast}
        >
          <RNText style={styles.undoText}>{undoMessage}</RNText>
          <Pressable onPress={handleUndo} hitSlop={8}>
            <RNText style={styles.undoAction}>Undo</RNText>
          </Pressable>
        </Animated.View>
      )}
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAFA' },
  listContent: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 100 },
  footer: { alignItems: 'center', paddingVertical: 16 },
  endLabel: { fontSize: 12, color: '#9CA3AF' },
  undoToast: {
    position: 'absolute',
    left: spacing[4],
    right: spacing[4],
    bottom: spacing[6],
    backgroundColor: '#010C35',
    borderRadius: 12,
    paddingHorizontal: spacing[4],
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 100,
  },
  undoText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Lato-Regular', flex: 1 },
  undoAction: { color: '#E20C04', fontSize: 14, fontFamily: 'Lato-Bold', marginLeft: 12 },
})
