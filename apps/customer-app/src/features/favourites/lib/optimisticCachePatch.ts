/**
 * Phase 3C.1g Device-QA R1 Wave 6.7 (2026-05-31) — optimistic
 * cross-surface cache patch helper.
 *
 * Owner-reported symptom: even after Wave 6.6's explicit refetch()
 * on Home focus, Home rail hearts can show stale state for up to
 * ~15 seconds in dev / a few seconds in prod because the backend
 * refetch is the bottleneck.  This helper removes the bottleneck
 * entirely: when a favourite toggles ANYWHERE, all cached
 * discovery surfaces with that branch/voucher have `isFavourited`
 * flipped synchronously via `setQueriesData` — the network
 * refetch still runs afterward as reconciliation, but the UI no
 * longer waits on it.
 *
 * Design:
 *
 * - Pure-function deep recursive walker that returns the SAME
 *   reference when nothing changed (memo-friendly + no spurious
 *   React re-renders).
 * - Only modifies objects where `id === targetId` AND
 *   `typeof isFavourited === 'boolean'` AND the predicate (if
 *   supplied) returns true.  Surgical: doesn't accidentally
 *   create the field on objects that never had it, doesn't
 *   touch siblings, doesn't flip nested objects with a colliding
 *   id but a different shape.
 * - Cycles aren't a concern: all cache data is parsed JSON.
 * - `setQueriesData` is called per top-level entity-scoped query
 *   prefix.  `['discovery']` covers Home rails, Map in-area,
 *   Search, and Category surfaces.  `['merchantProfile']` covers
 *   the merchant-profile vouchers/branches tabs.  `['voucher']`
 *   is added for the voucher branch only.
 *
 * Out of scope for W6.7:
 * - `['favouriteBranches']` / `['favouriteVouchers']` infinite
 *   query data — `useRemoveFavourite` already splices these
 *   in-place via its own optimistic mutation, and `useFavourite`
 *   invalidates them in onSuccess.  Patching these caches via
 *   the deep walker would duplicate the splice / restore work
 *   and risk double-toggling.
 */

import type { QueryClient } from '@tanstack/react-query'

export type FavouriteEntityType = 'branch' | 'voucher'

/**
 * Recursively walk `data` and return a new value where every
 * object satisfying:
 *   - `(node as any).id === targetId`
 *   - `typeof (node as any).isFavourited === 'boolean'`
 *   - `predicate(node)` (if supplied)
 *
 * has its `isFavourited` flipped to `value`.
 *
 * If nothing changed (no matching node OR every matching node
 * already had `isFavourited === value`), returns the SAME
 * reference as the input so React Query's structural-sharing
 * stays clean and downstream observers don't re-render.
 */
export function deepPatchTilesById<T>(
  data:      T,
  targetId:  string,
  value:     boolean,
  predicate: ((node: Record<string, unknown>) => boolean) | undefined = undefined,
): T {
  if (Array.isArray(data)) {
    let changed = false
    const next = (data as unknown[]).map(item => {
      const patched = deepPatchTilesById(item, targetId, value, predicate)
      if (patched !== item) changed = true
      return patched
    })
    return (changed ? (next as unknown as T) : data)
  }

  if (data !== null && typeof data === 'object') {
    const obj = data as Record<string, unknown>

    // Match: same id, has isFavourited bool, predicate passes.
    const isMatch =
      obj.id === targetId &&
      typeof obj.isFavourited === 'boolean' &&
      (predicate === undefined || predicate(obj))

    if (isMatch && obj.isFavourited !== value) {
      // Walk children too — a nested tile inside this object
      // could match too (rare, but defensive — e.g. selectedBranch
      // sub-objects that share id with the parent branch tile).
      const childPatched: Record<string, unknown> = { ...obj, isFavourited: value }
      for (const key in obj) {
        if (key === 'isFavourited' || key === 'id') continue
        const nextChild = deepPatchTilesById(obj[key], targetId, value, predicate)
        if (nextChild !== obj[key]) childPatched[key] = nextChild
      }
      return childPatched as T
    }

    // No top-level flip — but children might still match.
    let changed = false
    const next: Record<string, unknown> = {}
    for (const key in obj) {
      const patched = deepPatchTilesById(obj[key], targetId, value, predicate)
      next[key] = patched
      if (patched !== obj[key]) changed = true
    }
    return (changed ? (next as T) : data)
  }

  return data
}

/**
 * Apply an optimistic `isFavourited` flip to every cached
 * discovery / merchant-profile / voucher query that contains a
 * tile matching `id`.  Pure cache mutation — does NOT trigger a
 * refetch.  Callers are expected to follow up with their own
 * `invalidateQueries` for backend reconciliation.
 *
 * Q4 voucher-cache scope (owner ask): we DO patch `['discovery']`
 * (which contains voucher detail responses) and `['voucher']` and
 * `['merchantProfile']` (vouchers tab) for vouchers; we deliberately
 * leave `['favouriteBranches']` / `['favouriteVouchers']` alone
 * because `useRemoveFavourite` already mutates those caches via
 * splice/restore and patching them here would double-toggle.
 */
export function applyOptimisticFavouriteToDiscoveryCache(
  queryClient: QueryClient,
  entity:      FavouriteEntityType,
  id:          string,
  value:       boolean,
): void {
  const keys: ReadonlyArray<readonly unknown[]> = entity === 'branch'
    ? [['discovery'], ['merchantProfile']]
    : [['discovery'], ['merchantProfile'], ['voucher']]

  for (const key of keys) {
    queryClient.setQueriesData<unknown>(
      { queryKey: key },
      (oldData: unknown) => oldData === undefined
        ? oldData
        : deepPatchTilesById(oldData, id, value),
    )
  }
}
