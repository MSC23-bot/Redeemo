/**
 * Phase 3C.1g M2.4 — `useFavouriteVouchers` infinite query.
 *
 * Wraps `favouritesApi.getVouchers` (existing route, M2.1 client).
 *
 * The cache key (`['favouriteVouchers']`) is invalidated by:
 *   - `useFavourite({ type: 'voucher', ... })` heart toggles
 *     (M2.2 contract).
 *   - `useRedeem.onSuccess` (existing — `apps/customer-app/src/features/voucher/hooks/useRedeem.ts`).
 * so the Favourites Vouchers tab refetches after both heart toggles
 * and voucher redemptions.
 *
 * Server-side global sort (spec §9.3) — the customer-app renders pages
 * in server-returned order; the list invariant is "no client-side
 * re-sort".  Pinned at the screen level in M2.5
 * (`vouchers-server-sort.test.tsx`).
 */

import { useInfiniteQuery } from '@tanstack/react-query'
import { favouritesApi } from '@/lib/api/favourites'
import { useAuthStore } from '@/stores/auth'

const PAGE_SIZE = 20

export function useFavouriteVouchers() {
  const status   = useAuthStore((s) => s.status)
  const isAuthed = status === 'authed'

  return useInfiniteQuery({
    queryKey:         ['favouriteVouchers'],
    queryFn:          ({ pageParam }) => favouritesApi.getVouchers(pageParam as number, PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.limit
      return loaded < lastPage.total ? lastPage.page + 1 : undefined
    },
    enabled:  isAuthed,
    staleTime: 30_000,
  })
}
