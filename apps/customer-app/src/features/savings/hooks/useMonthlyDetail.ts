import { useQuery } from '@tanstack/react-query'
import { savingsApi } from '@/lib/api/savings'
import { useAuthStore } from '@/stores/auth'

// Disabled when `month === null` (the current-month / no-drill-down
// state).  React Query will not fire the request, and `.data` stays
// `undefined`.  Caller renders the summary's own this-month aggregate
// in that case.
export function useMonthlyDetail(month: string | null) {
  const status = useAuthStore((s) => s.status)
  const isAuthed = status === 'authed'

  return useQuery({
    queryKey: ['monthlyDetail', month],
    queryFn:  () => savingsApi.getMonthlyDetail(month!),
    enabled:  isAuthed && month !== null,
    staleTime: 60_000,
  })
}
