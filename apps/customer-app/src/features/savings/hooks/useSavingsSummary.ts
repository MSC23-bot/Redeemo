import { useQuery } from '@tanstack/react-query'
import { savingsApi } from '@/lib/api/savings'
import { useAuthStore } from '@/stores/auth'

export function useSavingsSummary() {
  const status = useAuthStore((s) => s.status)
  const isAuthed = status === 'authed'
  return useQuery({
    queryKey: ['savingsSummary'],
    queryFn: savingsApi.getSummary,
    enabled: isAuthed,
    staleTime: 60_000,
  })
}
