import { useQuery } from '@tanstack/react-query'
import { savingsApi } from '@/lib/api/savings'
import { useAuthStore } from '@/stores/auth'

export function useMonthlyDetail(month: string | null) {
  const status = useAuthStore((s) => s.status)
  const isAuthed = status === 'authed'

  return useQuery({
    queryKey: ['monthlyDetail', month],
    queryFn: () => savingsApi.getMonthlyDetail(month!),
    enabled: isAuthed && month !== null,
    staleTime: 60_000,
  })
}
