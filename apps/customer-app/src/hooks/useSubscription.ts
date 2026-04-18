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
  // PAST_DUE is intentionally excluded — the backend redemption guard rejects it;
  // the user sees the subscribe CTA so they can update their payment method.
  const isSubscribed =
    isAuthed && (subStatus === 'ACTIVE' || subStatus === 'TRIALLING')

  return {
    subscription: query.data ?? null,
    isSubscribed,
    // isSubLoading is true during the first fetch — consuming screens should suppress
    // subscription-gated UI while loading to avoid a flash of the wrong state.
    isSubLoading: isAuthed && query.isLoading,
  }
}
