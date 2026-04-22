import { useQuery } from '@tanstack/react-query'
import { supportApi } from '@/lib/api/support'

export function useSupportTickets() {
  return useQuery({
    queryKey: ['support-tickets'],
    queryFn: () => supportApi.list(),
  })
}

export function useSupportTicketDetail(id: string | null) {
  return useQuery({
    queryKey: ['support-ticket', id],
    queryFn: () => supportApi.get(id!),
    enabled: !!id,
  })
}
