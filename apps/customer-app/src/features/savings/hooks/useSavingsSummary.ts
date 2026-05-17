import { useQuery } from '@tanstack/react-query'
import { savingsApi } from '@/lib/api/savings'
import { useAuthStore } from '@/stores/auth'

// React-Query staleTime of 60 seconds matches the conservative
// per-feature default used by `useSubscription`, `useCustomerVoucher`,
// and other authenticated reads.  Lifetime + this-month aggregates
// don't change between every tap of the Savings tab; staleTime gives
// us crash-free re-mount + free pull-to-refresh + reasonable
// freshness without hammering the backend on every focus.
export function useSavingsSummary() {
  const status = useAuthStore((s) => s.status)
  const isAuthed = status === 'authed'
  return useQuery({
    queryKey: ['savingsSummary'],
    queryFn:  () => savingsApi.getSummary(),
    enabled:  isAuthed,
    staleTime: 60_000,
  })
}
