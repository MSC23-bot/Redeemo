/**
 * Phase 3C.1g M2.4 — `useFavouriteBranches` infinite query.
 *
 * Wraps `favouritesApi.getBranches` (M1.3 backend, M2.1 client).  The
 * cache key (`['favouriteBranches']`) is the same key that
 * `useFavourite` invalidates on heart-toggle success — so the
 * Favourites tab refetches automatically after any heart toggle on
 * Home / Search / Map / Category / Merchant Profile.
 *
 * Pagination uses the backend's `{ items, total, page, limit }` shape:
 * the next-page param is the page number (1, 2, …) and the cursor
 * stops when `page * limit >= total`.
 */

import { useInfiniteQuery } from '@tanstack/react-query'
import { favouritesApi } from '@/lib/api/favourites'
import { useAuthStore } from '@/stores/auth'

const PAGE_SIZE = 20

export function useFavouriteBranches() {
  const status   = useAuthStore((s) => s.status)
  const isAuthed = status === 'authed'

  return useInfiniteQuery({
    queryKey:         ['favouriteBranches'],
    queryFn:          ({ pageParam }) => favouritesApi.getBranches(pageParam as number, PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.limit
      return loaded < lastPage.total ? lastPage.page + 1 : undefined
    },
    enabled:  isAuthed,
    staleTime: 30_000,
  })
}
