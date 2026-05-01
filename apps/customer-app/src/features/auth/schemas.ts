import { z } from 'zod'

export const passwordSchema = z.string()
  .min(8, 'Password must include uppercase, lowercase, a number, and a special character.')
  .regex(/[A-Z]/, 'Password must include uppercase, lowercase, a number, and a special character.')
  .regex(/[a-z]/, 'Password must include uppercase, lowercase, a number, and a special character.')
  .regex(/\d/, 'Password must include uppercase, lowercase, a number, and a special character.')
  .regex(/[^A-Za-z0-9]/, 'Password must include uppercase, lowercase, a number, and a special character.')

export const registerSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Enter a valid email'),
  password: passwordSchema,
  phone: z.string().regex(/^\+\d{8,15}$/, 'Enter a valid phone including country code'),
})
export type RegisterInput = z.infer<typeof registerSchema>
