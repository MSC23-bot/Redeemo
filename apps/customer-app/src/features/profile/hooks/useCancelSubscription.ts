import { useMutation, useQueryClient } from '@tanstack/react-query'
import { subscriptionApi } from '@/lib/api/subscription'

export function useCancelSubscription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => subscriptionApi.cancel(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
    },
  })
}
