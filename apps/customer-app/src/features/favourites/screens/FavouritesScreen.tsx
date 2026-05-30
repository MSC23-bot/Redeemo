/**
 * Phase 3C.1g M2.5 — `<FavouritesScreen>` orchestrator.
 *
 * Spec §7.5 — tab state via URL `?tab=places|vouchers` (default
 * places); safe-area-aware paddingTop / paddingBottom mirroring the
 * locked Profile-tab pattern (PR #135); pull-to-refresh; infinite
 * scroll via FlatList; swipe-to-remove + 4s undo via
 * `useRemoveFavourite`.
 *
 * Locked client-rendering invariant (spec §9.3): the Vouchers
 * FlatList renders pages in server-returned order.  No client-side
 * sort.  Pinned by `vouchers-server-sort.test.tsx`.
 */

import React, { useMemo, useCallback, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { color, spacing } from '@/design-system/tokens'
import { FavouritesHeader, type FavouritesTab } from '../components/FavouritesHeader'
import { BranchFavCard } from '../components/BranchFavCard'
import { VoucherFavCard } from '../components/VoucherFavCard'
import { FavouritesEmptyState } from '../components/FavouritesEmptyState'
import { FavouritesSkeleton } from '../components/FavouritesSkeleton'
import { UndoToast } from '../components/UndoToast'
import { useFavouriteBranches } from '../hooks/useFavouriteBranches'
import { useFavouriteVouchers } from '../hooks/useFavouriteVouchers'
import { useRemoveFavourite } from '../hooks/useRemoveFavourite'
import { emitToast } from '@/design-system/motion/Toast'
import type { FavouriteBranchItem, FavouriteVoucherItem } from '@/lib/api/favourites'

// Wave 5 #4 (locked 2026-05-30) — matches the absolute bottom Tabs bar
// height set in `app/(app)/_layout.tsx` (consistent with `HomeScreen`'s
// `TAB_BAR_HEIGHT`).  Drives the UndoToast bottomOffset below so the
// toast renders ABOVE the tab bar instead of behind it.
const TAB_BAR_HEIGHT = 80

function normaliseTab(raw: unknown): FavouritesTab {
  return raw === 'vouchers' ? 'vouchers' : 'places'
}

export function FavouritesScreen(): React.ReactElement {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const params = useLocalSearchParams<{ tab?: string }>()

  // URL is the source of truth for the active tab so deep-links land
  // on the right tab and tab switches are shareable / restored on
  // cold-reload.
  const activeTab: FavouritesTab = normaliseTab(params.tab)

  const setTab = useCallback((tab: FavouritesTab) => {
    router.setParams({ tab })
  }, [router])

  // List queries — gated on auth inside each hook so guests show empty.
  const branchesQuery = useFavouriteBranches()
  const vouchersQuery = useFavouriteVouchers()

  const branches: FavouriteBranchItem[] = useMemo(() => {
    return (branchesQuery.data?.pages ?? []).flatMap(p => p.items)
  }, [branchesQuery.data])

  const vouchers: FavouriteVoucherItem[] = useMemo(() => {
    return (vouchersQuery.data?.pages ?? []).flatMap(p => p.items)
  }, [vouchersQuery.data])

  const branchesTotal = branchesQuery.data?.pages[0]?.total ?? 0
  const vouchersTotal = vouchersQuery.data?.pages[0]?.total ?? 0

  // Removal handlers.  One per entity so the typed cache hook can
  // splice its own InfiniteData shape.
  const removeBranch  = useRemoveFavourite<FavouriteBranchItem>('branch')
  const removeVoucher = useRemoveFavourite<FavouriteVoucherItem>('voucher')

  const [undoMessage, setUndoMessage] = useState<string | null>(null)

  const handleRemoveBranch = useCallback((row: FavouriteBranchItem) => {
    removeBranch.remove(row)
    setUndoMessage(`Removed ${row.merchant.businessName}`)
  }, [removeBranch])

  const handleRemoveVoucher = useCallback((row: FavouriteVoucherItem) => {
    removeVoucher.remove(row)
    setUndoMessage(`Removed ${row.title}`)
  }, [removeVoucher])

  const handleUndoBranch = useCallback(() => {
    removeBranch.undo()
    setUndoMessage(null)
  }, [removeBranch])

  const handleUndoVoucher = useCallback(() => {
    removeVoucher.undo()
    setUndoMessage(null)
  }, [removeVoucher])

  // Wave 6.3 #1 (locked 2026-05-30) — flush pending DELETEs on blur.
  //
  // Owner-reported symptom: user removes the last favourited merchant
  // / voucher + immediately taps "Discover merchants" → Home shows
  // the still-favourited heart because the 4s undo-window timer
  // hadn't fired yet, so the DELETE hadn't reached the backend AND
  // the discovery / merchantProfile / voucher caches hadn't been
  // invalidated.  When the user lands on Home, useHomeFeed returns
  // the cached (stale) tile with isFavourited=true.
  //
  // Fix: on screen blur, fire `flushPending()` on both removal hooks
  // — this cancels the 4s timer + immediately calls the DELETE +
  // fires the cross-surface invalidations.  By the time the user is
  // on Home, the cache is refetching with the correct backend state.
  //
  // Idempotent: safe no-op when no removal is pending.
  useFocusEffect(
    useCallback(() => {
      return () => {
        void removeBranch.flushPending()
        void removeVoucher.flushPending()
      }
    }, [removeBranch, removeVoucher])
  )

  // Surface backend errors via the generic toast so the screen stays
  // calm.  Error is cleared after one render cycle.
  if (removeBranch.error || removeVoucher.error) {
    emitToast('Could not remove favourite. Please try again.', 'danger')
    if (removeBranch.error) removeBranch.clearError()
    if (removeVoucher.error) removeVoucher.clearError()
  }

  // Clear the undo toast banner once the parent timer fires (isPending
  // flips back to false) AND no new row is pending.
  if (undoMessage && !removeBranch.isPending && !removeVoucher.isPending) {
    setUndoMessage(null)
  }

  const placesView = (
    <FlatList
      testID="favourites-places-list"
      data={branches}
      keyExtractor={(row) => row.id}
      renderItem={({ item }) => (
        <BranchFavCard
          row={item}
          onPress={() => router.push(`/(app)/merchant/${item.merchant.id}?branch=${item.id}&from=favourites`)}
          onRemove={() => handleRemoveBranch(item)}
          testID={`branch-card-${item.id}`}
        />
      )}
      onEndReached={() => branchesQuery.hasNextPage && !branchesQuery.isFetchingNextPage && branchesQuery.fetchNextPage()}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl refreshing={branchesQuery.isRefetching} onRefresh={() => branchesQuery.refetch()} />
      }
      ListEmptyComponent={branchesQuery.isLoading
        ? <FavouritesSkeleton />
        : <FavouritesEmptyState tab="places" onCta={() => router.push({ pathname: '/(app)', params: { scrollTop: '1' } })} />
      }
      ListFooterComponent={
        branchesQuery.isFetchingNextPage
          ? <ActivityIndicator style={styles.footerLoader} color={color.brandRose} />
          : null
      }
      contentContainerStyle={branches.length === 0 ? styles.emptyContentContainer : undefined}
    />
  )

  const vouchersView = (
    <FlatList
      testID="favourites-vouchers-list"
      data={vouchers}
      keyExtractor={(row) => row.id}
      renderItem={({ item }) => (
        <VoucherFavCard
          row={item}
          onPress={() => router.push(`/(app)/voucher/${item.id}?from=favourites`)}
          onRemove={() => handleRemoveVoucher(item)}
          testID={`voucher-card-${item.id}`}
        />
      )}
      onEndReached={() => vouchersQuery.hasNextPage && !vouchersQuery.isFetchingNextPage && vouchersQuery.fetchNextPage()}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl refreshing={vouchersQuery.isRefetching} onRefresh={() => vouchersQuery.refetch()} />
      }
      ListEmptyComponent={vouchersQuery.isLoading
        ? <FavouritesSkeleton />
        : <FavouritesEmptyState tab="vouchers" onCta={() => router.push('/(app)/search')} />
      }
      ListFooterComponent={
        vouchersQuery.isFetchingNextPage
          ? <ActivityIndicator style={styles.footerLoader} color={color.brandRose} />
          : null
      }
      contentContainerStyle={vouchers.length === 0 ? styles.emptyContentContainer : undefined}
    />
  )

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <FavouritesHeader
        activeTab={activeTab}
        placesCount={branchesTotal}
        vouchersCount={vouchersTotal}
        onTabChange={setTab}
      />
      {activeTab === 'places' ? placesView : vouchersView}
      <UndoToast
        visible={Boolean(undoMessage)}
        message={undoMessage ?? ''}
        onUndo={activeTab === 'places' ? handleUndoBranch : handleUndoVoucher}
        // Wave 5 #4 — sit ABOVE the 80pt absolute-positioned bottom
        // tab bar.  Pre-Wave-5 the toast rendered at the default
        // 20pt-from-bottom and was fully obscured by the tab bar.
        bottomOffset={insets.bottom + TAB_BAR_HEIGHT + spacing[3]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: color.cream,
  },
  footerLoader: {
    marginVertical: spacing[3],
  },
  emptyContentContainer: {
    flexGrow:       1,
    justifyContent: 'center',
  },
})

export default FavouritesScreen
