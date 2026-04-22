import { z } from 'zod'
import { api } from '../api'

const createResponseSchema = z.object({
  success: z.boolean(),
  id: z.string(),
})

export type MerchantRequestCreateResponse = z.infer<typeof createResponseSchema>

export const merchantRequestsApi = {
  create: (data: { businessName: string; location: string; note?: string }) =>
    api.post<unknown>('/api/v1/customer/merchant-requests', data).then(createResponseSchema.parse),
}
