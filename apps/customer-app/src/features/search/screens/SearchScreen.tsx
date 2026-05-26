import React, { useState, useEffect, useRef } from 'react'
import { View, FlatList, StyleSheet, Keyboard } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '@/design-system/Text'
import { useSearch } from '@/hooks/useSearch'
import { useUserLocation } from '@/hooks/useLocation'
// §DF-v2-j Task 10 — top-of-screen location identity affordance + the
// canonical source for SearchEmptyState.savedAreaCity.  Both flow from
// searchResponse.locationContext now; the previous useMe() derivation
// of savedAreaCity is retired (see commit message + inline note below).
import { LocationStatusLabel } from '@/lib/location/LocationStatusLabel'
import { SearchBar } from '../components/SearchBar'
import { TrendingSearches } from '../components/TrendingSearches'
import { SearchResultItem } from '../components/SearchResultItem'
import { SearchEmptyState } from '../components/SearchEmptyState'
import { ScopePillRow, type Scope } from '@/features/shared/ScopePillRow'
import { BranchTile } from '@/lib/api/discovery'
import { RedeemoLoader } from '@/design-system/motion/RedeemoLoader'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebounced(value), delay)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [value, delay])
  return debounced
}

function ResultSkeleton() {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonAvatar} />
      <View style={styles.skeletonLines}>
        <View style={[styles.skeletonLine, { width: 120, height: 12 }]} />
        <View style={[styles.skeletonLine, { width: 140 }]} />
        <View style={[styles.skeletonLine, { width: 90 }]} />
      </View>
      <View style={styles.skeletonPill} />
    </View>
  )
}

// Spec §4.1 scope cascade: backend bucket → display pill mapping.  The pill
// row surfaces 3 user-facing values; backend `branchMeta.scope` reports the
// raw cascade rung (5 values incl. 'region' which we treat as 'city').
//
// PR #124 fixup-3 (2026-05-22) — supply-aware default scope.
//
// Pre-fixup: `effectiveScope` was derived from `branchMeta.scope`.  But the
// backend's `resolvedScope` reports which TIERS are retained in the merged
// list, not where the supply is actually concentrated.  When LOCAL/MIXED
// intent default kept the NEARBY+CITY tiers (with nearbyCount=1, cityCount=0),
// `branchMeta.scope === 'city'` and the UI highlighted "Your city" even
// though all the supply was on the NEARBY rung — visually misleading.
//
// Owner-locked rule (PR #124 fixup-3, 2026-05-22):
//   "If Nearby has results, default to Nearby.
//    Else if Your city has results, default to Your city.
//    Else default to More places."
//
// The narrowest-with-supply heuristic uses RAW bucket counts (NOT cumulative
// — those would always be > 0 if any results exist).  Falls back to the
// backend-resolved scope only when ALL buckets are zero (the genuinely-empty
// case, where `branchMeta.emptyStateReason === 'no_uk_supply'`).
function effectiveScopeFromCounts(
  branchMeta: {
    scope?:        'nearby' | 'city' | 'region' | 'platform' | undefined
    nearbyCount?:  number
    cityCount?:    number
    distantCount?: number
  } | undefined,
): Scope | undefined {
  if (!branchMeta) return undefined
  if ((branchMeta.nearbyCount  ?? 0) > 0) return 'nearby'
  if ((branchMeta.cityCount    ?? 0) > 0) return 'city'
  if ((branchMeta.distantCount ?? 0) > 0) return 'platform'
  // All-empty fallback — preserve backend-resolved scope so the pill
  // still reflects the cascade outcome on no-supply searches.
  return effectiveScopeFromMetaCascadedScope(branchMeta.scope)
}

/**
 * PR #124 fixup-5 — backend cascaded scope → display pill mapping.
 *
 * Used ONLY when `branchMeta.scopeExpanded === true` (i.e. backend
 * widened past the user's requested scope to find supply).  In that
 * case the active pill should reflect the wider resolvedScope, not
 * the user's tap nor the supply-aware default.  See SearchScreen
 * effectiveScope derivation for the priority rules.
 */
