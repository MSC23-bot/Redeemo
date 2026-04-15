import { z } from 'zod'
import { api } from '../api'

const authResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    phone: z.string().nullable(),
    emailVerifiedAt: z.string().nullable(),
    phoneVerifiedAt: z.string().nullable(),
  }),
  accessToken: z.string(),
  refreshToken: z.string(),
})
export type AuthResponse = z.infer<typeof authResponseSchema>

export const authApi = {
  register: (data: { firstName: string; lastName: string; email: string; password: string; phone: string }) =>
    api.post<AuthResponse>('/api/v1/customer/auth/register', data).then(authResponseSchema.parse),
  login: (data: { email: string; password: string }) =>
    api.post<AuthResponse>('/api/v1/customer/auth/login', data).then(authResponseSchema.parse),
  logout: (data: { refreshToken: string }) =>
    api.post<{ success: boolean }>('/api/v1/customer/auth/logout', data),
  refresh: (refreshToken: string) =>
    api.post<{ accessToken: string; refreshToken: string }>('/api/v1/customer/auth/refresh', { refreshToken }),
  sendPhoneOtp: () =>
    api.post<{ success: boolean }>('/api/v1/customer/auth/verify-phone/send', {}),
  confirmPhoneOtp: (code: string) =>
    api.post<{ user: AuthResponse['user'] }>('/api/v1/customer/auth/verify-phone/confirm', { code }),
  resendEmailVerification: () =>
    api.post<{ success: boolean }>('/api/v1/customer/auth/resend-verification-email', {}),
  forgotPassword: (email: string) =>
    api.post<{ success: boolean }>('/api/v1/customer/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.post<{ success: boolean }>('/api/v1/customer/auth/reset-password', { token, password }),
}
