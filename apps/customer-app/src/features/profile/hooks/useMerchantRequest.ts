import { useMutation } from '@tanstack/react-query'
import { merchantRequestsApi } from '@/lib/api/merchant-requests'

export function useMerchantRequest() {
  return useMutation({
    mutationFn: merchantRequestsApi.create,
  })
}