function effectiveScopeFromMetaCascadedScope(
  metaScope: 'nearby' | 'city' | 'region' | 'platform' | undefined,
): Scope {
  if (metaScope === 'nearby')   return 'nearby'
  if (metaScope === 'platform') return 'platform'
  // 'city' and 'region' both render under the 'Your city' pill — locked
  // at Task 2.1.0 scope parity (memory project_discovery_rebaseline_task_2_1_0).
  return 'city'
}

export function SearchScreen() {
  const router  = useRouter()
  const insets  = useSafeAreaInsets()
  // PR #112 fixup-6 (2026-05-20) — accept `?q=` on the URL so users
  // returning from a merchant page (with `from=search&q=<query>`) land
  // back on Search with their typed query restored.  Lazy initialiser
  // pulls the URL param on first mount; subsequent input is local state.
  const params  = useLocalSearchParams<{ q?: string | string[] }>()
  const initialQ = (() => {
    const raw = params?.q
    if (Array.isArray(raw)) return raw[0] ?? ''
    return typeof raw === 'string' ? raw : ''
  })()
  const [query, setQuery] = useState(initialQ)
  // `requestedScope` = the scope the user last tapped (undefined → default).
  // `effectiveScope` = what's actually being shown (derived below from
  // branchMeta).  The pill highlight tracks effectiveScope, NOT requestedScope.
  const [requestedScope, setRequestedScope] = useState<Scope | undefined>(undefined)
  const debouncedQuery = useDebounce(query, 300)
  const loc = useUserLocation()
  const { location } = loc
  // §DF-v2-j Task 10 (2026-05-26) — `savedAreaCity` now derives from the
  // wire envelope (`data?.locationContext`) populated by the /search
  // route handler (Task 4).  The previous useMe() derivation
  // (`me.data?.locality?.name ?? me.data?.city`) is retired: the user-
  // context resolution is owned by `resolveLocationContext` on the
  // backend, so there's no value recomputing it on the client.  This
  // also retires the §DF v1 helper comment about useMe powering
  // profile-aware empty states — same product behaviour now flows
  // through the unified envelope.
  //
  // Derivation lives AFTER the useSearch call below (depends on `data`).

  const searchEnabled = debouncedQuery.length >= 1
  const { data, isLoading } = useSearch(
    {
      q: debouncedQuery,
      ...(location?.lat !== undefined ? { lat: location.lat } : {}),
      ...(location?.lng !== undefined ? { lng: location.lng } : {}),
      ...(requestedScope ? { scope: requestedScope } : {}),
      limit: 30,
    },
    searchEnabled
  )

  const handleCancel = () => { Keyboard.dismiss(); router.back() }
  // Discovery Rebaseline PR-2 (Phase 2.1) — read the additive `branches`
  // arm.  Multi-branch merchants now render as separate rows (Covelum bug
  // fix, Spec §3.3).  The legacy `merchants` arm is still on the wire for
  // surfaces that haven't migrated yet (Home / Category / Map).
  const branches: BranchTile[] = data?.branches ?? []
  // §DF-v2-j Task 10 — single source of truth for both
  // <LocationStatusLabel> + <SearchEmptyState savedAreaCity={…}>.
  // Falls back to locality.name when city is null (keeps the original
  // §DF v1 ladder: prefer locality.name → city → null).  When the
  // searchResponse is undefined (cold-cache / pre-data fetch) this
  // remains null — same behaviour as the retired useMe() derivation
  // during its own loading window.
  const locationContext = data?.locationContext
  const savedAreaCity = locationContext?.city ?? locationContext?.locality?.name ?? null
  const showTrending = !searchEnabled
  const showLoading = searchEnabled && isLoading
  const showResults = searchEnabled && !isLoading

  // PR-2 device-QA fix (2026-05-19) — read `branchMeta` instead of legacy
  // `meta` for counts + emptyStateReason + effectiveLocality.  Without
  // this, scope pills displayed merchant-tier counts while the list
  // rendered branches — the owner-observed split that produced
  // misleading "UK-wide · 1" pills alongside an empty branch list.
  //
  // `branchMeta` is emitted by the /search route additively alongside
  // the legacy `meta` (which other surfaces — Home / Map / Category —
  // continue to read until their Phase 2.x migrations land).
  //
  // Fallback: if `branchMeta` isn't present (legacy server, pre-PR-2
  // backend), we hide counts entirely rather than silently mixing
  // merchant-tier counts into a branch list.  Better to show nothing
  // than to mislead.
  // PR #112 device-QA fix #2 (2026-05-19) — display counts on the
  // ScopePillRow are CUMULATIVE (Nearby ⊆ Your city ⊆ UK-wide) so the
  // user's mental model matches what they see.  Backend bucket counts
  // are preserved on the wire (`branchMeta.nearbyCount /cityCount /
  // distantCount`) — the cumulative transform happens here at the
  // display layer ONLY so other `/search` consumers (Home / Map /
  // Category) continue to read the bucket contract unchanged.
  //
  //   Nearby   = branchMeta.nearbyCount
  //   Your city = branchMeta.nearbyCount + branchMeta.cityCount
  //   UK-wide  = branchMeta.nearbyCount + branchMeta.cityCount + branchMeta.distantCount
  //
  // Owner observation that drove this change: Karaara 276m away
  // rendered `Nearby · 1, Your city · 0, UK-wide · 0` — counter-
  // intuitive because if a result is nearby, users assume it's also
  // in city and UK-wide.  Cumulative counts produce
  // `Nearby · 1, Your city · 1, UK-wide · 1` for the same data.
  const branchMeta = data?.branchMeta
  const counts = branchMeta
    ? {
        nearby:   branchMeta.nearbyCount,
        city:     branchMeta.nearbyCount + branchMeta.cityCount,
        platform: branchMeta.nearbyCount + branchMeta.cityCount + branchMeta.distantCount,
      }
    : undefined

  // PR #112 fixup-3 (2026-05-19) — effective-scope derivation.
  // Active pill highlight reflects what's DISPLAYED, not what was REQUESTED.
  // When the backend cascades out of the user's requested scope (e.g. user
  // tapped "Your city" but Huddersfield has no supply → backend served
  // UK-wide), highlight the wider pill that actually carries the results.
  // The expanded-banner above the list does the explaining.
  //
  // Owner-locked rule: "active pill should reflect what is actually being
  // shown" — internally consistent UX (no "Your city · 0 selected" with
  // results visible below).
  // PR #124 fixup-3 + fixup-5 — priority-ordered active-pill derivation:
  //
  //   1. Backend cascaded past the user's requested scope
  //      (`branchMeta.scopeExpanded === true`) → reflect the resolved
  //      (wider) scope so the pill matches what's actually displayed.
  //      Owner-locked PR #112 fixup-3: "active pill should reflect what
  //      is actually being shown".
  //
  //   2. User explicitly tapped a pill (`requestedScope` is set) →
  //      honour the tap so the visual state updates immediately.
  //      Closes the PR #124 device-QA "selected pill state is broken"
  //      blocker — pre-fixup the new supply-aware derivation IGNORED
  //      `requestedScope`, so tapping `Your city` / `More places`
  //      changed results but left `Nearby` red.
  //
  //   3. Initial mount with no tap (`requestedScope === undefined`) →
  //      supply-aware narrowest-with-supply default (fixup-3 rule).
  const effectiveScope: Scope | undefined = (() => {
    if (!branchMeta) return requestedScope
    if (branchMeta.scopeExpanded) {
      return effectiveScopeFromMetaCascadedScope(branchMeta.scope)
    }
    if (requestedScope) return requestedScope
    return effectiveScopeFromCounts(branchMeta)
  })()

  // 'expanded_to_wider' is reflected in the SINGLE results header line below
  // — no separate banner.  'none' / 'no_uk_supply' render INSIDE the list as
  // the empty state.
  const isExpanded   = branches.length > 0 && branchMeta?.emptyStateReason === 'expanded_to_wider'
  const localityName = branchMeta?.effectiveLocality?.name?.trim() || null
  const emptyReason  = branches.length === 0
    ? (branchMeta?.emptyStateReason ?? 'none')
    : null

  // PR #124 fixup-5 (2026-05-22) — PLACE-search fallback honesty.
  //
  // Owner device QA flagged that q="Leeds" / q="Bristol" / q="Manchester"
  // overclaimed "Offers in <Place>" while showing UK-wide / Huddersfield
  // results — even when NO actual branches were in the searched place's
  // Locality.  Rule:
  //
  //   placeFallback = searchChip.mode === 'PLACE' AND (
  //     scopeExpanded === true OR
  //     no branch's branchLocalityId matches the effectiveLocality.id
  //   )
  //
  // When placeFallback is true:
  //   - Hide ScopePillRow (pills are confusing in this state — "Nearby"
  //     would refer to the user's GPS-locality, not the searched place)
  //   - Show honest banner above results explaining the fallback
  //   - Header reads "Closest matches near <Place>" (fixup-2 already)
  //
  // PR #112 fixup-4 (2026-05-19) — owner-locked unified header copy.
  // Replaces the previous two-line treatment (`Results for "X"` +
  // `<LocalityCaption>` + optional `<ExpandedResultBanner>`).  One line:
  //
  //   Normal:    Results for "X" near <Locality>     / Results for "X"
  //   Expanded:  Closest matches for "X" near <Locality>  / Closest matches for "X"
  //
  // Positive framing on expanded ("Closest matches" instead of "Nothing in X
  // yet") per owner direction.  No em dashes; British English.
  //
  // Plan 4 M4.5 (Path 5b — §M4-AMENDMENT-2026-05-22 A1):
  //
  // Extend the same unified header to read `branchMeta.searchChip` and
  // render additional copy variants WITHOUT introducing a new chip
  // component.  Keeps the customer-app surgical — owner explicitly chose
  // this over a standalone <SearchChip> to avoid compounding the §CP
  // pills+chips+banner label-system count.
  //
  //   PLACE mode (q matched a Locality):
  //     In-place results:  `Offers in <Place>`
  //                        (q IS the place — drop the `Results for "X"`
  //                         framing because q === Place name)
  //     Widened fallback:  `Closest matches near <Place>`
  //                        (PR #124 fixup-2 honesty rule — when the
  //                         backend's scope cascade widened past the
  //                         matched place to find supply, the header
  //                         MUST reflect that the displayed results are
  //                         NOT "in" the place.  Otherwise users see
  //                         `Offers in Manchester` alongside platform-
  //                         wide merchants — overclaim.)
  //
  //   TAG mode (q matched a curated Tag.label):
  //     `<Tag> offers near <Locality>` / `<Tag> offers` (no locality)
  //
  //   null mode (no place + no tag): existing `Results / Closest matches`
  //   header behaviour unchanged.
  const searchChip   = branchMeta?.searchChip ?? null
  const stem         = isExpanded ? 'Closest matches' : 'Results'

  // PR #124 fixup-5 (2026-05-22) — PLACE-search fallback honesty.
  //
  // Owner device QA flagged that q="Leeds" / q="Bristol" / q="Manchester"
  // overclaimed "Offers in <Place>" while showing UK-wide / Huddersfield
  // results — even when NO actual branches were in the searched place's
  // Locality.  Rule:
  //
  //   placeFallback = searchChip.mode === 'PLACE' AND (
  //     scopeExpanded === true OR
  //     no branch's branchLocalityId matches the effectiveLocality.id
  //   )
  //
  // When placeFallback is true:
  //   - Hide ScopePillRow (pills are confusing in this state — "Nearby"
  //     would refer to the user's GPS-locality, not the searched place)
  //   - Show honest banner above results explaining the fallback
  //   - Header reads "Closest matches near <Place>" (fixup-2 already)
  //
  // The branch-level Locality check is the strict signal — if owner
  // device QA observes Huddersfield merchants under "Offers in Leeds",
  // the rung-classifier called them NEARBY (catchment edge) but they
  // aren't IN Leeds.  The strict check sees through the rung framing.
  //
  // PR #124 fixup-6 (2026-05-22) — id-match alone is too strict.
  // Owner device QA found that q="Huddersfield" fired the fallback
  // banner even though 3 Huddersfield merchants surfaced.  Root cause:
  // the dev DB carries MULTIPLE Locality rows named "Huddersfield"
  // (different LAD/source combinations — allowed by the schema's
  // `@@unique([name, ladDistrict, country])` constraint).  The
  // `tryPlaceMatch` resolved one Locality row; the branches were
  // linked to a different Locality row.  Both share the name
  // "Huddersfield" — so a NAME / postTown text fallback closes the
  // gap.
  //
  // Identity ladder (priority order):
  //   1. branchLocalityId === effectiveLocality.id (strict, exact)
  //   2. branchLocalityName === searchChip.label   (case-insensitive)
  //   3. branchPostTown     === searchChip.label   (case-insensitive)
  //
  // Any match → in-place.  Still strict enough to fail on Leeds with
  // only Huddersfield merchants (branchLocalityName="Huddersfield"
  // does NOT match "leeds").
  const placeLocalityId = searchChip?.mode === 'PLACE'
    ? branchMeta?.effectiveLocality?.id ?? null
    : null
  const placeLabelLower = searchChip?.mode === 'PLACE'
    ? searchChip.label.toLowerCase()
    : null
  const inPlaceCount = (placeLocalityId || placeLabelLower)
    ? branches.filter(b => {
        if (placeLocalityId && b.branchLocalityId === placeLocalityId) return true
        if (placeLabelLower) {
          if (b.branchLocalityName?.toLowerCase() === placeLabelLower) return true
          if (b.branchPostTown?.toLowerCase()     === placeLabelLower) return true
        }
        return false
      }).length
    : 0
  const placeFallback =
    searchChip?.mode === 'PLACE' &&
    (branchMeta?.scopeExpanded === true || inPlaceCount === 0)
  const resultsHeaderText = (() => {
    if (searchChip?.mode === 'PLACE') {
      // PR #124 fixup-2 + fixup-7 (2026-05-22) — owner-direction
      // honesty rule.  The header MUST agree with the fallback banner:
      // any state that triggers `placeFallback` (the inPlaceCount=0
      // identity-ladder check OR scopeExpanded=true) MUST use the
      // "Closest matches near" framing — NEVER "Offers in".
      //
      // Pre-fixup-7: header used `isExpanded` (driven by
      // `emptyStateReason === 'expanded_to_wider'`) while banner used
      // `placeFallback`.  For q="Leeds" where Huddersfield merchants
      // ranked NEARBY-rung via catchment edge: banner fired (no
      // in-place supply), but isExpanded was false (cascade didn't
      // fire) — so the header said "Offers in Leeds" while the banner
      // contradicted it.  Unifying on `placeFallback` closes that gap.
      if (placeFallback) {
        return `Closest matches near ${searchChip.label}`
      }
      return `Offers in ${searchChip.label}`
    }
    if (searchChip?.mode === 'TAG') {
      return localityName
        ? `${searchChip.label} offers near ${localityName}`
        : `${searchChip.label} offers`
    }
    return localityName
      ? `${stem} for "${debouncedQuery}" near ${localityName}`
      : `${stem} for "${debouncedQuery}"`
  })()

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {/* §DF-v2-j Task 10 — strip-variant <LocationStatusLabel>
          mounted IMMEDIATELY above the SearchBar row per spec §8.2.
          Reads `data?.locationContext` (the same envelope feeding
          savedAreaCity below).  Renders null during the React Query
          loading window per §LSL-7. */}
      <LocationStatusLabel
        variant="strip"
        locationContext={locationContext}
      />

      <SearchBar
        value={query}
        onChangeText={setQuery}
        onCancel={handleCancel}
        autoFocus
        placeholder="Search merchants..."
      />

      {showTrending && (
        <>
          {/* Plan 4 M4.6 — pre-search behaviour now branches on whether
              we have ANY location signal.  With GPS or a saved area, the
              pre_search discovery prompt + trending pills makes sense
              ("Find your next local saving" implies "near here").
              Without ANY location signal, the user can't get useful
              results without first setting their area — show the
              no_location prompt instead so the UX leads them to PC2.

              GPS-less behaviour is the only observable signal here at
              the moment; saved-profile-area lookup would tighten this
              further (spec §6.6) but isn't load-bearing for the M4.6
              scope. */}
          {location ? (
            <>
              {/* PR #112 fixup-6.4 (2026-05-20) — pre-search discovery
                  prompt.  Owner-locked copy: "Find your next local
                  saving" + persona body line. */}
              <SearchEmptyState reason="pre_search" />
              <TrendingSearches onTagPress={setQuery} />
            </>
          ) : (
            // §DF — no_location empty state is
            // now profile-aware.  With a saved postcode: dual CTA
            // ("Use current location" / "Change saved area") +
            // "Searching near {city} from your saved postcode" copy.
            // Without one: original "Set your area" prompt — but the
            // CTA now routes to `/saved-area`, NOT the old PC2-
            // address flow (which was the right path pre-§DF v1 when
            // there was no Saved Area surface).
            <SearchEmptyState
              reason="no_location"
              savedAreaCity={savedAreaCity}
              // §DF Round 5 — pass `from=search` so Your Location's
              // back button returns to Search rather than landing on
              // Home (tab-stack quirk on Expo Router tabs).
              onSetArea={() => router.push('/saved-area?from=search' as any)}
              // §DF Round 5 — secondary CTA label override.  Without
              // the override, the recovery sheet shows "Use saved
              // area" which is redundant here (the user is already
              // using saved area when triggering this CTA from
              // Search).  "Not now" is the locked Search-context copy.
              onUseCurrentLocation={() => {
                void loc.request({ recoveryLabels: { secondary: 'Not now' } })
              }}
              onChangeSavedArea={() => router.push('/saved-area?from=search' as any)}
            />
          )}
        </>
      )}

      {/* PR #124 fixup-5 — hide pills in PLACE-fallback state.  The
          Nearby / Your city / More places framing is anchored to the
          user's device location; when the user explicitly searched a
          DIFFERENT place and we don't have in-place supply, those
          labels become misleading.  Pills come back as soon as there's
          any in-place supply OR the user clears the place search. */}
      {searchEnabled && !placeFallback && (
        <ScopePillRow
          // Active pill = effectiveScope (what's displayed), not requestedScope.
          selectedScope={effectiveScope}
          onScopeChange={setRequestedScope}
          {...(counts ? { counts } : {})}
        />
      )}

      {/* PR #124 fixup-5 — honest banner for PLACE-fallback state. */}
      {placeFallback && searchChip?.mode === 'PLACE' && (
        <View style={styles.placeFallbackBanner} testID="place-fallback-banner">
          <Text style={styles.placeFallbackText}>
            We do not have merchants in {searchChip.label} yet. Here are the
            closest matches we have.
          </Text>
        </View>
      )}

      {(showLoading || showResults) && (
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsLabel} numberOfLines={2}>
            {showLoading
              ? `Results for "${debouncedQuery}"`
              : resultsHeaderText}
          </Text>
          {showLoading && (
            <View style={styles.loadingRow}>
              {/* PR #112 fixup-6.4 (2026-05-20) — owner direction: loader bumped
                  from 22pt to 28pt.  Slightly bigger reads more confidently
                  against the result-header row without crowding the
                  "Results for X near Y" text. */}
              <RedeemoLoader size={28} accessibilityLabel="Searching" />
            </View>
          )}
        </View>
      )}

      {showLoading && (
        <View style={styles.skeletons}>
          <ResultSkeleton />
          <ResultSkeleton />
          <ResultSkeleton />
          <ResultSkeleton />
        </View>
      )}

      {showResults && (
        <FlatList
          data={branches}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SearchResultItem
              tile={item}
              query={debouncedQuery}
              onPress={(branchId, merchantId) => {
                // PR #112 fixup-6 (2026-05-20) — pass `from=search` + the
                // current query so the merchant page's back button routes
                // back to Search with the query preserved (owner-locked).
                const qParam = debouncedQuery.length > 0
                  ? `&from=search&q=${encodeURIComponent(debouncedQuery)}`
                  : '&from=search'
                router.push(`/(app)/merchant/${merchantId}?branch=${branchId}${qParam}` as any)
              }}
            />
          )}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <SearchEmptyState
              reason={emptyReason as 'none' | 'no_uk_supply' | null}
              query={debouncedQuery}
            />
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF9F5',
  },
  resultsHeader: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingHorizontal: 18,
    paddingTop:        4,
    marginBottom:      10,
  },
  resultsLabel: {
    fontSize:   14,                // body.sm — bumped from 11pt per device QA
    fontFamily: 'Lato-Regular',
    color:      '#6B7280',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  skeletons: { gap: 8, paddingTop: 4 },
  skeletonCard: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   '#FFFFFF',
    borderRadius:      16,           // rounded.lg — match real card
    paddingVertical:   14,
    paddingHorizontal: 14,
    marginHorizontal:  16,
    gap:               12,
    shadowColor:       '#010C35',    // navy-tinted
    shadowOpacity:     0.05,
    shadowRadius:      4,
    shadowOffset:      { width: 0, height: 2 },
    elevation:         1,
  },
  skeletonAvatar: {
    width:           48,             // match real 48pt logo
    height:          48,
    borderRadius:    12,
    backgroundColor: '#E5E7EB',
    flexShrink:      0,
  },
  skeletonLines: { flex: 1, gap: 6 },
  skeletonLine: {
    height:          10,
    borderRadius:    5,
    backgroundColor: '#E5E7EB',
  },
  skeletonPill: {
    width:           96,            // match new pill minWidth
    height:          38,
    borderRadius:    16,            // rounded.lg
    backgroundColor: '#E5E7EB',
  },
  listContent: { paddingBottom: 32 }, // clear tab bar comfortably
  // PR #124 fixup-5 — PLACE-fallback honesty banner.  Soft warm-tinted
  // surface (matches the app's cream identity); body copy reads as
  // honest information, not an error.  Sits BELOW the unified result
  // header ("Closest matches near <Place>") and ABOVE the result list.
  placeFallbackBanner: {
    marginHorizontal: 18,
    marginTop:        8,
    marginBottom:     8,
    paddingVertical:    10,
    paddingHorizontal:  14,
    backgroundColor: '#FEF6F5',         // color.surface.tint
    borderRadius:    12,
  },
  placeFallbackText: {
    fontSize:    13,
    fontFamily:  'Lato-Regular',
    color:       '#4B5563',
    lineHeight:  18,
    textAlign:   'center',
  },
  emptyText: {
    fontSize:   13,
    fontFamily: 'Lato-Regular',
    color:      '#9CA3AF',
    textAlign:  'center',
    marginTop:  32,
    paddingHorizontal: 24,
  },
})
