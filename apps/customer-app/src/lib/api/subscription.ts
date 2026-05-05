import { z } from 'zod'
import { api } from '../api'

const subscriptionPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  billingInterval: z.enum(['MONTHLY', 'ANNUAL']),
  // `z.coerce.number()` (not `z.number()`) because the backend serialises
  // SubscriptionPlan.priceGbp from Prisma's `Decimal` type, which becomes
  // a JSON STRING (e.g. "6.99") rather than a number when Fastify's
  // default JSON serialiser runs. A bare `z.number()` rejects the string
  // → safeParse fails → the api client returns null → `useSubscription`
  // reports `isSubscribed: false` even for ACTIVE subscribers, and the
  // user sees the FreeUserGate modal on every voucher tap. `z.coerce.number()`
  // accepts both string and number inputs, so it's safe regardless of how
  // the backend ever changes its serialisation.
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
