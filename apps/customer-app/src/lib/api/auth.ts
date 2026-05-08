import { z } from 'zod'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api } from '../api'

async function getDeviceId(): Promise<string> {
  const key = '@redeemo/deviceId'
  const stored = await AsyncStorage.getItem(key)
  if (stored) return stored
  const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
  await AsyncStorage.setItem(key, id)
  return id
}

function getDeviceType(): 'ios' | 'android' | 'web' {
  if (Platform.OS === 'ios') return 'ios'
  if (Platform.OS === 'android') return 'android'
  return 'web'
}

// `sessionId` is required: backend returns it in the issueCustomerTokens
// response (src/api/auth/customer/service.ts:88) and the refresh endpoint
// requires it on the request body
// (src/api/auth/customer/routes.ts:81-94). Surfacing it here is the
// 2026-05-08 hotfix that closes the latent contract gap behind the M3
// device-QA sign-out.
const authResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string().optional(),
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    emailVerified: z.boolean().default(false),
    phoneVerified: z.boolean().default(false),
    profileImageUrl: z.string().nullable().optional(),
  }),
  accessToken:  z.string(),
  refreshToken: z.string(),
  sessionId:    z.string(),
})
export type AuthResponse = z.infer<typeof authResponseSchema>

export const authApi = {
  register: async (data: { firstName: string; lastName: string; email: string; password: string; phone: string }) => {
    const deviceId = await getDeviceId()
    const deviceType = getDeviceType()
    return api.post<AuthResponse>('/api/v1/customer/auth/register', { ...data, deviceId, deviceType }).then(authResponseSchema.parse)
  },
  login: async (data: { email: string; password: string }) => {
    const deviceId = await getDeviceId()
    const deviceType = getDeviceType()
    return api.post<AuthResponse>('/api/v1/customer/auth/login', { ...data, deviceId, deviceType }).then(authResponseSchema.parse)
  },
  logout: (data: { refreshToken: string }) =>
    api.post<{ success: boolean }>('/api/v1/customer/auth/logout', data),
  // The interceptor in `api.ts` is the canonical refresh path — this
  // method exists for symmetry but is currently unused. Body shape mirrors
  // the backend contract: `{ refreshToken, sessionId, entityId }`.
  refresh: (data: { refreshToken: string; sessionId: string; entityId: string }) =>
    api.post<{ accessToken: string; refreshToken: string }>('/api/v1/customer/auth/refresh', data),
  sendPhoneOtp: (opts?: { phoneNumber?: string }) =>
    api.post<{ success: boolean }>(
      '/api/v1/customer/auth/verify-phone/send',
      opts?.phoneNumber ? { phoneNumber: opts.phoneNumber } : {},
    ),
  confirmPhoneOtp: (code: string) =>
    api.post<{ user: AuthResponse['user'] }>('/api/v1/customer/auth/verify-phone/confirm', { code }),
  resendEmailVerification: () =>
    api.post<{ success: boolean }>('/api/v1/customer/auth/resend-verification-email', {}),
  forgotPassword: (email: string) =>
    api.post<{ success: boolean }>('/api/v1/customer/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.post<{ success: boolean }>('/api/v1/customer/auth/reset-password', { token, password }),
  sendDeleteAccountOtp: () =>
    api.post<{ success: boolean }>('/api/v1/customer/auth/otp/send', { action: 'ACCOUNT_DELETION' }),
  verifyDeleteAccountOtp: (code: string) =>
    api.post<{ verified: boolean; actionToken: string; action: string }>(
      '/api/v1/customer/auth/otp/verify',
      { code, action: 'ACCOUNT_DELETION' },
    ),
  deleteAccount: (actionToken: string) =>
    api.post<{ message: string }>('/api/v1/customer/auth/delete-account', { actionToken }),
}
