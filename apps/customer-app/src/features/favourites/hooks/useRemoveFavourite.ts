/**
 * Phase 3C.1g M2.4 — `useRemoveFavourite` (Favourites tab swipe-to-
 * remove + 4s undo).
 *
 * Spec §7.3 — the Favourites tab is the only surface where the
 * removal path is NOT the `<FavouriteHeart>` press.  Users swipe a
 * row to reveal Remove; tapping Remove optimistically splices the row
 * out of the list cache, drops an UndoToast for 4 seconds, then
 * issues the DELETE (or restores the row on Undo).
 *
 * State held in this hook:
 *   - The pending-removal row (typed as `T`, the cache row shape).
 *   - The setTimeout handle that fires the DELETE after 4s.
 *   - The last error (so the screen can surface a toast on rollback).
 *
 * Locked invariant (spec §7.2.1): `useFavourite()` is called ONLY by
 * `<FavouriteHeart>` and by THIS hook.  This hook does NOT use
 * `useFavourite()` — it talks to `favouritesApi.removeBranch` /
 * `removeVoucher` directly so the optimistic UI happens in the list
 * cache, NOT via the hook's pessimistic-with-onSuccess state.
 */

import { useCallback, useRef, useState } from 'react'
import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { favouritesApi, type FavouriteBranchesResponse, type FavouriteVouchersResponse } from '@/lib/api/favourites'

const UNDO_WINDOW_MS = 4_000

type EntityType = 'branch' | 'voucher'

/**
 * Minimum shape a row must expose for this hook to optimistically
 * splice it out of the list cache and later put it back.  The
 * concrete branch / voucher response shapes both expose `id`.
 */
interface FavouriteRowLike { id: string }

interface PendingRemoval<T extends FavouriteRowLike> {
  row:        T
  // Wave 6.3 — `rowId` cached on the pending record so flushPending
  // can re-invoke the DELETE without re-reading `row.id` from a
  // potentially-stale outer closure.
  rowId:      string
  pageIndex:  number
  rowIndex:   number
  timer:      ReturnType<typeof setTimeout>
}

export interface UseRemoveFavouriteReturn<T extends FavouriteRowLike> {
  /** Optimistically remove `row` from the list cache + schedule the DELETE. */
  remove:    (row: T) => void
  /** Cancel the pending DELETE + restore the row to its original index. */
  undo:      () => void
  /**
   * Wave 6.3 (2026-05-30) — fire the pending DELETE immediately
   * (clearing its 4s undo-window timer) and return a Promise that
   * resolves once invalidation has fired.  Callers use this when
   * the screen is about to lose focus / unmount so the backend
   * mutation + cross-surface cache invalidation reach the rest of
   * the app before the user lands on another tab.
   *
   * Owner-reported symptom (pre-Wave-6.3): user removes the last
   * favourited merchant + immediately taps "Discover merchants" →
   * Home tab shows the still-favourited heart because the 4s timer
   * hasn't fired yet, so the DELETE hasn't been issued and the
   * discovery cache hasn't been invalidated.
   *
   * Safe no-op when no removal is pending.
   */
  flushPending: () => Promise<void>
  /** True while a removal is pending (between `remove()` and timeout fire / undo). */
  isPending: boolean
  /** Last DELETE error (rolled-back removal).  Null when no error pending. */
  error:     unknown
  /** Clear the `error` after the screen has surfaced its toast. */
  clearError:() => void
}

