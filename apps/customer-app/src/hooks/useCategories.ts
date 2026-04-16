import { useQuery } from '@tanstack/react-query'
import { discoveryApi, Category } from '@/lib/api/discovery'

export function useCategories() {
  return useQuery<{ categories: Category[] }>({
    queryKey: ['categories'],
    queryFn: () => discoveryApi.getCategories(),
    staleTime: 30 * 60 * 1000,
  })
}
