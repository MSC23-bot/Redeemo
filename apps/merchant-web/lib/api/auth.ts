import { z } from 'zod'
import { apiFetch, ApiError } from './client'

// M1 Slice 1: typed merchant-auth clients. The token-issuing flows go through the
// same-origin BFF route handlers (/api/merchant-auth/*) which set the httpOnly
// cookie; the public flows (forgot/reset/claim/resend) go DIRECT to the backend
// (they issue no tokens, so there is no cookie to manage) via apiFetch.

const merchantSchema = z.object({
  id: z.string(),
  businessName: z.string(),
  approvalStatus: z.string(),
})
export type SessionMerchant = z.infer<typeof merchantSchema>

const loginResultSchema = z.union([
  z.object({ status: z.literal('OTP_REQUIRED'), sessionChallenge: z.string() }),
  z.object({ accessToken: z.string(), merchant: merchantSchema }),
])
export type LoginResult = z.infer<typeof loginResultSchema>

const tokensResultSchema = z.object({ accessToken: z.string(), merchant: merchantSchema })
export type TokensResult = z.infer<typeof tokensResultSchema>

const verifySentSchema = z.object({ status: z.literal('VERIFY_EMAIL_SENT'), sessionChallenge: z.string() })
export type VerifySentResult = z.infer<typeof verifySentSchema>

const messageSchema = z.object({ message: z.string() })

export interface DeviceFields {
  deviceId: string
  deviceType: 'web'
  deviceName?: string
}

/** POST to a same-origin BFF route handler; throws ApiError on a non-2xx. */
async function bffPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`/api/merchant-auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data)
  return data
}

export const authApi = {
  async login(body: { email: string; password: string } & DeviceFields): Promise<LoginResult> {
    return loginResultSchema.parse(await bffPost('login', body))
  },

  async verifyOtp(body: { sessionChallenge: string; code: string }): Promise<TokensResult> {
    return tokensResultSchema.parse(await bffPost('otp-verify', body))
  },

  async register(
    body: {
      firstName: string
      lastName: string
      email: string
      mobile?: string
      mobileCountryCode?: string
      password: string
      businessName: string
      termsAccepted: true
      turnstileToken: string
    } & DeviceFields,
  ): Promise<VerifySentResult> {
    return verifySentSchema.parse(await bffPost('register', body))
  },

  async verifyEmail(body: { sessionChallenge: string; code: string }): Promise<TokensResult> {
    return tokensResultSchema.parse(await bffPost('register-verify', body))
  },

  async resendVerification(body: { sessionChallenge: string }): Promise<{ message: string }> {
    return messageSchema.parse(
      await apiFetch('/api/v1/merchant/auth/register/resend', { method: 'POST', body: JSON.stringify(body) }),
    )
  },

  async forgotPassword(body: { email: string }): Promise<{ message: string }> {
    return messageSchema.parse(
      await apiFetch('/api/v1/merchant/auth/forgot-password', { method: 'POST', body: JSON.stringify(body) }),
    )
  },

  async resetPassword(body: { token: string; newPassword: string }): Promise<{ message: string }> {
    return messageSchema.parse(
      await apiFetch('/api/v1/merchant/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }),
    )
  },

  async claim(body: { token: string; newPassword: string }): Promise<{ message: string }> {
    return messageSchema.parse(
      await apiFetch('/api/v1/merchant/auth/claim', { method: 'POST', body: JSON.stringify(body) }),
    )
  },

  /** Best-effort: forward the in-memory access token so the backend can revoke. */
  async logout(token: string | null): Promise<void> {
    await fetch('/api/merchant-auth/logout', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }).catch(() => {})
  },
}