export function useRemoveFavourite<T extends FavouriteRowLike>(
  entity: EntityType,
): UseRemoveFavouriteReturn<T> {
  const queryClient = useQueryClient()
  // Wave 6.5 (2026-05-31) — `pending` is now a Map keyed by rowId,
  // not a single-slot ref.  Owner-reported symptom: removing 2-3
  // merchants/vouchers in quick succession showed only the FIRST
  // toast + the rest were silently removed.  Root cause: the old
  // single-slot `pending.current` was overwritten by each new
  // `remove()` call; when the FIRST timer fired, its `finally`
  // ran `setIsPending(false)`, which prematurely cleared
  // `undoMessage` on the screen (the screen's clear-condition is
  // `undoMessage && !isPending`).  Items 2+ then DELETEd silently
  // ~500ms apart with no visible toast.  The map supports per-row
  // timers + per-row rollback; isPending is now derived from
  // count > 0 so it stays true until EVERY pending DELETE
  // resolves.  `insertionOrder` preserves the order rows were
  // removed so `undo()` correctly targets the MOST RECENT one
  // (the toast the user is currently looking at).
  const pendingMap   = useRef(new Map<string, PendingRemoval<T>>())
  const insertionRef = useRef<string[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const isPending = pendingCount > 0
  const [error, setError] = useState<unknown>(null)

  const queryKey:  readonly unknown[] = entity === 'branch'
    ? ['favouriteBranches']
    : ['favouriteVouchers']

  // Type-narrow the cache to the right entity's InfiniteData shape.
  type PageShape = T extends FavouriteBranchesResponse['items'][number] ? FavouriteBranchesResponse
                 : T extends FavouriteVouchersResponse['items'][number] ? FavouriteVouchersResponse
                 : { items: T[]; total: number; page: number; limit: number }

  const splice = (rowId: string): { pageIndex: number; rowIndex: number; row: T } | null => {
    const data = queryClient.getQueryData<InfiniteData<PageShape>>(queryKey)
    if (!data) return null
    for (let p = 0; p < data.pages.length; p++) {
      const page = data.pages[p]!
      const idx  = page.items.findIndex((it: FavouriteRowLike) => it.id === rowId)
      if (idx >= 0) {
        const row = page.items[idx] as unknown as T
        const nextPages = data.pages.map((pg, i) => i === p
          ? { ...pg, items: pg.items.filter((_: unknown, j: number) => j !== idx), total: pg.total - 1 }
          : { ...pg, total: pg.total - 1 },
        )
        queryClient.setQueryData<InfiniteData<PageShape>>(queryKey, { ...data, pages: nextPages })
        return { pageIndex: p, rowIndex: idx, row }
      }
    }
    return null
  }

  const restore = (pageIndex: number, rowIndex: number, row: T): void => {
    const data = queryClient.getQueryData<InfiniteData<PageShape>>(queryKey)
    if (!data) return
    const nextPages = data.pages.map((pg, i) => {
      if (i === pageIndex) {
        const items = [...pg.items]
        items.splice(rowIndex, 0, row as unknown as PageShape['items'][number])
        return { ...pg, items, total: pg.total + 1 }
      }
      return { ...pg, total: pg.total + 1 }
    })
    queryClient.setQueryData<InfiniteData<PageShape>>(queryKey, { ...data, pages: nextPages })
  }

  const clearError = useCallback(() => setError(null), [])

  // Helper: drop a rowId from the Map + insertion order + decrement
  // count.  Used by every terminal path (timer fire success/error,
  // undo, flushPending).
  const dropPending = useCallback((rowId: string): void => {
    if (pendingMap.current.has(rowId)) {
      pendingMap.current.delete(rowId)
      insertionRef.current = insertionRef.current.filter(id => id !== rowId)
      setPendingCount(c => Math.max(0, c - 1))
    }
  }, [])

  // Wave 6.3 — fire-the-DELETE body extracted so both `setTimeout`
  // (4s undo-window expiry) AND `flushPending()` (caller-driven
  // immediate fire) share one implementation.
  const fireDeleteFor = useCallback(async (
    rowId: string,
    spliced: { pageIndex: number; rowIndex: number; row: T },
  ): Promise<void> => {
    try {
      if (entity === 'branch')  await favouritesApi.removeBranch(rowId)
      else                       await favouritesApi.removeVoucher(rowId)
      // Backend confirmed the removal.  Reconcile the favourites
      // list (the source of truth for the Favourites tab) PLUS
      // every cross-surface cache that renders an isFavourited
      // flag for this entity so the heart state aligns on next
      // focus.
      //
      // Phase 3C.1g Device-QA R1 Wave 3 (2026-05-30) — finding
      // #15 (Merchant Profile voucher card heart stale after
      // Favourites > Vouchers removal) + #14 (Home rail heart
      // stale after Favourites > Merchants removal).  Same broad
      // prefix invalidation pattern as `useFavourite` so the
      // round-trip is symmetric: add anywhere → see everywhere,
      // remove anywhere → see everywhere.
      //
      // Wave 4 #21 (2026-05-30): added ['voucher'] so removing a
      // voucher from Favourites also flips the cached Voucher
      // Detail isFavourited flag.  Mirrors `useFavourite`'s broad
      // invalidations exactly.
      queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: ['merchantProfile'] })
      queryClient.invalidateQueries({ queryKey: ['discovery'] })
      queryClient.invalidateQueries({ queryKey: ['voucher'] })
    } catch (err) {
      // DELETE failed — roll back the cache splice + surface the error.
      restore(spliced.pageIndex, spliced.rowIndex, spliced.row)
      setError(err)
    } finally {
      dropPending(rowId)
    }
  }, [entity, queryClient, queryKey, dropPending])

  const remove = useCallback((row: T) => {
    // Splice optimistically.  Bail out if the row isn't found in the
    // cache (defensive — e.g. cache was refetched mid-swipe).
    const spliced = splice(row.id)
    if (!spliced) return

    setError(null)

    const timer = setTimeout(() => {
      // Drop the unhandled-promise; `fireDeleteFor`'s own finally
      // block handles rollback + state.
      void fireDeleteFor(row.id, spliced)
    }, UNDO_WINDOW_MS)

    // Wave 6.5 — add to per-row Map + track insertion order.
    // Multiple concurrent pending removals each get their own
    // timer, splice record, and rollback path.  isPending stays
    // true until ALL have fired (count > 0), so the screen-level
    // undo toast doesn't prematurely hide when the FIRST timer
    // fires.
    pendingMap.current.set(row.id, { ...spliced, timer, rowId: row.id })
    insertionRef.current = [...insertionRef.current.filter(id => id !== row.id), row.id]
    setPendingCount(c => c + 1)
  }, [fireDeleteFor])

  const undo = useCallback(() => {
    // Wave 6.5 — undo targets the MOST RECENTLY added pending row
    // (the one whose toast the user is currently looking at).
    // Older pending removals stay pending until their own timers
    // fire OR another flushPending call.
    const order = insertionRef.current
    if (order.length === 0) return
    const lastId = order[order.length - 1]!
    const p = pendingMap.current.get(lastId)
    if (!p) return
    clearTimeout(p.timer)
    restore(p.pageIndex, p.rowIndex, p.row)
    dropPending(lastId)
  }, [dropPending])

  const flushPending = useCallback(async (): Promise<void> => {
    // Wave 6.5 — fire DELETEs for ALL pending rows in parallel.
    // Caller (typically `FavouritesScreen` useFocusEffect cleanup)
    // awaits so the invalidates reach React Query before the user
    // lands on the next tab.  Snapshot the entries first so
    // dropPending in each `fireDeleteFor`'s finally doesn't
    // mutate the array we're iterating.
    const entries: Array<{ rowId: string; spliced: { pageIndex: number; rowIndex: number; row: T } }> = []
    pendingMap.current.forEach((p, rowId) => {
      clearTimeout(p.timer)
      entries.push({ rowId, spliced: { pageIndex: p.pageIndex, rowIndex: p.rowIndex, row: p.row } })
    })
    if (entries.length === 0) return
    await Promise.all(entries.map(e => fireDeleteFor(e.rowId, e.spliced)))
  }, [fireDeleteFor])

  return { remove, undo, flushPending, isPending, error, clearError }
}
