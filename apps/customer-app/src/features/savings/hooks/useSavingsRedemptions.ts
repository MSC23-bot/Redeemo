import { useInfiniteQuery } from '@tanstack/react-query'
import { savingsApi } from '@/lib/api/savings'
import { useAuthStore } from '@/stores/auth'

const PAGE_SIZE = 20

export function useSavingsRedemptions() {
  const status = useAuthStore((s) => s.status)
  const isAuthed = status === 'authed'

  return useInfiniteQuery({
    queryKey: ['savingsRedemptions'],
    queryFn: ({ pageParam = 0 }) =>
      savingsApi.getRedemptions({ limit: PAGE_SIZE, offset: pageParam as number }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.redemptions.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
    enabled: isAuthed,
    staleTime: 60_000,
  })
}
