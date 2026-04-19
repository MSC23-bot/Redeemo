import { useInfiniteQuery } from '@tanstack/react-query'
import { favouritesApi } from '@/lib/api/favourites'
import { useAuthStore } from '@/stores/auth'

const LIMIT = 20

export function useFavouriteMerchants() {
  const status = useAuthStore((s) => s.status)
  return useInfiniteQuery({
    queryKey: ['favouriteMerchants'],
    queryFn: ({ pageParam = 1 }) =>
      favouritesApi.getMerchants({ page: pageParam as number, limit: LIMIT }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const fetched = (lastPage.page - 1) * lastPage.limit + lastPage.items.length
      return fetched < lastPage.total ? lastPage.page + 1 : undefined
    },
    enabled: status === 'authed',
    staleTime: 30_000,
  })
}
