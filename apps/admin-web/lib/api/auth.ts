/**
 * Admin auth API.
 *
 * H5 migration: the token-issuing flows (login, otp/verify, logout) now go
 * through the same-origin BFF route handlers (`/api/admin-auth/*`,
 * `app/api/admin-auth/**`) instead of hitting the backend directly. The BFF
 * parks the refresh token in an httpOnly cookie server-side and returns ONLY
 * the short-lived access token + non-sensitive session meta to the browser —
 * the refresh token never reaches page JS. Response shapes match the BFF
 * routes, not the raw backend contract (see `lib/auth/bff.ts` `completeBffLogin`
 * for how `{ accessToken, refreshToken, admin }` becomes `{ accessToken, meta }`).
 *
 *   POST /api/admin-auth/login       { email, password, deviceId, deviceType }
 *                                     -> { status: 'OTP_REQUIRED', sessionChallenge }
 *   POST /api/admin-auth/otp-verify  { sessionChallenge, code }   (code is exactly 6 digits)
 *                                     -> { accessToken, meta: { entityId, sessionId, adminRole, email } }
 *   POST /api/admin-auth/logout      (Bearer forwarded when present, no body)
 *                                     -> { ok, remoteRevoke }
 *
 * Refresh (POST /api/admin-auth/refresh -> { accessToken }) is owned by the
 * client wrapper's inline 401 handler (lib/api/client.ts `doRefresh`); it is
 * bodyless (cookie-borne) so there is no request schema to validate here.
 */
import { z } from 'zod'
import { ApiError } from './client'
import { getOrCreateDeviceId, type AdminSessionMeta } from '@/lib/auth/session'

// The admin login body requires the shared `deviceSchema` fields. deviceType
// must be one of ios | android | web, so web is the right value for the panel.
const DEVICE_TYPE = 'web' as const

// ── Response schemas ──────────────────────────────────────────────────────────

// Team & Roles S1/S3: includes FIELD (a fully assignable base role) so a rep
// account's login/otp-verify response parses cleanly. FIELD login is gated on
// email enablement elsewhere (#477) — this schema only needs to accept the
// value, not enable the flow. Keep aligned with AdminRole in lib/auth/session.ts.
const adminRoleSchema = z.enum(['SUPER_ADMIN', 'OPERATIONS', 'FINANCE', 'CONTENT', 'SUPPORT', 'FIELD'])

const metaSchema = z.object({
  entityId: z.string().min(1),
  sessionId: z.string().min(1),
  adminRole: adminRoleSchema,
  email: z.string().email(),
})

const otpRequiredSchema = z.object({
  status: z.literal('OTP_REQUIRED'),
  sessionChallenge: z.string().min(1),
})

const tokensSchema = z.object({
  accessToken: z.string().min(1),
  meta: metaSchema,
})

const loginResultSchema = z.union([otpRequiredSchema, tokensSchema])
export type LoginResult = z.infer<typeof loginResultSchema>

const verifyOtpResponseSchema = tokensSchema
export type VerifyOtpResponse = z.infer<typeof verifyOtpResponseSchema>

// ── BFF helper ────────────────────────────────────────────────────────────────

/** POST to a same-origin BFF route handler; throws ApiError on a non-2xx. */
async function bffPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`/api/admin-auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data)
  return data
}

// ── API calls ─────────────────────────────────────────────────────────────────

export interface LogoutResult {
  ok: boolean
  status: number
  remoteRevoke: 'confirmed' | 'unavailable'
  error?: unknown
}

export const authApi = {
  /** Step 1: credentials. Returns the OTP challenge to carry into step 2. */
  login: async (email: string, password: string): Promise<LoginResult> => {
    return loginResultSchema.parse(
      await bffPost('login', {
        email,
        password,
        deviceId: getOrCreateDeviceId(),
        deviceType: DEVICE_TYPE,
      }),
    )
  },

  /** Step 2: the 6-digit emailed code. Returns the access token + session meta. */
  verifyOtp: async (sessionChallenge: string, code: string): Promise<VerifyOtpResponse> => {
    return verifyOtpResponseSchema.parse(await bffPost('otp-verify', { sessionChallenge, code }))
  },

  /**
   * Forward the captured access token (G2 — captured by the caller BEFORE its
   * own state reset) so the BFF/backend can revoke the session. Does NOT
   * swallow errors/aborts: the caller (signOut) needs to distinguish a
   * confirmed 2xx from a timeout/failure. Accepts an AbortSignal so the
   * caller can bound the wait.
   */
  logout: async (token: string | null, signal?: AbortSignal): Promise<LogoutResult> => {
    try {
      const res = await fetch('/api/admin-auth/logout', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal,
      })
      const data = (await res.json().catch(() => null)) as { remoteRevoke?: string } | null
      const remoteRevoke = data?.remoteRevoke === 'confirmed' ? 'confirmed' : 'unavailable'
      return { ok: res.ok, status: res.status, remoteRevoke }
    } catch (err) {
      // Network failure, timeout, or abort — surface it, don't swallow. The
      // caller treats this identically to a non-2xx: cookie clearance is
      // UNCONFIRMED.
      return { ok: false, status: 0, remoteRevoke: 'unavailable', error: err }
    }
  },
}

export type { AdminSessionMeta }
