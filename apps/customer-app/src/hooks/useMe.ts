import { useQuery } from '@tanstack/react-query'
import { profileApi } from '@/lib/api/profile'

export const meQueryKey = ['me'] as const

export function useMe() {
  return useQuery({ queryKey: meQueryKey, queryFn: () => profileApi.getMe(), staleTime: 5 * 60 * 1000 })
}
