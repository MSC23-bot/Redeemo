import { z } from 'zod'
import { api } from '../api'

const subscriptionPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  billingInterval: z.enum(['MONTHLY', 'ANNUAL']),
  priceGbp: z.coerce.number(),
})

const subscriptionSchema = z.object({
  id: z.string(),
  status: z.enum(['TRIALLING', 'ACTIVE', 'CANCELLED', 'EXPIRED', 'PAST_DUE']),
  currentPeriodStart: z.string().nullable(),
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  plan: subscriptionPlanSchema,
  promoCodeId: z.string().nullable().optional(),
})

export type Subscription = z.infer<typeof subscriptionSchema>

export const subscriptionApi = {
  getMySubscription: () =>
    api.get<unknown>('/api/v1/subscription/me').then((data) => {
      if (!data) return null
      const result = subscriptionSchema.safeParse(data)
      return result.success ? result.data : null
    }),
  cancel: () => api.del<{ success: boolean }>('/api/v1/subscription'),
}
