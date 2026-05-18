import { useInfiniteQuery } from '@tanstack/react-query'
import { savingsApi } from '@/lib/api/savings'
import { useAuthStore } from '@/stores/auth'

const PAGE_SIZE = 20

// Pagination contract: backend returns `{ redemptions, total }`.  The
// next-page offset is the cumulative count of loaded rows; we keep
// fetching until that count reaches `total`. `total` is taken from the
// LAST page so we follow the live count if rows arrive between page
// fetches (an edge case in practice — total is the all-time count).
export function useSavingsRedemptions() {
  const status = useAuthStore((s) => s.status)
  const isAuthed = status === 'authed'

  return useInfiniteQuery({
    queryKey: ['savingsRedemptions'],
    queryFn: ({ pageParam }) =>
      savingsApi.getRedemptions({ limit: PAGE_SIZE, offset: pageParam as number }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.redemptions.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
    enabled:  isAuthed,
    staleTime: 60_000,
  })
}
