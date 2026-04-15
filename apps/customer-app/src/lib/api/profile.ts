import { z } from 'zod'
import { api } from '../api'

const interestSchema = z.object({ id: z.string(), name: z.string() })

const profileSchema = z.object({
  id: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().email(),
  phone: z.string().nullable(),
  profileImageUrl: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  gender: z.string().nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  postcode: z.string().nullable(),
  newsletterConsent: z.boolean(),
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
  interests: z.array(interestSchema),
  profileCompleteness: z.number(),
  createdAt: z.string(),
})
export type Profile = z.infer<typeof profileSchema>

export type ProfileUpdate = Partial<{
  name: string
  dateOfBirth: string
  gender: string
  addressLine1: string
  addressLine2: string
  city: string
  postcode: string
  profileImageUrl: string | null
  newsletterConsent: boolean
}>

export const profileApi = {
  getMe: () => api.get<unknown>('/api/v1/customer/profile').then(profileSchema.parse),
  updateProfile: (patch: ProfileUpdate) => api.patch<unknown>('/api/v1/customer/profile', patch).then(profileSchema.parse),
  getAvailableInterests: () => api.get<{ interests: { id: string; name: string }[] }>('/api/v1/customer/profile/available-interests'),
  updateInterests: (interestIds: string[]) => api.put<{ interests: { id: string; name: string }[] }>('/api/v1/customer/profile/interests', { interestIds }),
}
