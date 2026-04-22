import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supportApi } from '@/lib/api/support'

export function useCreateTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: supportApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] })
    },
  })
}
