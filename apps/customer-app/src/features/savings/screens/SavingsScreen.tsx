import React, { useState, useCallback, useMemo } from 'react'
import { View, FlatList, RefreshControl, StyleSheet, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { Text } from '@/design-system/Text'
import { FadeInDown } from '@/design-system/motion/FadeIn'
import { ErrorState } from '@/design-system/components/ErrorState'
import { color, spacing, layout } from '@/design-system/tokens'
import { useSubscription } from '@/hooks/useSubscription'
import { useSavingsSummary } from '../hooks/useSavingsSummary'
import { useSavingsRedemptions } from '../hooks/useSavingsRedemptions'
import { useMonthlyDetail } from '../hooks/useMonthlyDetail'
import { SavingsHeroHeader } from '../components/SavingsHeroHeader'
import { SavingsSkeleton, InsightSkeleton } from '../components/SavingsSkeleton'
import { BenefitCards } from '../components/BenefitCards'
import { TrendChart } from '../components/TrendChart'
import { ViewingChip } from '../components/ViewingChip'
import { TopPlaces } from '../components/TopPlaces'
import { ByCategory } from '../components/ByCategory'
import { RoiCallout } from '../components/RoiCallout'
import { RedemptionRow } from '../components/RedemptionRow'
import type { SavingsRedemption, MonthBreakdown } from '@/lib/api/savings'

type UserState = 'loading' | 'error' | 'free' | 'subscriber-empty' | 'populated'

function currentMonthLabel(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function SavingsScreen() {
  const router = useRouter()
  const { subscription, isSubscribed, isSubLoading } = useSubscription()
  const summary = useSavingsSummary()
  const redemptions = useSavingsRedemptions()
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const monthDetail = useMonthlyDetail(selectedMonth)

  const curMonth = currentMonthLabel()
  const [isRefreshing, setIsRefreshing] = useState(false)

  // ── Determine user state ────────────────────────────────────────────────
  const userState: UserState = useMemo(() => {
    if (summary.isLoading || isSubLoading) return 'loading'
    if (summary.isError) return 'error'
    if (!isSubscribed) return 'free'
    const hasRedemptions = summary.data && summary.data.lifetimeSaving > 0
    return hasRedemptions ? 'populated' : 'subscriber-empty'
  }, [summary.isLoading, summary.isError, summary.data, isSubscribed, isSubLoading])

  // ── Flatten paginated redemptions ───────────────────────────────────────
  const allRedemptions: SavingsRedemption[] = useMemo(() => {
    if (!redemptions.data) return []
    return redemptions.data.pages.flatMap((p) => p.redemptions)
  }, [redemptions.data])

  const totalRedemptions = redemptions.data?.pages[0]?.total ?? 0
  const allLoaded = allRedemptions.length >= totalRedemptions && totalRedemptions > 0

  // ── Chart data: last 6 months ───────────────────────────────────────────
  const chartMonths: MonthBreakdown[] = useMemo(() => {
    if (!summary.data) return []
    return summary.data.monthlyBreakdown.slice(0, 6)
  }, [summary.data])

  // ── Insight data: current or selected month ─────────────────────────────
  const insightMerchants = selectedMonth
    ? (monthDetail.data?.byMerchant ?? [])
    : (summary.data?.byMerchant ?? [])
  const insightCategories = selectedMonth
    ? (monthDetail.data?.byCategory ?? [])
    : (summary.data?.byCategory ?? [])

  // ── Month drill-down ────────────────────────────────────────────────────
  const handleMonthSelect = useCallback((month: string) => {
    if (month === curMonth) {
      setSelectedMonth(null)
    } else {
      setSelectedMonth(month)
    }
  }, [curMonth])

  const handleDismissChip = useCallback(() => setSelectedMonth(null), [])

  // ── Navigation ──────────────────────────────────────────────────────────
  const handleSubscribe = useCallback(() => {
    router.push('/(auth)/subscription-prompt' as never)
  }, [router])

  const handleBrowse = useCallback(() => {
    router.push('/(app)/' as never)
  }, [router])

  const handleRowPress = useCallback((voucherId: string) => {
    router.push(`/(app)/voucher/${voucherId}` as never)
  }, [router])

  // ── Pull-to-refresh ─────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await Promise.all([
      summary.refetch(),
      redemptions.refetch(),
      selectedMonth ? monthDetail.refetch() : Promise.resolve(),
    ])
    setIsRefreshing(false)
  }, [summary, redemptions, monthDetail, selectedMonth])

  // ── Loading skeleton ────────────────────────────────────────────────────
  if (userState === 'loading') {
    return <SavingsSkeleton />
  }

  // ── Error state (no cache) ──────────────────────────────────────────────
  if (userState === 'error') {
    return (
      <View style={styles.errorContainer}>
        <ErrorState
          title="Couldn't load your savings"
          description="Something went wrong. Please try again."
          actionLabel="Retry"
          onRetry={() => summary.refetch()}
        />
      </View>
    )
  }

  // ── ListHeaderComponent ─────────────────────────────────────────────────
  const ListHeader = () => (
    <View>
      {/* Hero */}
      <SavingsHeroHeader
        state={userState as 'free' | 'subscriber-empty' | 'populated'}
        onSubscribe={handleSubscribe}
        onBrowse={handleBrowse}
        lifetimeSaving={summary.data?.lifetimeSaving ?? 0}
        thisMonthSaving={summary.data?.thisMonthSaving ?? 0}
        thisMonthRedemptionCount={summary.data?.thisMonthRedemptionCount ?? 0}
      />

      {/* Benefit cards (States 1 & 2 only) */}
      {(userState === 'free' || userState === 'subscriber-empty') && (
        <BenefitCards variant={userState} />
      )}

      {/* Insight section (State 3 only) */}
      {userState === 'populated' && (
        <View style={styles.insightSection}>
          <FadeInDown delay={500}>
            <Text variant="label.eyebrow" style={styles.insightLabel}>Insights</Text>
          </FadeInDown>

          {/* Card 1: Trend chart */}
          <FadeInDown delay={550}>
            <TrendChart
              months={chartMonths}
              selectedMonth={selectedMonth}
              currentMonth={curMonth}
              onMonthSelect={handleMonthSelect}
            />
          </FadeInDown>

          {/* Viewing chip */}
          <ViewingChip month={selectedMonth} onDismiss={handleDismissChip} />

          {/* Cards 2 & 3: insight data or skeleton or error */}
          {selectedMonth && monthDetail.isLoading ? (
            <InsightSkeleton />
          ) : selectedMonth && monthDetail.isError ? (
            <View style={styles.insightError}>
              <ErrorState
                title={`Couldn't load ${selectedMonth}`}
                actionLabel="Retry"
                onRetry={() => monthDetail.refetch()}
              />
            </View>
          ) : (
            <>
              <FadeInDown delay={650}>
                <TopPlaces merchants={insightMerchants} />
              </FadeInDown>
              <FadeInDown delay={750}>
                <ByCategory categories={insightCategories} />
              </FadeInDown>
            </>
          )}

          {/* ROI callout (current month only, hidden when past month selected) */}
          {!selectedMonth && summary.data && subscription?.plan && (
            <FadeInDown delay={1100}>
              <RoiCallout
                thisMonthSaving={summary.data.thisMonthSaving}
                billingInterval={subscription.plan.billingInterval}
                hasPromo={!!subscription.promoCodeId}
              />
            </FadeInDown>
          )}

          {/* History header */}
          {allRedemptions.length > 0 && (
            <FadeInDown delay={1150}>
              <Text variant="label.eyebrow" style={styles.historyLabel}>
                Redemption History
              </Text>
            </FadeInDown>
          )}
        </View>
      )}
    </View>
  )

  // ── Render ──────────────────────────────────────────────────────────────
  const isPopulated = userState === 'populated'

  return (
    <View style={styles.screen}>
      <FlatList
        data={isPopulated ? allRedemptions : []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RedemptionRow redemption={item} onPress={handleRowPress} />
        )}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={
          isPopulated ? (
            redemptions.isFetchingNextPage ? (
              <ActivityIndicator color={color.brandRose} style={styles.footerSpinner} />
            ) : allLoaded ? (
              <Text variant="body.sm" color="tertiary" meta align="center" style={styles.endLabel}>
                You're all caught up
              </Text>
            ) : null
          ) : null
        }
        onEndReached={() => {
          if (isPopulated && redemptions.hasNextPage && !redemptions.isFetchingNextPage) {
            redemptions.fetchNextPage()
          }
        }}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={color.brandRose}
            colors={[color.brandRose]}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
  },
  insightSection: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    gap: spacing[3],
  },
  insightLabel: {
    color: '#9CA3AF',
  },
  insightError: {
    paddingVertical: spacing[4],
  },
  historyLabel: {
    color: '#9CA3AF',
    marginTop: spacing[3],
  },
  footerSpinner: {
    paddingVertical: spacing[4],
  },
  endLabel: {
    paddingVertical: spacing[5],
    color: '#9CA3AF',
  },
  listContent: {
    paddingBottom: layout.tabBarHeight + 20,
  },
})
