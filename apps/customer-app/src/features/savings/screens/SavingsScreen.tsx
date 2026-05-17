import React, { useState, useCallback, useMemo } from 'react'
import { View, FlatList, RefreshControl, StyleSheet, ActivityIndicator } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { Text } from '@/design-system/Text'
import { FadeInDown } from '@/design-system/motion/FadeIn'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { ErrorState } from '@/design-system/components/ErrorState'
import { color, radius, spacing, layout } from '@/design-system/tokens'
import { useSubscription } from '@/hooks/useSubscription'
import { useSavingsSummary } from '../hooks/useSavingsSummary'
import { useSavingsRedemptions } from '../hooks/useSavingsRedemptions'
import { useMonthlyDetail } from '../hooks/useMonthlyDetail'
import { SavingsHeroHeader } from '../components/SavingsHeroHeader'
import { SavingsSkeleton, InsightSkeleton } from '../components/SavingsSkeleton'
import { BenefitCards } from '../components/BenefitCards'
import { TrendChart } from '../components/TrendChart'
import { ViewingChip } from '../components/ViewingChip'
import { TopPlaces, groupByMerchant } from '../components/TopBranches'
import { ByCategory } from '../components/ByCategory'
import { RoiCallout } from '../components/RoiCallout'
import { RedemptionRow } from '../components/RedemptionRow'
import type { SavingsRedemption, MonthBreakdown } from '@/lib/api/savings'

// §Savings Rebaseline (PR-B, Revision 2) — SavingsScreen orchestrator.
//
// FlatList + ListHeaderComponent composition keeps everything as one
// scrolling unit (no nested scroll conflicts).  Insight section is
// inside the ListHeaderComponent; redemption rows are the list items
// for pagination.
//
// State machine per plan v2 §8:
//   loading   — summary fetching OR subscription fetching
//   error     — summary errored with no cached data
//   free      — subscription === null OR CANCELLED OR EXPIRED  (§8.3)
//   subscriber-empty — subscribed (incl. PAST_DUE) AND lifetimeSaving === 0
//   populated — subscribed (incl. PAST_DUE) AND lifetimeSaving > 0
//
// Per the LOCKED 2026-05-17 owner direction (plan §8.3): CANCELLED +
// EXPIRED route to State 1 regardless of lifetimeSaving.  Future
// product decision: whether historical-savings visibility should
// remain accessible to lapsed users.

type UserState = 'loading' | 'error' | 'free' | 'subscriber-empty' | 'populated'

