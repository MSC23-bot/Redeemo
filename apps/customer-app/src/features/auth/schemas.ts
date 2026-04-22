import { z } from 'zod'

export const passwordSchema = z.string()
  .min(8, 'Use at least 8 characters')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/\d/, 'Include a number')

export const registerSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Enter a valid email'),
  password: passwordSchema,
  phone: z.string().regex(/^\+\d{8,15}$/, 'Enter a valid phone including country code'),
})
export type RegisterInput = z.infer<typeof registerSchema>
