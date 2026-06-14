/**
 * Admin auth API.
 *
 * Thin, typed wrappers over the M0 admin auth endpoints
 * (prefix `/api/v1/admin/auth`). Request shapes match
 * `src/api/auth/admin/routes.ts`; responses are validated with Zod so a
 * contract drift surfaces as a clear error rather than an undefined-field crash.
 *
 *   POST /login        { email, password, deviceId, deviceType }
 *                        -> { status: 'OTP_REQUIRED', sessionChallenge }
 *   POST /otp/verify   { sessionChallenge, code }   (code is exactly 6 digits)
 *                        -> { accessToken, refreshToken, admin: { id, email, adminRole } }
 *   POST /refresh      { refreshToken, sessionId, entityId }
 *                        -> { accessToken, refreshToken }
 *   POST /logout       (bearer)  -> { message }
 */
import { z } from 'zod'
import { apiFetch } from './client'
import { getOrCreateDeviceId, getRefreshToken, getSessionMeta } from '@/lib/auth/session'

// The admin login body requires the shared `deviceSchema` fields. deviceType
// must be one of ios | android | web, so web is the right value for the panel.
const DEVICE_TYPE = 'web' as const

// ── Response schemas ──────────────────────────────────────────────────────────

const loginResponseSchema = z.object({
  status: z.literal('OTP_REQUIRED'),
  sessionChallenge: z.string().min(1),
})
export type LoginResponse = z.infer<typeof loginResponseSchema>

const adminRoleSchema = z.enum([
  'SUPER_ADMIN',
  'OPERATIONS',
  'FINANCE',
  'CONTENT',
  'SUPPORT',
])

const verifyOtpResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  admin: z.object({
    id: z.string().min(1),
    email: z.string().email(),
    adminRole: adminRoleSchema,
  }),
})
export type VerifyOtpResponse = z.infer<typeof verifyOtpResponseSchema>

const refreshResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
})
export type RefreshResponse = z.infer<typeof refreshResponseSchema>

const messageResponseSchema = z.object({ message: z.string() })

// ── API calls ─────────────────────────────────────────────────────────────────

export const authApi = {
  /** Step 1: credentials. Returns the OTP challenge to carry into step 2. */
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const raw = await apiFetch<unknown>('/api/v1/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        deviceId: getOrCreateDeviceId(),
        deviceType: DEVICE_TYPE,
      }),
    })
    return loginResponseSchema.parse(raw)
  },

  /** Step 2: the 6-digit emailed code. Returns tokens + the admin record. */
  verifyOtp: async (
    sessionChallenge: string,
    code: string
  ): Promise<VerifyOtpResponse> => {
    const raw = await apiFetch<unknown>('/api/v1/admin/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ sessionChallenge, code }),
    })
    return verifyOtpResponseSchema.parse(raw)
  },

  /**
   * Rotate tokens using the stored refresh token + session meta. Exposed for
   * completeness; the client wrapper performs its own inline refresh on 401.
   */
  refresh: async (): Promise<RefreshResponse> => {
    const refreshToken = getRefreshToken()
    const meta = getSessionMeta()
    if (!refreshToken || !meta) {
      throw new Error('No admin session to refresh')
    }
    const raw = await apiFetch<unknown>('/api/v1/admin/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken,
        sessionId: meta.sessionId,
        entityId: meta.entityId,
      }),
    })
    return refreshResponseSchema.parse(raw)
  },

  /** Revoke the current session server-side. Best-effort on the client. */
  logout: async (): Promise<{ message: string }> => {
    const raw = await apiFetch<unknown>('/api/v1/admin/auth/logout', {
      method: 'POST',
      auth: true,
    })
    return messageResponseSchema.parse(raw)
  },
}
