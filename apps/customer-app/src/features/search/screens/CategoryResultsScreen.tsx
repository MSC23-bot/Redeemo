import React, { useState, useMemo, useEffect } from 'react'
import { View, FlatList, Pressable, StyleSheet } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react-native'
import { Text, color, spacing } from '@/design-system'
import { useSearch } from '@/hooks/useSearch'
import { useCategories } from '@/hooks/useCategories'
import { useCategoryMerchants } from '@/hooks/useCategoryMerchants'
import { useUserLocation } from '@/hooks/useLocation'
import { MerchantTile } from '@/features/shared/MerchantTile'
import { ScopePillRow, type Scope } from '@/features/shared/ScopePillRow'
import { EmptyStateMessage } from '@/features/shared/EmptyStateMessage'
import { LocalityCaption } from '@/design-system/components/LocalityCaption'
import { FilterSheet, FilterState } from '../components/FilterSheet'
import { branchToMerchantTileProps } from '../utils/branchToMerchantTile'

/**
 * CategoryResultsScreen — Hybrid hook strategy (PR B Milestone 4, Option A).
 *
 * The backend route `/categories/:id/merchants` (consumed by
 * `useCategoryMerchants`) supports ONLY scope/lat/lng/limit/offset. It does
 * NOT accept sortBy / voucherTypes / amenityIds / openNow. To preserve
 * intent-aware ranking on the default unfiltered view AND let users apply
 * filters without losing functionality, the screen runs BOTH hooks
 * simultaneously and selects the active dataset based on whether non-scope
 * filters are present:
 *
 *   - hasNonScopeFilters === false  → useCategoryMerchants is enabled
 *                                     (intent-aware ranking; LOCAL/MIXED/
 *                                     DESTINATION ladder respected)
 *
 *   - hasNonScopeFilters === true   → useSearch({ categoryId, ...filters })
 *                                     is enabled (full filter capability,
 *                                     defaults to LOCAL intent for free-text
 *                                     so DESTINATION categories lose the
 *                                     quality-aware ranking when filtered)
 *
 * Both hooks always execute (React rules-of-hooks). The `enabled` flag plus
 * a null id controls which actually fetches. Output shapes are compatible:
 * both return `{ merchants, total, meta }` per the Plan-1.5 contract.
 *
 * This is intentional — see the rebaseline plan §B.5.1 ("CategoryResults
 * route migration") and the architectural sanity-check exchange that
 * preceded M4 implementation.
 */
