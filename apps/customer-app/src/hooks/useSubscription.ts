import { useQuery } from '@tanstack/react-query'
import { subscriptionApi } from '@/lib/api/subscription'
import { useAuthStore } from '@/stores/auth'

export function useSubscription() {
  const status = useAuthStore((s) => s.status)
  const isAuthed = status === 'authed'

  const query = useQuery({
    queryKey: ['subscription'],
    queryFn: subscriptionApi.getMySubscription,
    enabled: isAuthed,
    staleTime: 60_000,
  })

  const subStatus = query.data?.status
  const isSubscribed =
    isAuthed && (subStatus === 'ACTIVE' || subStatus === 'TRIALLING')

  return {
    subscription: query.data ?? null,
    isSubscribed,
    isLoading: query.isLoading,
  }
}