// Fallback only — used if summary data isn't loaded yet.  The backend
// returns `monthlyBreakdown[0].month` as the authoritative "this
// month" key (matches the Savings cycle, not necessarily the device's
// calendar month at midnight rollover).  See Fix 3 / PR-B fixup.
function deviceMonthLabel(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// "2026-04" → "April".  Used for selected-month empty-state copy on
// the insight cards.  Same MONTH_NAMES table as ViewingChip.tsx —
// kept inline to avoid a one-line import dependency.
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
function monthName(yyyymm: string): string {
  const mon = yyyymm.split('-')[1] ?? '1'
  return MONTH_NAMES[parseInt(mon, 10) - 1] ?? ''
}

export function SavingsScreen() {
  const router = useRouter()
  const { subscription, isSubscribed, isSubLoading } = useSubscription()
  const summary = useSavingsSummary()
  const redemptions = useSavingsRedemptions()
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const monthDetail = useMonthlyDetail(selectedMonth)

  // Backend `monthlyBreakdown[0].month` is the authoritative current
  // month for Savings UI.  Falls back to device-local only if the
  // summary payload hasn't resolved yet — the resulting label is used
  // for "is this the current month" comparison only, so a transient
  // device-derived value during loading is harmless.
  const curMonth = summary.data?.monthlyBreakdown[0]?.month ?? deviceMonthLabel()
  const [isRefreshing, setIsRefreshing] = useState(false)

  // ── User-state derivation ────────────────────────────────────────────
  // PAST_DUE is treated as subscriber for Savings display purposes —
  // the user's historical savings still belong to them.  CANCELLED /
  // EXPIRED route to State 1 per locked owner direction.
  const userState: UserState = useMemo(() => {
    if (summary.isLoading || isSubLoading) return 'loading'
    if (summary.isError && !summary.data) return 'error'

    const status = subscription?.status
    if (!subscription || status === 'CANCELLED' || status === 'EXPIRED') return 'free'

    const isPastDue = status === 'PAST_DUE'
    const treatAsSubscribed = isSubscribed || isPastDue
    if (!treatAsSubscribed) return 'free'

    const lifetime = summary.data?.lifetimeSaving ?? 0
    return lifetime > 0 ? 'populated' : 'subscriber-empty'
  }, [summary.isLoading, summary.isError, summary.data, isSubscribed, isSubLoading, subscription])

  // ── Flatten paginated redemptions ───────────────────────────────────
  const allRedemptions: SavingsRedemption[] = useMemo(() => {
    if (!redemptions.data) return []
    return redemptions.data.pages.flatMap((p) => p.redemptions)
  }, [redemptions.data])

  const totalRedemptions = redemptions.data?.pages[0]?.total ?? 0

  // §Savings device-QA fixup 5 2026-05-18 — explicit Load-more
  // pagination.  Was: `onEndReached` infinite scroll — dumped the
  // whole list on one screen.  Now: show INITIAL_VISIBLE rows up
  // front; user taps "Load more" to reveal LOAD_MORE_STEP more.
  // When the cached pages run out we trigger the React Query
  // `fetchNextPage` for the next backend page.  Once both the
  // network is exhausted AND we've revealed every cached row, the
  // footer flips to "You're all caught up".
  const INITIAL_VISIBLE = 8
  const LOAD_MORE_STEP  = 8
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)
  const visibleRedemptions = useMemo(
    () => allRedemptions.slice(0, visibleCount),
    [allRedemptions, visibleCount],
  )
  const moreToReveal      = visibleRedemptions.length < allRedemptions.length
  const moreOnNetwork     = redemptions.hasNextPage
  const hasMoreToShow     = moreToReveal || moreOnNetwork
  const allCaughtUp       =
    !hasMoreToShow && allRedemptions.length > 0 && totalRedemptions > 0

  const handleLoadMore = useCallback(() => {
    const next = visibleCount + LOAD_MORE_STEP
    // If we'd reveal past the cached rows AND there's more on the
    // network, fire the next-page fetch.  React Query appends.
    if (next > allRedemptions.length && redemptions.hasNextPage && !redemptions.isFetchingNextPage) {
      redemptions.fetchNextPage()
    }
    setVisibleCount(next)
  }, [visibleCount, allRedemptions.length, redemptions])

  // ── Chart + insight slices ──────────────────────────────────────────
  // monthlyBreakdown comes back descending (current month at index 0);
  // TrendChart reverses for display.
  const chartMonths: MonthBreakdown[] = useMemo(() => {
    if (!summary.data) return []
    return summary.data.monthlyBreakdown.slice(0, 6)
  }, [summary.data])

  // Memoised so identity is stable across renders that don't change
  // the underlying data — keeps the ListHeader element memo from
  // invalidating on every parent re-render.
  const insightBranches = useMemo(() => (
    selectedMonth
      ? (monthDetail.data?.byBranch ?? [])
      : (summary.data?.byBranch ?? [])
  ), [selectedMonth, monthDetail.data, summary.data])
  const insightCategories = useMemo(() => (
    selectedMonth
      ? (monthDetail.data?.byCategory ?? [])
      : (summary.data?.byCategory ?? [])
  ), [selectedMonth, monthDetail.data, summary.data])
  // §Savings fidelity fixup-3 2026-05-17: client-side group byBranch
  // into merchant-level "Top places" rows.  Owner direction during
  // device QA: branch names alone (Brightlingsea / Colchester) don't
  // serve users on the savings dashboard — show merchant names with
  // the total saved across their branches.  Backend `byBranch[]`
  // contract unchanged; aggregation lives in `groupByMerchant`.
  const insightPlaces = useMemo(
    () => groupByMerchant(insightBranches),
    [insightBranches],
  )

  // §Savings device-QA fixup 6 2026-05-18 — refresh-on-focus.
  // After a customer redeems a voucher in another tab (Voucher
  // Detail → PinEntrySheet → success), they expect the Savings tab
  // to reflect the new redemption when they switch back.  Previously
  // the React Query cache held stale data until either the 60-second
  // staleTime expired or the user pulled to refresh / tapped a
  // different month.  `useFocusEffect` now triggers refetches of
  // both savings summary + paginated redemptions every time the tab
  // becomes the active route.  Light-touch: no UI change, just a
  // background refetch that React Query reconciles into the
  // existing cache (so visible data only changes if the server
  // returns different data).
  useFocusEffect(
    useCallback(() => {
      summary.refetch()
      redemptions.refetch()
      // monthDetail is only refetched if a past month is selected —
      // re-running its query under selectedMonth: null would no-op.
      if (selectedMonth) monthDetail.refetch()
    }, [summary, redemptions, monthDetail, selectedMonth]),
  )

  // ── Month drill-down ───────────────────────────────────────────────
  const handleMonthSelect = useCallback((month: string) => {
    if (month === curMonth) {
      setSelectedMonth(null)
    } else {
      setSelectedMonth(month)
    }
  }, [curMonth])

  const handleDismissChip = useCallback(() => setSelectedMonth(null), [])

  // ── Navigation handlers ────────────────────────────────────────────
  const handleSubscribe = useCallback(() => {
    router.push('/(auth)/subscription-prompt' as never)
  }, [router])

  const handleBrowse = useCallback(() => {
    router.push('/(app)/' as never)
  }, [router])

  // §Savings device-QA round-3 fixup 2026-05-18 — row tap routes by
  // redemption.id, NOT voucher.id.  A Savings row represents a
  // SPECIFIC redemption event — its own code, validation status,
  // timestamp.  Routing by voucher.id sent every REUSABLE redemption
  // to the same Voucher Detail page showing the same (most-recent)
  // code, dropping the event identity.  Now routes to the dedicated
  // /(app)/redemption/[id] receipt screen which fetches the exact
  // record by id.  `?from=savings` flows through so the receipt's
  // back arrow returns cleanly to this tab.
  const handleRowPress = useCallback((redemptionId: string) => {
    router.push(`/(app)/redemption/${redemptionId}?from=savings` as never)
  }, [router])

  // TopPlaces tap: merchant-level after fidelity fixup-3.  Navigate
  // to merchant profile without a `?branch=` URL param so the
  // profile resolves to its main branch (or the user's most-recent
  // branch context).  Pre-fixup this carried `?branch={branchId}`
  // but the rows are now merchant-grouped so we no longer have a
  // single branch to pin.
  const handleTopPlacePress = useCallback((merchantId: string) => {
    router.push(`/(app)/merchant/${merchantId}` as never)
  }, [router])

  // ── Pull-to-refresh ────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await Promise.all([
      summary.refetch(),
      redemptions.refetch(),
      selectedMonth ? monthDetail.refetch() : Promise.resolve(),
    ])
    setIsRefreshing(false)
  }, [summary, redemptions, monthDetail, selectedMonth])

  // ── List header (memoised) ─────────────────────────────────────────
  // Previously this was `const ListHeader = () => (...)` — a new
  // function reference on every render.  FlatList's
  // `ListHeaderComponent={ListHeader}` would then mount a different
  // component-type per render, unmounting + remounting the entire
  // header subtree on every parent state update.  Symptom: tapping a
  // month bar (`setSelectedMonth`) replayed the staggered FadeInDown
  // entrance animations across hero + trend + insight cards.
  //
  // Fix: render to a stable React element via useMemo.  Identity
  // changes only when one of the listed deps changes — which is
  // genuinely when the header needs to update its content.  Includes
  // `subscription` (object identity) on purpose: useSubscription's
  // React Query cache keeps it stable across renders.
  //
  // ─── Hook-ordering note ────────────────────────────────────────────
  // This useMemo MUST sit ABOVE the conditional early returns for
  // 'loading' and 'error' states.  Rules of Hooks: every hook must be
  // called on every render in the same order.  If this useMemo lived
  // below `if (userState === 'loading') return <SavingsSkeleton />`,
  // the loading render would skip it and the next (populated) render
  // would call it — React errors with "Rendered more hooks than
  // during the previous render".  Caught on device QA 2026-05-17.
  const listHeader = useMemo(() => (
    <View>
      <SavingsHeroHeader
        state={userState as 'free' | 'subscriber-empty' | 'populated'}
        onSubscribe={handleSubscribe}
        onBrowse={handleBrowse}
        lifetimeSaving={summary.data?.lifetimeSaving ?? 0}
        thisMonthSaving={summary.data?.thisMonthSaving ?? 0}
        thisMonthRedemptionCount={summary.data?.thisMonthRedemptionCount ?? 0}
      />

      {(userState === 'free' || userState === 'subscriber-empty') && (
        <BenefitCards variant={userState} />
      )}

      {userState === 'populated' && (
        <View style={styles.insightSection} testID="savings-insight-section">
          {/* §Savings emil-pass 3/7 2026-05-17 — entrance cascade
              tightened.  Was 500 → 1150ms (cascade end ~1390ms).
              Now 0 → 250ms (cascade end ~490ms) per Emil's
              perceived-performance rule: UI cascades should end
              under 500ms.  50ms stagger between items. */}
          <FadeInDown delay={0}>
            <Text variant="label.eyebrow" style={styles.insightLabel}>Insights</Text>
          </FadeInDown>

          <FadeInDown delay={50}>
            <TrendChart
              months={chartMonths}
              selectedMonth={selectedMonth}
              currentMonth={curMonth}
              onMonthSelect={handleMonthSelect}
            />
          </FadeInDown>

          <ViewingChip month={selectedMonth} onDismiss={handleDismissChip} />

          {selectedMonth && monthDetail.isLoading ? (
            <InsightSkeleton />
          ) : selectedMonth && monthDetail.isError ? (
            <View style={styles.insightError} testID="savings-month-detail-error">
              <ErrorState
                title={`Couldn't load ${selectedMonth}`}
                actionLabel="Retry"
                onRetry={() => monthDetail.refetch()}
              />
            </View>
          ) : (
            <>
              <FadeInDown delay={100}>
                <TopPlaces
                  places={insightPlaces}
                  onPress={handleTopPlacePress}
                  contextLabel={selectedMonth ? monthName(selectedMonth) : 'This month'}
                  emptyLabel={
                    selectedMonth
                      ? `No place savings in ${monthName(selectedMonth)}`
                      : undefined
                  }
                />
              </FadeInDown>
              <FadeInDown delay={150}>
                <ByCategory
                  categories={insightCategories}
                  contextLabel={selectedMonth ? monthName(selectedMonth) : 'This month'}
                  emptyLabel={
                    selectedMonth
                      ? `No category savings in ${monthName(selectedMonth)}`
                      : undefined
                  }
                />
              </FadeInDown>
            </>
          )}

          {!selectedMonth && summary.data && subscription?.plan && (
            <FadeInDown delay={200}>
              <RoiCallout
                thisMonthSaving={summary.data.thisMonthSaving}
                billingInterval={subscription.plan.billingInterval}
                hasPromo={!!subscription.promoCodeId}
              />
            </FadeInDown>
          )}

          {/* §Savings fixup 2026-05-17: hide the all-time Redemption
              History label when a past month is selected.  The list
              we paginate is unfiltered by month, so showing rows
              labelled "2h ago / yesterday / 3 Apr" UNDER a "Viewing:
              February 2026" chip was misleading — users read those
              rows as February redemptions.  Until we add a month-
              filtered redemptions endpoint, the cleanest fix is to
              hide the history section entirely under a selection.
              Deferred follow-up: server-side `byMonth` redemption
              endpoint + matching UI affordance.  */}
          {!selectedMonth && allRedemptions.length > 0 && (
            <FadeInDown delay={250}>
              <Text variant="label.eyebrow" style={styles.historyLabel}>
                Redemption History
              </Text>
            </FadeInDown>
          )}
        </View>
      )}
    </View>
  ), [
    userState,
    handleSubscribe,
    handleBrowse,
    summary.data,
    chartMonths,
    selectedMonth,
    curMonth,
    handleMonthSelect,
    handleDismissChip,
    monthDetail.isLoading,
    monthDetail.isError,
    monthDetail.refetch,
    insightPlaces,
    insightCategories,
    handleTopPlacePress,
    subscription,
    allRedemptions.length,
  ])

  // ── Loading skeleton ───────────────────────────────────────────────
  // Conditional returns come AFTER all hooks above (listHeader memo,
  // useState, useMemo for insight slices, useCallback handlers).
  // React enforces hook-call order across renders; any hook below
  // here would mismatch when the state transitions from loading →
  // populated.
  if (userState === 'loading') {
    return <SavingsSkeleton />
  }

  // ── Error state (no cache) ─────────────────────────────────────────
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

  const isPopulated = userState === 'populated'

  // §Savings fixup 2026-05-17: same rationale as the history-label
  // gate above — feed the FlatList an empty data array under a
  // selected month so the rows themselves don't render either.  The
  // ListHeaderComponent still drives the chart, ViewingChip, and
  // insight cards (which DO honour the selected month via
  // monthDetail).  Pull-to-refresh still refetches all 3 queries.
  //
  // §Savings device-QA fixup 5 2026-05-18: list now feeds the
  // `visibleRedemptions` slice — first INITIAL_VISIBLE rows, then
  // +LOAD_MORE_STEP per "Load more" tap.  No more onEndReached
  // infinite scroll.
  const listData = isPopulated && !selectedMonth ? visibleRedemptions : []

  return (
    <View style={styles.screen} testID="savings-screen">
      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.rowWrapper}>
            <RedemptionRow redemption={item} onPress={handleRowPress} />
          </View>
        )}
        ListHeaderComponent={listHeader}
        ListFooterComponent={
          // Footer is part of the history list — same gate as the
          // list itself.  No load-more / caught-up copy under a
          // selected month (the visible list is empty there).
          isPopulated && !selectedMonth ? (
            redemptions.isFetchingNextPage ? (
              <ActivityIndicator color={color.brandRose} style={styles.footerSpinner} />
            ) : hasMoreToShow ? (
              <View style={styles.footerLoadMoreWrap}>
                <PressableScale
                  onPress={handleLoadMore}
                  accessibilityRole="button"
                  accessibilityLabel="Load more redemptions"
                  testID="savings-load-more"
                  style={styles.loadMorePill}
                >
                  <Text variant="label.lg" style={styles.loadMoreText}>Load more</Text>
                </PressableScale>
              </View>
            ) : allCaughtUp ? (
              <Text
                variant="body.sm"
                color="tertiary"
                meta
                align="center"
                style={styles.endLabel}
                testID="savings-caught-up"
              >
                You&apos;re all caught up
              </Text>
            ) : null
          ) : null
        }
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
    backgroundColor: color.surface.neutral,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: color.surface.neutral,
    justifyContent: 'center',
  },
  insightSection: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    gap: spacing[3],
  },
  insightLabel: {
    color: color.text.tertiary,
  },
  insightError: {
    paddingVertical: spacing[4],
  },
  historyLabel: {
    color: color.text.tertiary,
    marginTop: spacing[3],
  },
  // §Savings device-QA round-3 fixup 2026-05-18 — spacing pass.
  // paddingVertical spacing[1] (4) → spacing[2] (8) so the
  // redemption rows breathe properly against each other in a long
  // list.  Combined with the row's own paddingVertical bump
  // (spacing[2] → spacing[3]) the history reads as a calm receipt
  // stack instead of a packed list.
  rowWrapper: {
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[2],
  },
  footerSpinner: {
    paddingVertical: spacing[4],
  },
  endLabel: {
    paddingVertical: spacing[5],
    color: color.text.tertiary,
  },
  // §Savings device-QA round-2 fixup 2026-05-18 — Load more pill
  // brand-aligned to solid navy.  Was: white surface + navy border
  // + navy text (DESIGN.md secondary-button).  Owner direction:
  // wants the action to feel "brand-aligned", more visible than
  // the secondary outline.  Solid navy pill with white text =
  // brand-coherent (navy is the typographic spine) without
  // hijacking elevation.glow + brand-rose which DESIGN.md reserves
  // for THE primary CTA (Subscribe / Redeem / Show to Staff).
  footerLoadMoreWrap: {
    paddingVertical: spacing[5],
    paddingHorizontal: spacing[5],
    alignItems: 'center',
  },
  loadMorePill: {
    backgroundColor: color.navy,
    borderRadius: radius.md,
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    minWidth: 160,
    alignItems: 'center',
  },
  loadMoreText: {
    color: '#FFFFFF',
    fontFamily: 'Lato-SemiBold',
  },
  listContent: {
    paddingBottom: layout.tabBarHeight + 20,
  },
})