export function CategoryResultsScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { location } = useUserLocation()
  const { data: categoriesData } = useCategories()

  const allCategories = categoriesData?.categories ?? []
  const category = allCategories.find((c) => c.id === id) ?? null
  const categoryName = category?.name ?? 'Category'

  // Resolve effective intentType — bubble up to parent if we're on a
  // subcategory page (subcategories carry intentType: null and inherit).
  const effectiveIntent = useMemo(() => {
    if (!category) return null
    if (category.intentType) return category.intentType
    if (category.parentId) {
      const parent = allCategories.find((c) => c.id === category.parentId)
      return parent?.intentType ?? 'LOCAL'
    }
    return 'LOCAL'
  }, [category, allCategories])

  const sortCaption = effectiveIntent === 'DESTINATION'
    ? 'Default: best-rated nearby first'
    : 'Default: nearby first'

  const [scope, setScope] = useState<Scope | undefined>(undefined)
  const [filterVisible, setFilterVisible] = useState(false)
  const [filters, setFilters] = useState<FilterState>({
    categoryId:   id ?? null,
    sortBy:       'relevance',
    voucherTypes: [],
    amenityIds:   [],
    openNow:      false,
  })

  // PR #120 device-QA fix (2026-05-21) — sync filter state to the route
  // category on EVERY id change, not just on first mount.
  //
  // Previous gate `if (id && filters.categoryId === null)` only fired
  // when categoryId was null (post-cold-start). When the user navigates
  // Food → Beauty → Shopping, the route `id` changes but `filters.categoryId`
  // stays on the previous category (not null), so the gate skipped.
  // `hasNonScopeFilters` then evaluated `filters.categoryId !== id` as
  // `true`, routed through `useSearch` with the STALE categoryId, and the
  // new category page rendered the OLD category's merchants/branches —
  // the owner-reported "Beauty & Wellness shows Karaara / Pinos" symptom.
  //
  // Owner-locked behaviour: on route id change, reset filters.categoryId to
  // the new id AND clear all other filters (sortBy / voucherTypes /
  // amenityIds / openNow) — Food's "openNow=true" filter shouldn't carry
  // into Beauty either. The user's scope selection (separate state) is
  // also reset to default for the same reason. The render branch then
  // returns to the default useCategoryMerchants path (intent-aware ranking)
  // until the user explicitly applies a filter on the new category page.
  useEffect(() => {
    if (!id) return
    setFilters((prev) => prev.categoryId === id ? prev : {
      categoryId:   id,
      sortBy:       'relevance',
      voucherTypes: [],
      amenityIds:   [],
      openNow:      false,
    })
    // Reset scope on route change too — same rationale (Food's "Nearby"
    // selection shouldn't carry into Beauty).
    setScope(undefined)
  }, [id])

  // The default view (no non-scope filters) uses useCategoryMerchants for
  // intent-aware ranking. The moment any non-scope filter is applied, we
  // switch to useSearch which supports the full filter set.
  //
  // Subtle correctness guard: only treat categoryId as "user changed it"
  // when both `id` and `filters.categoryId` are defined and genuinely
  // different. Avoids the race where `id` is briefly undefined on first
  // mount, which would otherwise flip hasNonScopeFilters→true and route
  // through useSearch before the user has interacted with anything.
  const hasNonScopeFilters =
    filters.sortBy !== 'relevance' ||
    filters.voucherTypes.length > 0 ||
    filters.amenityIds.length > 0 ||
    filters.openNow ||
    (id !== undefined && filters.categoryId !== null && filters.categoryId !== id)

  const effectiveCategoryId = filters.categoryId ?? id

  const categoryQuery = useCategoryMerchants(
    hasNonScopeFilters ? null : effectiveCategoryId,    // null disables this query
    {
      ...(scope ? { scope } : {}),
      ...(location ? { lat: location.lat, lng: location.lng } : {}),
      limit: 20,
    },
  )

  const searchQuery = useSearch(
    {
      ...(effectiveCategoryId ? { categoryId: effectiveCategoryId } : {}),
      ...(scope ? { scope } : {}),
      ...(filters.sortBy !== 'relevance' ? { sortBy: filters.sortBy } : {}),
      ...(filters.voucherTypes.length > 0 ? { voucherTypes: filters.voucherTypes } : {}),
      ...(filters.amenityIds.length > 0 ? { amenityIds: filters.amenityIds } : {}),
      ...(filters.openNow ? { openNow: filters.openNow } : {}),
      ...(location ? { lat: location.lat, lng: location.lng } : {}),
      limit: 20,
    },
    hasNonScopeFilters,                                 // enabled flag
  )

  // Pick the active dataset from whichever hook is enabled.
  const data      = hasNonScopeFilters ? searchQuery.data      : categoryQuery.data
  const isLoading = hasNonScopeFilters ? searchQuery.isLoading : categoryQuery.isLoading
  // Branch-first (Phase 2.4): render one tile per branch. Same
  // `?branch=&from=category&categoryId=` contract as Phase 2.1 Search +
  // Phase 2.2 Map + Phase 2.3 Home. `total` falls back to legacy `total`
  // only defensively — `totalBranches` is now schema-required per Task B,
  // so Zod parse would have failed before this point if it were missing.
  const branches  = data?.branches ?? []
  const total     = data?.totalBranches ?? data?.total ?? 0
  // PR #120 device-QA fix (2026-05-21) — read branch-aligned meta when the
  // backend emits it. Without this, pill counts + emptyStateReason +
  // expandedBanner derived from merchant-tier meta while the list rendered
  // branches. Mirrors SearchScreen's branchMeta-first read (line 128).
  // Legacy `meta` fallback preserves cold-cache + pre-fix-server behaviour.
  const meta      = data?.branchMeta ?? data?.meta

  // PR #120 device-QA fix wave 3 (2026-05-21) — cumulative pill counts.
  //
  // Previously this was `{nearby: nearbyCount, city: cityCount, platform: distantCount}`
  // (per-tier), but the list itself is cumulative (Your city = nearby + city,
  // More places = nearby + city + distant — backend supplies all admissible
  // branches at the chosen scope). Per-tier counts vs cumulative list created
  // misleading mismatches: `Your city · 0` next to a list of 2 nearby
  // branches; `More places · 3` next to 5 visible branches.
  //
  // Cumulative now mirrors SearchScreen (SearchScreen.tsx:128-133). The
  // counts read as: "how many branches will I see if I select this scope".
  const counts = meta
    ? {
        nearby:   meta.nearbyCount,
        city:     meta.nearbyCount + meta.cityCount,
        platform: meta.nearbyCount + meta.cityCount + meta.distantCount,
      }
    : undefined

  const expandedBanner = branches.length > 0 && meta?.emptyStateReason === 'expanded_to_wider'
  // Suppress the empty-state copy while the active query is still loading.
  // Otherwise on first mount and on filter-handoff between hooks, `data` is
  // briefly `undefined` → `branches=[]` → `emptyReason='none'` → the
  // "No merchants found" copy flashes for the duration of the network round-
  // trip. Only render the empty state once the request has settled.
  const emptyReason    = branches.length === 0 && !isLoading
    ? (meta?.emptyStateReason ?? 'none')
    : null

  function handleApplyFilters(next: FilterState) {
    setFilters(next)
    setFilterVisible(false)
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.iconButton}
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color={color.navy} />
        </Pressable>

        <Text variant="heading.md" style={styles.title} numberOfLines={1}>
          {categoryName}
        </Text>

        <Pressable
          onPress={() => setFilterVisible(true)}
          style={styles.iconButton}
          accessibilityLabel="Open filters"
        >
          <SlidersHorizontal size={20} color={color.navy} />
        </Pressable>
      </View>

      {/* Scope-control pill row (Nearby · Your city · UK-wide) */}
      <ScopePillRow
        selectedScope={scope}
        onScopeChange={setScope}
        {...(counts ? { counts } : {})}
      />

      {/* Plan 4 M3b follow-up — locality caption. Renders null when
          meta.effectiveLocality is absent, so safe to mount uncondi-
          tionally. Sits above the sortCaption so the two read as
          "near where" then "ordered how". */}
      <LocalityCaption localityName={meta?.effectiveLocality?.name} />

      {/* Intent-aware sort caption (decision #4: don't hide options, annotate
          the default ordering so DESTINATION categories make sense) */}
      <Text style={styles.sortCaption}>{sortCaption}</Text>

      {/* Banner ABOVE the list when scope was widened but results exist */}
      {expandedBanner && <EmptyStateMessage reason="expanded_to_wider" />}

      {/* Results list */}
      <FlatList
        data={branches}
        keyExtractor={(branch) => branch.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item: branch }) => (
          <MerchantTile
            merchant={branchToMerchantTileProps(branch)}
            onPress={() => {
              // Branch-keyed identity (Phase 2.4): adapter swapped `id` → `branch.id`,
              // so the onPress callback receives branch id. We still route to the
              // merchant route path + stamp `?branch=` for branch-aware Merchant
              // Profile + `from=category&categoryId=` for back-nav (see
              // resolveBackNavigation.ts).
              const merchantId = branch.merchant.id
              const branchId   = branch.id
              const url = id
                ? `/merchant/${merchantId}?branch=${branchId}&from=category&categoryId=${id}`
                : `/merchant/${merchantId}?branch=${branchId}&from=category`
              router.push(url as any)
            }}
          />
        )}
        ListEmptyComponent={<EmptyStateMessage reason={emptyReason} />}
      />

      {/* Filter sheet */}
      <FilterSheet
        visible={filterVisible}
        filters={filters}
        resultCount={total}
        onApply={handleApplyFilters}
        onDismiss={() => setFilterVisible(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: '#FFF9F5',
  },
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingTop:       60,
    paddingHorizontal: 18,
    paddingBottom:    spacing[3],
    gap:              spacing[3],
  },
  iconButton: {
    width:           36,
    height:          36,
    borderRadius:    18,
    backgroundColor: color.surface.neutral,
    alignItems:      'center',
    justifyContent:  'center',
  },
  title: {
    flex:  1,
    color: color.navy,
  },
  sortCaption: {
    paddingHorizontal: 18,
    paddingVertical:   spacing[1],
    fontSize:          11,
    fontFamily:        'Lato-Regular',
    color:             color.text.tertiary,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom:     100,
    gap:               12,
  },
})
