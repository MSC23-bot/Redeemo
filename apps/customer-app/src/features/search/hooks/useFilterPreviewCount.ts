import { useSearch } from '@/hooks/useSearch'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import type { SearchParams } from '@/lib/api/discovery'
import type { FilterState } from '../components/FilterSheet'

/**
 * Map Phase 2 S5a — the "context" params a screen already has OUTSIDE
 * FilterState (q / location / bbox / scope). FilterSheet's own draft
 * fields (categoryId / sortBy / voucherTypes / amenityIds / openNow)
 * compose on top of this inside `useFilterPreviewCount`.
 */
export type FilterPreviewBaseParams = Pick<
  SearchParams,
  'q' | 'lat' | 'lng' | 'minLat' | 'maxLat' | 'minLng' | 'maxLng' | 'scope'
>

const PREVIEW_DEBOUNCE_MS = 350

function buildPreviewParams(base: FilterPreviewBaseParams, draft: FilterState): SearchParams {
  return {
    ...base,
    ...(draft.categoryId ? { categoryId: draft.categoryId } : {}),
    ...(draft.sortBy !== 'relevance' ? { sortBy: draft.sortBy } : {}),
    ...(draft.voucherTypes.length > 0 ? { voucherTypes: draft.voucherTypes } : {}),
    ...(draft.amenityIds.length > 0 ? { amenityIds: draft.amenityIds } : {}),
    ...(draft.openNow ? { openNow: draft.openNow } : {}),
  }
}

// The backend /search route requires q OR categoryId OR a bbox
// (discovery.ts's `searchMerchants` doc comment). Without one of those,
// firing the preview query would just 400 — treat it as "nothing to
// preview yet" instead.
function hasQueryableContext(params: SearchParams): boolean {
  if (params.q && params.q.length > 0) return true
  if (params.categoryId) return true
  if (
    params.minLat !== undefined && params.maxLat !== undefined &&
    params.minLng !== undefined && params.maxLng !== undefined
  ) return true
  return false
}

/**
 * Draft-filter live result-count preview (owner design brief item 2:
 * "Apply button that shows the LIVE RESULT COUNT... by running the
 * existing query with draft filters, debounced").
 *
 * Reuses `useSearch` (no new endpoint) — deliberately called from the
 * SCREEN, not from inside `<FilterSheet>` itself. `MapScreen.test.tsx`
 * pins hook-call ORDER via a `mockSearchCalls[length - 1]` pattern
 * (asserting the screen's OWN /search call is the last one seen); a
 * second `useSearch` call living inside FilterSheet — which always
 * mounts as a child of the screen, regardless of sheet visibility —
 * would push AFTER the screen's own call and silently break those
 * assertions. Calling this hook as the FIRST hook in the screen's body
 * keeps its internal `useSearch` call chronologically BEFORE the
 * screen's existing one, preserving that ordering contract.
 *
 * `active` gates the query on the sheet actually being open — no
 * background fetching while the sheet is closed.
 */
export function useFilterPreviewCount(
  active: boolean,
  base:   FilterPreviewBaseParams,
  draft:  FilterState,
) {
  const debouncedDraft = useDebouncedValue(draft, PREVIEW_DEBOUNCE_MS)
  const params  = buildPreviewParams(base, debouncedDraft)
  const enabled = active && hasQueryableContext(params)
  const query = useSearch(params, enabled, { keepPreviousData: true, staleTime: 20 * 1000 })
  const count = query.data
    ? (query.data.totalBranches ?? query.data.branches?.length ?? null)
    : null
  return { count, pending: enabled && query.isLoading }
}
