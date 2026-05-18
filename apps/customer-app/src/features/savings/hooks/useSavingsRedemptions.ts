import { useInfiniteQuery } from '@tanstack/react-query'
import { savingsApi } from '@/lib/api/savings'
import { useAuthStore } from '@/stores/auth'

const PAGE_SIZE = 20

// Pagination contract: backend returns `{ redemptions, total }`.  The
// next-page offset is the cumulative count of loaded rows; we keep
// fetching until that count reaches `total`. `total` is taken from the
// LAST page so we follow the live count if rows arrive between page
// fetches.
//
// §BN Revision-3 (2026-05-18) — optional `selectedMonth: 'YYYY-MM' |
// null` scopes the fetch to that calendar month.  Re-keyed on month
// so cache entries for different months stay isolated and don't
// cross-contaminate.  `total` reflects the month-scoped count when
// supplied, driving the "Load more" pill correctly under month scope.
//
// When `selectedMonth` is null the hook behaves identically to its
// Revision-2 form — all-time fetch, paginated.
export function useSavingsRedemptions(selectedMonth: string | null = null) {
  const status = useAuthStore((s) => s.status)
  const isAuthed = status === 'authed'

  return useInfiniteQuery({
    queryKey: ['savingsRedemptions', selectedMonth],
    queryFn: ({ pageParam }) =>
      savingsApi.getRedemptions({
        limit:  PAGE_SIZE,
        offset: pageParam as number,
        // Omit `month` entirely when null so the URL keeps its all-
        // time shape — match the api-client conditional-include
        // pattern.
        ...(selectedMonth ? { month: selectedMonth } : {}),
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.redemptions.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
    enabled:  isAuthed,
    staleTime: 60_000,
  })
}
